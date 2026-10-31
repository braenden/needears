import { timingSafeEqual } from "node:crypto";
import { jsonError } from "@/lib/api/http";
import { createAdminClient } from "@/lib/supabase/admin";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Removes uploaded files that nothing uses: abandoned or rejected uploads,
// and anything uploaded later with an old signed URL. The database decides
// what is orphaned (public.orphaned_upload_objects). Run daily by Vercel
// Cron (vercel.json), which sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  if (!authorized(request))
    return jsonError(401, "unauthorized", "Not allowed.");

  const admin = createAdminClient();
  let removed = 0;

  for (let round = 0; round < 20; round++) {
    const orphans = await admin.rpc("orphaned_upload_objects", {
      p_limit: 100,
    });
    if (orphans.error)
      return jsonError(500, "cleanup_failed", "Could not list files.");
    if (orphans.data.length === 0) break;

    for (const bucket of ["audio", "peaks", "avatars"] as const) {
      const names = orphans.data
        .filter((o) => o.bucket_id === bucket)
        .map((o) => o.name);
      if (names.length === 0) continue;
      const result = await admin.storage.from(bucket).remove(names);
      if (result.error)
        return jsonError(500, "cleanup_failed", "Could not remove files.");
    }
    removed += orphans.data.length;
  }

  const forgotten = await admin.rpc("forget_expired_upload_reservations");
  if (forgotten.error)
    return jsonError(500, "cleanup_failed", "Could not update reservations.");

  return Response.json(
    { removed },
    { headers: { "Cache-Control": "no-store" } },
  );
}
