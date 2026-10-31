import { z } from "zod";
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from "@/config/profile";
import { requireUser } from "@/lib/api/auth";
import { BodyError, databaseError, jsonError, readJson } from "@/lib/api/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { sniffAvatarType } from "@/lib/upload/image";

const bodySchema = z.object({ key: z.string().max(100).nullable() }).strict();

const KEY =
  /^([0-9a-f-]{36})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$/;

// Sets or clears the uploaded profile picture. The browser uploads the
// cropped image to the avatars bucket first, then sends its key here. The
// file is checked on the server (size, type and its first bytes) before the
// profile points at it, because a file copied inside Storage skips the
// bucket's limits. `{ "key": null }` goes back to the Google picture.
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
      "invalid_avatar",
      "Send the key of the uploaded picture.",
    );
  const key = body.data.key;

  const admin = createAdminClient();
  const profile = await admin
    .from("profiles")
    .select("banned_at")
    .eq("id", auth.user.id)
    .single();
  if (profile.error) return databaseError(profile.error);
  if (profile.data.banned_at)
    return jsonError(403, "not_allowed", "You are not allowed to do that.");

  if (key !== null) {
    const match = KEY.exec(key);
    if (!match || match[1] !== auth.user.id) {
      return jsonError(
        400,
        "invalid_avatar",
        "Upload the picture to your own folder first.",
      );
    }

    const info = await admin.storage.from("avatars").info(key);
    const size = info.data?.size ?? 0;
    const type = info.data?.contentType ?? "";
    if (
      info.error ||
      size <= 0 ||
      size > AVATAR_MAX_BYTES ||
      !(AVATAR_MIME_TYPES as readonly string[]).includes(type)
    ) {
      return jsonError(
        422,
        "invalid_avatar",
        "Use a JPEG or WebP picture under 512 KB.",
      );
    }

    const file = await admin.storage.from("avatars").download(key);
    if (file.error || file.data.size > AVATAR_MAX_BYTES) {
      return jsonError(
        422,
        "invalid_avatar",
        "Use a JPEG or WebP picture under 512 KB.",
      );
    }
    const head = new Uint8Array(await file.data.slice(0, 16).arrayBuffer());
    if (sniffAvatarType(head) !== type) {
      return jsonError(
        422,
        "invalid_avatar",
        "Use a JPEG or WebP picture under 512 KB.",
      );
    }
  }

  const updated = await admin
    .from("profiles")
    .update({ avatar_key: key })
    .eq("id", auth.user.id);
  if (updated.error) return databaseError(updated.error);

  return new Response(null, { status: 204 });
}
