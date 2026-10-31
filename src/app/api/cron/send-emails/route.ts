import { createHash } from "node:crypto";
import { EMAILS_PER_DAY, EMAILS_PER_RUN } from "@/config/email";
import { site, siteUrl } from "@/config/site";
import { isCronRequest } from "@/lib/api/cron";
import { jsonError } from "@/lib/api/http";
import { renderDigest, type DigestItem } from "@/lib/email/digest";
import {
  renderSecurityEmail,
  type SecurityKind,
  type SecurityPayload,
} from "@/lib/email/security";
import { createAdminClient } from "@/lib/supabase/admin";

// Sends account security emails (a sign in method added or removed), then
// one email per person with the comments, replies and Helpful marks they
// have not been emailed about, within the hourly and daily limits in
// src/config/email.ts. Called every hour with
// `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  if (!isCronRequest(request))
    return jsonError(401, "unauthorized", "Not allowed.");

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const deployed = ["production", "preview"].includes(
    process.env.VERCEL_ENV ?? "",
  );
  // Without the provider in a deployment, do nothing: the emails wait.
  // Locally, they are printed instead of sent.
  if ((!apiKey || !from) && deployed)
    return jsonError(500, "email_not_configured", "Email is not configured.");

  const admin = createAdminClient();
  const batch = await admin.rpc("email_batch", {
    p_limit: EMAILS_PER_RUN,
    p_daily_budget: EMAILS_PER_DAY,
  });
  if (batch.error)
    return jsonError(500, "email_failed", "Could not read the queue.");

  const base = siteUrl();
  let sent = 0;
  let failed = 0;
  let stopped = false;

  type Email = { subject: string; text: string; html: string };

  // Sends one email and records the outcome. Returns false when the run
  // should stop (quota or provider trouble; the rest waits for the next
  // run). An email the provider refuses for good counts an attempt, so one
  // address cannot block the queue.
  async function deliver(to: string, ids: number[], email: Email) {
    if (apiKey && from) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // A retried run cannot send the same email twice.
          "Idempotency-Key": createHash("sha256")
            .update(ids.join(","))
            .digest("hex"),
        },
        body: JSON.stringify({ from, to: [to], ...email }),
      });
      if (response.status === 429 || response.status >= 500) {
        console.error("Email provider unavailable", response.status);
        return false;
      }
      if (!response.ok) {
        console.error("Email provider refused an email", response.status);
        await admin.rpc("mark_emails_failed", { p_ids: ids });
        failed += 1;
        return true;
      }
    } else {
      console.info(`[email] ${email.subject}\n${email.text}`);
    }

    const marked = await admin.rpc("mark_emails_sent", { p_ids: ids });
    if (marked.error)
      console.error("Could not mark emails sent", marked.error.code);
    sent += 1;
    return true;
  }

  // Account security first: a sign in method added or removed.
  const security = await admin.rpc("security_email_batch", {
    p_limit: EMAILS_PER_RUN,
  });
  if (security.error)
    return jsonError(500, "email_failed", "Could not read the queue.");
  for (const row of security.data) {
    const email = renderSecurityEmail(
      row.kind as SecurityKind,
      row.payload as SecurityPayload,
      base,
      site.contactEmail,
    );
    if (!(await deliver(row.email, [row.queue_id], email))) {
      stopped = true;
      break;
    }
  }

  for (const row of stopped ? [] : batch.data) {
    const email = renderDigest(
      row.items as unknown as DigestItem[],
      row.total,
      base,
    );
    if (!(await deliver(row.email, row.queue_ids, email))) break;
  }

  return Response.json(
    { sent, failed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
