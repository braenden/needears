import { requireUser } from "@/lib/api/auth";
import { jsonError } from "@/lib/api/http";
import { createAdminClient } from "@/lib/supabase/admin";

// "Download my data" (GDPR access and portability). Everything is read with
// the user's own client, so RLS limits it to their rows, except upload IPs,
// which users cannot read directly and are fetched for their tracks only.
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { supabase, user } = auth;
  const uid = user.id;

  const [profile, tracks, comments, reactions, reports, notifications] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).single(),
      supabase
        .from("tracks")
        .select("*")
        .eq("owner_id", uid)
        .order("created_at"),
      supabase
        .from("comments")
        .select("*")
        .eq("author_id", uid)
        .order("created_at"),
      supabase
        .from("reactions")
        .select("*")
        .eq("user_id", uid)
        .order("created_at"),
      supabase
        .from("reports")
        .select("*")
        .eq("reporter_id", uid)
        .order("created_at"),
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", uid)
        .order("created_at"),
    ]);

  const failed = [
    profile,
    tracks,
    comments,
    reactions,
    reports,
    notifications,
  ].find((result) => result.error);
  if (failed || !tracks.data)
    return jsonError(500, "export_failed", "Could not export your data.");

  const trackIds = tracks.data.map((track) => track.id);
  const uploadIps =
    trackIds.length === 0
      ? { data: [], error: null }
      : await createAdminClient()
          .from("track_upload_ips")
          .select("track_id, ip, created_at")
          .in("track_id", trackIds);
  if (uploadIps.error)
    return jsonError(500, "export_failed", "Could not export your data.");

  const versions =
    trackIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("track_versions")
          .select("*")
          .in("track_id", trackIds)
          .order("version_no");
  if (versions.error)
    return jsonError(500, "export_failed", "Could not export your data.");

  const exportedAt = new Date().toISOString();
  const data = {
    exportedAt,
    account: {
      id: uid,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      providers: user.app_metadata.providers ?? [],
      // The ways to sign in, with the address each one uses.
      identities: (user.identities ?? []).map((identity) => ({
        provider: identity.provider,
        email:
          typeof identity.identity_data?.email === "string"
            ? identity.identity_data.email
            : null,
        createdAt: identity.created_at ?? null,
        lastSignInAt: identity.last_sign_in_at ?? null,
      })),
    },
    profile: profile.data,
    tracks: tracks.data,
    trackVersions: versions.data,
    uploadIps: uploadIps.data,
    comments: comments.data,
    reactions: reactions.data,
    reports: reports.data,
    notifications: notifications.data,
  };

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="needears-export-${exportedAt.slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
