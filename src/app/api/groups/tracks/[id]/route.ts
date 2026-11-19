import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { databaseError, jsonError } from "@/lib/api/http";
import { removeTrackFiles } from "@/lib/storage/remove-track-files";
import { createAdminClient } from "@/lib/supabase/admin";

// The group's owner deletes a track in the group, for everyone, also when
// it is reported. The database checks it is the owner and gives back every
// version's files, which go right away.
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/groups/tracks/[id]">,
) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    return jsonError(404, "not_found", "No such track.");

  const { data, error } = await auth.supabase.rpc("remove_track_from_group", {
    p_track: id,
  });
  if (error)
    return error.code === "P0002"
      ? jsonError(404, "not_found", "No such track.")
      : databaseError(error);

  if (!(await removeTrackFiles(createAdminClient(), data)))
    console.error("Group track deleted but objects remain", id);
  return new Response(null, { status: 204 });
}
