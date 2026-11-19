import "server-only";
import { withAvatars } from "@/lib/data/avatars";
import { GROUP_MEMBERS_MAX } from "@/config/limits";
import { describeError } from "@/lib/data/errors";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import type { ProfileSummary } from "@/types/view";

// Groups, read as the visitor. Anyone can read a group's card (its name,
// its owner and how many are in it); only members read its tracks and who
// is in it, and only the owner reads who asked to join.

export type GroupRole = Database["public"]["Enums"]["group_role"];

/** What anyone can see of a group. */
export type Group = {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  members_count: number;
  created_at: string;
  owner: { handle: string; display_name: string | null } | null;
};

export type MyGroup =
  Database["public"]["Functions"]["my_groups"]["Returns"][number];

export type GroupMember = ProfileSummary & {
  role: GroupRole;
  joined_at: string;
};

export type JoinAsk = ProfileSummary & { created_at: string };

/** Where the visitor stands with a group they can see the card of. */
export type GroupStatus =
  Database["public"]["Functions"]["group_status"]["Returns"][number];

const GROUP_COLUMNS =
  "id, slug, name, owner_id, members_count, created_at, owner:profiles!groups_owner_id_fkey(handle, display_name)";

const PERSON = "id, handle, display_name, avatar_url, avatar_key, reputation";

/** The groups someone is in, theirs and others', the newest membership first. */
export async function getMyGroups(): Promise<MyGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_groups");
  if (error) throw new Error(`Groups failed: ${describeError(error)}`);
  return [...data].sort((a, b) => b.joined_at.localeCompare(a.joined_at));
}

/** A group's card, or null when there is no group at that address. */
export async function getGroupBySlug(slug: string): Promise<Group | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("groups")
    .select(GROUP_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Group failed: ${describeError(error)}`);
  return data as Group | null;
}

/** Member, asked, removed, full: null when signed out or not visible. */
export async function getGroupStatus(
  groupId: string,
): Promise<GroupStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("group_status", {
    p_group: groupId,
  });
  if (error) throw new Error(`Group status failed: ${describeError(error)}`);
  return data[0] ?? null;
}

/** The visitor's role in a group, or null when they are not in it. */
export async function getRole(
  groupId: string,
  userId: string | null,
): Promise<GroupRole | null> {
  if (!userId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Membership failed: ${describeError(error)}`);
  return data?.role ?? null;
}

/** Everyone in a group, its owner first, then by when they joined. For members. */
export async function getMembers(groupId: string): Promise<GroupMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_members")
    .select(
      `role, joined_at, profile:profiles!group_members_user_id_fkey(${PERSON})`,
    )
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true })
    .limit(GROUP_MEMBERS_MAX + 10);
  if (error) throw new Error(`Members failed: ${describeError(error)}`);
  const rows = data.flatMap(({ role, joined_at, profile }) =>
    profile ? [{ ...profile, role, joined_at }] : [],
  );
  const people = await withAvatars(supabase, rows);
  return [
    ...people.filter((m) => m.role === "owner"),
    ...people.filter((m) => m.role !== "owner"),
  ];
}

/** Who asked to join, the first to ask first. Only the owner gets any. */
export async function getAsks(groupId: string): Promise<JoinAsk[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_join_requests")
    .select(
      `created_at, profile:profiles!group_join_requests_user_id_fkey(${PERSON})`,
    )
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`Asks failed: ${describeError(error)}`);
  const rows = data.flatMap(({ created_at, profile }) =>
    profile ? [{ ...profile, created_at }] : [],
  );
  return withAvatars(supabase, rows);
}

/** How many of someone's own live tracks are in a group. */
export async function countOwnTracks(
  groupId: string,
  userId: string,
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("tracks")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("owner_id", userId)
    .eq("status", "live");
  if (error) throw new Error(`Tracks failed: ${describeError(error)}`);
  return count ?? 0;
}

/** The visitor's own tracks in groups, also those in groups they left. */
export async function getMyGroupTracks() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_group_tracks");
  if (error) throw new Error(`Group tracks failed: ${describeError(error)}`);
  return data;
}

/**
 * Whether the address is a group's track the visitor cannot hear: then the
 * page says it is for members, and nothing more.
 */
export async function isGroupTrack(slug: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_group_track", {
    p_slug: slug,
  });
  if (error) throw new Error(`Track check failed: ${describeError(error)}`);
  return data === true;
}
