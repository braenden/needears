import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { BodyError, databaseError, jsonError, readJson } from "@/lib/api/http";
import { isFreshSession, REAUTH_WINDOW_MS } from "@/lib/api/reauth";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z
  .object({
    action: z.enum(["link", "unlink"]),
    provider: z.enum(["google"]),
  })
  .strict();

// Step 1 of linking or unlinking a way to sign in. Checks that the session
// making this request signed in within REAUTH_WINDOW_MS (its own `amr`
// claim, so a stolen or forgotten session cannot pass because the owner
// signed in somewhere else), signs out the account's other sessions, then
// leaves a one time intent the database requires for the change. The intent lasts five minutes. Step 2 is the
// Supabase Auth call itself (linkIdentity or unlinkIdentity).
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  let body;
  try {
    body = bodySchema.safeParse(await readJson(request));
  } catch (error) {
    if (error instanceof BodyError)
      return jsonError(400, "invalid_body", error.message);
    throw error;
  }
  if (!body.success)
    return jsonError(
      400,
      "invalid_intent",
      "Choose link or unlink and a provider.",
    );

  const claims = await auth.supabase.auth.getClaims(auth.token ?? undefined);
  if (
    claims.error ||
    !isFreshSession(claims.data?.claims.amr, REAUTH_WINDOW_MS)
  )
    return jsonError(403, "reauth_required", "Sign in again to continue.");

  const admin = createAdminClient();

  // Sign out every other session first, so a stolen one cannot use the
  // intent this session is about to get.
  const accessToken =
    auth.token ??
    (await auth.supabase.auth.getSession()).data.session?.access_token;
  if (!accessToken)
    return jsonError(403, "reauth_required", "Sign in again to continue.");
  const others = await admin.auth.admin.signOut(accessToken, "others");
  if (others.error) {
    console.error("Could not sign out other sessions", others.error.status);
    return jsonError(500, "intent_failed", "Something went wrong. Try again.");
  }

  const created = await admin.rpc("create_identity_intent", {
    p_user: auth.user.id,
    p_action: body.data.action,
    p_provider: body.data.provider,
  });
  if (created.error) return databaseError(created.error);

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
