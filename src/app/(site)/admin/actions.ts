"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/data/viewer";
import { createClient } from "@/lib/supabase/server";

// Moderation actions. Each one checks the caller is an admin here, and the
// database functions check again with is_admin(), so a forged request
// gets nowhere. They run as the admin's own session, never service role.

export type ActionResult = { ok: true } | { ok: false; message: string };

const uuid = z.uuid();

async function adminClient() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return null;
  return createClient();
}

async function run(
  call: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ error: { code?: string } | null }>,
): Promise<ActionResult> {
  const supabase = await adminClient();
  if (!supabase) return { ok: false, message: "You can't do that." };
  const { error } = await call(supabase);
  if (error) {
    console.error("Admin action failed", error.code);
    return { ok: false, message: "That didn't work. Try again." };
  }
  refresh();
  return { ok: true };
}

export async function setTrackStatus(
  trackId: string,
  status: "live" | "hidden" | "deleted",
): Promise<ActionResult> {
  if (!uuid.safeParse(trackId).success)
    return { ok: false, message: "Bad id." };
  if (!["live", "hidden", "deleted"].includes(status))
    return { ok: false, message: "Bad status." };
  return run((s) =>
    s.rpc("admin_set_track_status", { p_track: trackId, p_status: status }),
  );
}

export async function setCommentStatus(
  commentId: string,
  status: "live" | "hidden" | "deleted",
): Promise<ActionResult> {
  if (!uuid.safeParse(commentId).success)
    return { ok: false, message: "Bad id." };
  if (!["live", "hidden", "deleted"].includes(status))
    return { ok: false, message: "Bad status." };
  return run((s) =>
    s.rpc("admin_set_comment_status", {
      p_comment: commentId,
      p_status: status,
    }),
  );
}

export async function resolveReport(
  reportId: string,
  status: "resolved" | "dismissed",
): Promise<ActionResult> {
  if (!uuid.safeParse(reportId).success)
    return { ok: false, message: "Bad id." };
  if (status !== "resolved" && status !== "dismissed")
    return { ok: false, message: "Bad status." };
  return run((s) =>
    s.rpc("admin_resolve_report", { p_report: reportId, p_status: status }),
  );
}

export async function setBanned(
  userId: string,
  banned: boolean,
): Promise<ActionResult> {
  if (!uuid.safeParse(userId).success) return { ok: false, message: "Bad id." };
  return run((s) =>
    s.rpc("admin_set_banned", { p_user: userId, p_banned: banned === true }),
  );
}
