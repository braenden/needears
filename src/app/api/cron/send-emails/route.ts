import { createHash } from "node:crypto";
import { EMAILS_PER_DAY, EMAILS_PER_RUN } from "@/config/email";
import { siteUrl } from "@/config/site";
import { isCronRequest } from "@/lib/api/cron";
import { jsonError } from "@/lib/api/http";
import { renderDigest, type DigestItem } from "@/lib/email/digest";
import { createAdminClient } from "@/lib/supabase/admin";

// Sends one email per person with the comments, replies and Helpful marks
// they have not been emailed about, within the hourly and daily limits in
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

  for (const row of batch.data) {
    const email = renderDigest(
      row.items as unknown as DigestItem[],
      row.total,
      base,
    );

    if (apiKey && from) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // A retried run cannot send the same email twice.
          "Idempotency-Key": createHash("sha256")
            .update(row.queue_ids.join(","))
            .digest("hex"),
        },
        body: JSON.stringify({ from, to: [row.email], ...email }),
      });
      // Quota or provider trouble: stop, the rest waits for the next run.
      if (response.status === 429 || response.status >= 500) {
        console.error("Email provider unavailable", response.status);
        break;
      }
      // Refused for good (for example an address it does not accept):
      // count the attempt and move on, so one email cannot block the queue.
      if (!response.ok) {
        console.error("Email provider refused an email", response.status);
        await admin.rpc("mark_emails_failed", { p_ids: row.queue_ids });
        failed += 1;
        continue;
      }
    } else {
      console.info(`[email] ${email.subject}\n${email.text}`);
    }

    const marked = await admin.rpc("mark_emails_sent", {
      p_ids: row.queue_ids,
    });
    if (marked.error)
      console.error("Could not mark emails sent", marked.error.code);
    sent += 1;
  }

  return Response.json(
    { sent, failed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
