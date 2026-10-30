import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { siteUrl } from "@/config/site";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

const STATIC_PAGES = [
  "/",
  "/feed",
  "/about",
  "/guidelines",
  "/terms",
  "/privacy",
  "/copyright",
];

// Live tracks and the profiles behind them, read with the anon key so only
// public pages end up here. Built at request time (the build has no
// Supabase settings) and cached for an hour.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  return cachedSitemap(siteUrl());
}

async function cachedSitemap(base: string): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");
  const supabase = createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data: tracks } = await supabase
    .from("tracks")
    .select("slug, published_at, owner:profiles!tracks_owner_id_fkey(handle)")
    .eq("status", "live")
    .order("published_at", { ascending: false })
    .limit(5000);
  const handles = new Set<string>();
  for (const track of tracks ?? []) {
    if (track.owner) handles.add(track.owner.handle);
  }
  return [
    ...STATIC_PAGES.map((path) => ({ url: `${base}${path}` })),
    ...(tracks ?? []).map((track) => ({
      url: `${base}/t/${track.slug}`,
      lastModified: track.published_at,
    })),
    ...[...handles].map((handle) => ({ url: `${base}/u/${handle}` })),
  ];
}
