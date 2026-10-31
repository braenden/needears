import { createHash } from "node:crypto";
import { z } from "zod";
import { databaseError, jsonError } from "@/lib/api/http";
import { clientIp } from "@/lib/api/ip";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Expected origin, so other sites cannot count plays from their visitors.
function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

// Counts a play. The player calls this once per session after 30 seconds
// of listening. Signed out listeners count too, keyed by a hash of their IP;
// the database counts one play per listener and track an hour, skips the
// owner and caps scripts (see the play_count migration).
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/tracks/[id]/play">,
) {
  if (request.headers.get("origin") !== siteOrigin(request)) {
    return jsonError(403, "bad_origin", "Cross-site requests are not allowed.");
  }

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    return jsonError(404, "not_found", "No such track.");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const ip = clientIp(request) ?? "unknown";
  const listener = user
    ? `u:${user.id}`
    : `ip:${createHash("sha256").update(ip).digest("hex")}`;

  const { data: counted, error } = await createAdminClient().rpc(
    "record_play",
    { p_track: id, p_listener: listener, p_user: user?.id },
  );
  if (error) {
    if (error.code === "22023" && error.message === "not_found")
      return jsonError(404, "not_found", "No such track.");
    return databaseError(error);
  }

  return Response.json(
    { counted },
    { headers: { "Cache-Control": "no-store" } },
  );
}
