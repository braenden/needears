import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { BodyError, jsonError, readJson } from "@/lib/api/http";
import { isFreshSession, REAUTH_WINDOW_MS } from "@/lib/api/reauth";
import { listAudio, removeAudio } from "@/lib/storage/r2";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ confirm: z.string() }).strict();

// Deletes the account and everything in it: audio in R2 and storage
// objects first, then the auth user. Every table references the profile with `on delete cascade`,
// so tracks, comments, reactions, notifications and upload IPs go with it.
// Reports the user filed stay, without the reporter and their text, so
// content they reported keeps its record (verified by
// supabase/tests/database/08_account_deletion.test.sql).
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

  const profile = await auth.supabase
    .from("profiles")
    .select("handle")
    .eq("id", auth.user.id)
    .single();
  if (profile.error)
    return jsonError(500, "internal_error", "Something went wrong.");
  if (!body.success || body.data.confirm !== profile.data.handle) {
    return jsonError(
      400,
      "confirmation_required",
      "Type your username to confirm.",
    );
  }

  // `last_sign_in_at` belongs to the account, not to this session, so it
  // would let an old session through right after the owner signed in on
  // another device. The `amr` claim of this session's token does not.
  const claims = await auth.supabase.auth.getClaims(auth.token ?? undefined);
  if (
    claims.error ||
    // This session's own sign in, so a stolen or forgotten session cannot
    // do it even when the owner has just signed in somewhere else.
    !isFreshSession(claims.data?.claims.amr, REAUTH_WINDOW_MS)
  ) {
    return jsonError(
      401,
      "reauthentication_required",
      "Sign in again to delete your account.",
    );
  }

  const admin = createAdminClient();
  if (!(await removeAudioFolder(auth.user.id))) {
    return jsonError(
      500,
      "delete_failed",
      "Could not delete your files. Try again.",
    );
  }
  // "audio" is the old Storage bucket, from before the audio moved to R2.
  for (const bucket of ["audio", "peaks", "avatars"] as const) {
    const removed = await removeFolder(admin, bucket, auth.user.id);
    if (!removed)
      return jsonError(
        500,
        "delete_failed",
        "Could not delete your files. Try again.",
      );
  }

  const { error } = await admin.auth.admin.deleteUser(auth.user.id);
  if (error) {
    console.error("Could not delete auth user", error.status);
    return jsonError(
      500,
      "delete_failed",
      "Could not delete your account. Try again.",
    );
  }

  if (auth.via === "cookie") {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }

  return Response.json(
    { deleted: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Removes every object under `<user id>/` in a bucket, page by page. The
// cap keeps a misbehaving list or remove call from looping until timeout.
async function removeFolder(
  admin: ReturnType<typeof createAdminClient>,
  bucket: "audio" | "peaks" | "avatars",
  userId: string,
): Promise<boolean> {
  for (let round = 0; round < 100; round++) {
    const listed = await admin.storage
      .from(bucket)
      .list(userId, { limit: 100 });
    if (listed.error) return false;
    if (listed.data.length === 0) return true;
    const removed = await admin.storage
      .from(bucket)
      .remove(listed.data.map((object) => `${userId}/${object.name}`));
    if (removed.error) return false;
  }
  return false;
}

// Removes everything under `<user id>/` in R2. Lists again after each round,
// since removing while paging could skip objects. The cap keeps a
// misbehaving list or delete from looping until timeout.
async function removeAudioFolder(userId: string): Promise<boolean> {
  for (let round = 0; round < 100; round++) {
    const page = await listAudio({ userId });
    if (!page) return false;
    if (page.objects.length === 0) return true;
    if (!(await removeAudio(page.objects.map((o) => o.key)))) return false;
  }
  return false;
}
