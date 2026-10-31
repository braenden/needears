import "server-only";
import { SIGNED_URL_SECONDS } from "@/lib/data/media";
import type { createClient } from "@/lib/supabase/server";

type UserClient = Awaited<ReturnType<typeof createClient>>;

type WithAvatar = { avatar_url: string | null; avatar_key?: string | null };

/**
 * An uploaded picture (avatar_key, in the private avatars bucket) wins over
 * the Google one (avatar_url). Signs every key in one request with the
 * visitor's client, puts the URL in avatar_url and drops the key, so
 * components only ever read avatar_url. Storage only signs current avatars;
 * anything it refuses falls back to the Google picture or initials.
 */
export async function withAvatars<T extends WithAvatar>(
  supabase: UserClient,
  profiles: T[],
): Promise<Omit<T, "avatar_key">[]> {
  const keys = [
    ...new Set(
      profiles.map((p) => p.avatar_key).filter((k): k is string => !!k),
    ),
  ];
  const urls = new Map<string, string>();
  if (keys.length > 0) {
    const { data, error } = await supabase.storage
      .from("avatars")
      .createSignedUrls(keys, SIGNED_URL_SECONDS);
    if (error) console.error("Could not sign avatars", error.message);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
  }
  return profiles.map(({ avatar_key, ...rest }) => ({
    ...rest,
    avatar_url: (avatar_key && urls.get(avatar_key)) || rest.avatar_url,
  }));
}

export async function withAvatar<T extends WithAvatar>(
  supabase: UserClient,
  profile: T,
): Promise<Omit<T, "avatar_key">> {
  const [one] = await withAvatars(supabase, [profile]);
  return one!;
}
