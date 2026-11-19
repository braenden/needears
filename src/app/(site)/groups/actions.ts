"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// What people do with groups. Each one runs as the caller's own session,
// and the database functions decide who may do what (members, owners,
// limits), so a forged call gets nowhere. Errors come back as the short
// reason the database gave, for the page to put in words.

export type GroupError =
  | "signed_out"
  | "handle_required"
  | "invalid_name"
  | "too_many_groups"
  | "rate_limited"
  | "owner_cannot_leave"
  | "asked_recently"
  | "group_full"
  | "removed_from_group"
  | "not_found"
  | "failed";

export type Result<T = null> =
  { ok: true; value: T } | { ok: false; error: GroupError };

const KNOWN = new Set<GroupError>([
  "handle_required",
  "invalid_name",
  "too_many_groups",
  "rate_limited",
  "owner_cannot_leave",
  "asked_recently",
  "group_full",
  "removed_from_group",
  "not_found",
]);

const uuid = z.uuid();
const name = z.string().trim().min(1).max(60);

function reason(error: { message?: string }): GroupError {
  const message = error.message as GroupError | undefined;
  if (message && KNOWN.has(message)) return message;
  console.error("Group action failed", error.message?.slice(0, 40));
  return "failed";
}

async function call<T>(
  run: (
    supabase: Awaited<ReturnType<typeof createClient>>,
  ) => PromiseLike<{ data: T | null; error: { message?: string } | null }>,
): Promise<Result<T | null>> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return { ok: false, error: "signed_out" };
  const { data, error } = await run(supabase);
  if (error) return { ok: false, error: reason(error) };
  refresh();
  return { ok: true, value: data };
}

/** Makes a group: a name, nothing else. Returns its slug. */
export async function createGroup(groupName: string): Promise<Result<string>> {
  const parsed = name.safeParse(groupName);
  if (!parsed.success) return { ok: false, error: "invalid_name" };
  const result = await call((s) =>
    s.rpc("create_group", { p_name: parsed.data }),
  );
  if (!result.ok) return result;
  const slug = result.value?.[0]?.slug;
  return slug ? { ok: true, value: slug } : { ok: false, error: "failed" };
}

export async function leaveGroup(groupId: string): Promise<Result> {
  if (!uuid.safeParse(groupId).success)
    return { ok: false, error: "not_found" };
  const result = await call((s) => s.rpc("leave_group", { p_group: groupId }));
  return result.ok ? { ok: true, value: null } : result;
}

/** The owner takes someone out of the group. */
export async function removeMember(
  groupId: string,
  userId: string,
): Promise<Result> {
  if (!uuid.safeParse(groupId).success || !uuid.safeParse(userId).success)
    return { ok: false, error: "not_found" };
  const result = await call((s) =>
    s.rpc("remove_member", { p_group: groupId, p_user: userId }),
  );
  return result.ok ? { ok: true, value: null } : result;
}

/** Asks the owner to let you in. "member" when you are in already. */
export async function askToJoin(
  groupId: string,
): Promise<Result<"pending" | "member">> {
  if (!uuid.safeParse(groupId).success)
    return { ok: false, error: "not_found" };
  const result = await call((s) => s.rpc("ask_to_join", { p_group: groupId }));
  if (!result.ok) return result;
  return result.value === "member" || result.value === "pending"
    ? { ok: true, value: result.value }
    : { ok: false, error: "failed" };
}

export async function withdrawAsk(groupId: string): Promise<Result> {
  if (!uuid.safeParse(groupId).success)
    return { ok: false, error: "not_found" };
  const result = await call((s) => s.rpc("withdraw_ask", { p_group: groupId }));
  return result.ok ? { ok: true, value: null } : result;
}

/** The owner lets someone in, or says no. */
export async function answerAsk(
  groupId: string,
  userId: string,
  accept: boolean,
): Promise<Result> {
  if (!uuid.safeParse(groupId).success || !uuid.safeParse(userId).success)
    return { ok: false, error: "not_found" };
  const result = await call((s) =>
    s.rpc("answer_ask", {
      p_group: groupId,
      p_user: userId,
      p_accept: accept === true,
    }),
  );
  return result.ok ? { ok: true, value: null } : result;
}
