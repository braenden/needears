import { createHash } from "node:crypto";
import { EMAILS_PER_DAY, EMAILS_PER_RUN } from "@/config/email";
import { site, siteUrl } from "@/config/site";
import { isCronRequest } from "@/lib/api/cron";
import { jsonError } from "@/lib/api/http";
import {
  renderSecurityEmail,
  type SecurityKind,
  type SecurityPayload,
} from "@/lib/email/security";
import { createAdminClient } from "@/lib/supabase/admin";

// Sends account security emails (a sign in method added or removed, the
// email address changed), within the hourly and daily limits in
// src/config/email.ts. Comments, replies and Helpful marks are not emailed;
// they are notifications on the site only. Called every hour with
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
  const base = siteUrl();
  let sent = 0;
  let failed = 0;
  // Set when the provider is over quota or failing: the rest waits.
  let providerDown = false;

  type Email = { subject: string; text: string; html: string };

  // Sends one email to each recipient, then records the outcome for the
  // queue rows. An email the provider refuses for good counts an attempt,
  // so one address cannot block the queue.
  async function deliver(recipients: string[], ids: number[], email: Email) {
    if (apiKey && from) {
      let refused = false;
      for (const to of recipients) {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            // A retried run cannot send the same email twice.
            "Idempotency-Key": createHash("sha256")
              .update(`${ids.join(",")}:${to}`)
              .digest("hex"),
          },
          body: JSON.stringify({ from, to: [to], ...email }),
        });
        if (response.status === 429 || response.status >= 500) {
          console.error("Email provider unavailable", response.status);
          providerDown = true;
          return;
        }
        if (!response.ok) {
          console.error("Email provider refused an email", response.status);
          refused = true;
        }
      }
      if (refused) {
        await admin.rpc("mark_emails_failed", { p_ids: ids });
        failed += 1;
        return;
      }
    } else {
      console.info(`[email] ${email.subject}\n${email.text}`);
    }

    const marked = await admin.rpc("mark_emails_sent", {
      p_ids: ids,
      p_sends: recipients.length,
    });
    if (marked.error)
      console.error("Could not mark emails sent", marked.error.code);
    sent += 1;
  }

  try {
    const security = await admin.rpc("security_email_batch", {
      p_limit: EMAILS_PER_RUN,
      p_daily_budget: EMAILS_PER_DAY,
    });
    if (security.error) throw new Error(security.error.code);
    for (const row of security.data) {
      if (providerDown) break;
      const email = renderSecurityEmail(
        row.kind as SecurityKind,
        row.payload as SecurityPayload,
        base,
        site.contactEmail,
      );
      await deliver(row.recipients, [row.queue_id], email);
    }
  } catch (error) {
    console.error("Security emails failed", error);
  }

  return Response.json(
    { sent, failed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
