// Connecting or disconnecting a way to sign in needs a short lived go-ahead
// from our server first, given only to a session that signed in recently.
// The database checks it when Supabase adds or removes the identity, so a
// stolen session cannot do either.

export type IntentResult = "ok" | "reauth" | "failed";

export async function requestIdentityIntent(
  action: "link" | "unlink",
  provider: "google",
): Promise<IntentResult> {
  try {
    const response = await fetch("/api/account/identity-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, provider }),
    });
    if (response.ok) return "ok";
    if (response.status === 403) {
      const body = (await response.json().catch(() => null)) as {
        error?: string | { code?: string };
      } | null;
      const code =
        typeof body?.error === "string" ? body.error : body?.error?.code;
      if (code === "reauth_required") return "reauth";
    }
    return "failed";
  } catch {
    return "failed";
  }
}
