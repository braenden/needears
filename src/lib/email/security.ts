// Emails about the account itself. They go out whatever the notification
// setting is, one per change.

export type SecurityKind =
  "identity_linked" | "identity_unlinked" | "email_changed";

export type SecurityPayload = {
  provider?: string;
  email?: string;
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

const PROVIDERS: Record<string, string> = {
  google: "Google",
  email: "Email",
};

// "Google (nora@example.com)", from what the sign in provider reported.
function method(payload: SecurityPayload): string {
  const provider = payload.provider ?? "";
  const name =
    PROVIDERS[provider] ??
    (/^[a-z0-9_-]{1,30}$/.test(provider) ? provider : "Another provider");
  const address = cleanAddress(payload.email ?? "");
  return address ? `${name} (${address})` : name;
}

function cleanAddress(value: string): string {
  return value.replace(/[^\w.+@-]/g, "").slice(0, 254);
}

export function renderSecurityEmail(
  kind: SecurityKind,
  payload: SecurityPayload,
  base: string,
  contactEmail: string,
) {
  const settings = `${base}/settings`;
  let subject: string;
  let lead: string;

  if (kind === "email_changed") {
    const address = cleanAddress(payload.email ?? "");
    subject = "The email address on your account was changed";
    lead = address
      ? `The email address on your Need Ears account is now ${address}.`
      : "The email address on your Need Ears account was changed.";
  } else {
    const added = kind === "identity_linked";
    const what = method(payload);
    subject = added
      ? "A new way to sign in was added to your account"
      : "A way to sign in was removed from your account";
    lead = added
      ? `${what} can now be used to sign in to your Need Ears account.`
      : `${what} can no longer be used to sign in to your Need Ears account.`;
  }

  const check = "If this was you, there is nothing to do.";
  const help = `If it wasn't, sign in and check your account in your settings, and write to us at ${contactEmail}.`;

  const text = [lead, "", check, help, "", settings].join("\n");
  const html = [
    `<p>${escapeHtml(lead)}</p>`,
    `<p>${escapeHtml(check)} If it wasn't, sign in and check your account in <a href="${escapeHtml(settings)}">your settings</a>, and write to us at <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a>.</p>`,
  ].join("\n");

  return { subject, text, html };
}
