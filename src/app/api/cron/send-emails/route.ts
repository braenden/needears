import { EMAILS_PER_RUN } from "@/config/email";
import { siteUrl } from "@/config/site";
import { isCronRequest } from "@/lib/api/cron";
import { jsonError } from "@/lib/api/http";
import { renderDigest, type DigestItem } from "@/lib/email/digest";
import { createAdminClient } from "@/lib/supabase/admin";

// Sends one email per person with the comments, replies and Helpful marks
// they have not been emailed about, at most EMAILS_PER_RUN people per run.
// Called every hour with `Authorization: Bearer $CRON_SECRET`. Without
// RESEND_API_KEY (local development) it logs the emails instead of sending.
export async function GET(request: Request) {
  if (!isCronRequest(request))
    return jsonError(401, "unauthorized", "Not allowed.");

  const admin = createAdminClient();
  const batch = await admin.rpc("email_batch", { p_limit: EMAILS_PER_RUN });
  if (batch.error)
    return jsonError(500, "email_failed", "Could not read the queue.");

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const base = siteUrl();
  let sent = 0;

  for (const row of batch.data) {
    const email = renderDigest(row.items as unknown as DigestItem[], base);

    if (apiKey && from) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [row.email], ...email }),
      });
      // Over the daily quota or failing: stop, the rest waits for the next run.
      if (!response.ok) {
        console.error("Email provider refused a send", response.status);
        break;
      }
    } else {
      console.info(`[email] ${email.subject}\n${email.text}`);
    }

    const marked = await admin.rpc("mark_emails_sent", {
      p_ids: row.queue_ids,
    });
    if (marked.error)
      return jsonError(500, "email_failed", "Could not update the queue.");
    sent += 1;
  }

  return Response.json({ sent }, { headers: { "Cache-Control": "no-store" } });
}
