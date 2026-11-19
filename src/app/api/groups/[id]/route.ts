import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { databaseError, jsonError } from "@/lib/api/http";
import { removeTrackFiles } from "@/lib/storage/remove-track-files";
import { createAdminClient } from "@/lib/supabase/admin";

// The owner deletes a group, with every track in it, for everyone. The
// database checks it is the owner and gives back every version's files,
// which go right away. A very large group may get only the first page of
// keys back; the daily clean up takes the rest.
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/groups/[id]">,
) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    return jsonError(404, "not_found", "No such group.");

  const { data, error } = await auth.supabase.rpc("delete_group", {
    p_group: id,
  });
  if (error)
    return error.code === "P0002"
      ? jsonError(404, "not_found", "No such group.")
      : databaseError(error);

  if (!(await removeTrackFiles(createAdminClient(), data)))
    console.error("Group deleted but objects remain", id);
  return new Response(null, { status: 204 });
}
