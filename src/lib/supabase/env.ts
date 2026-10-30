// Public Supabase settings. NEXT_PUBLIC_ variables are inlined at build
// time, so they must be read with their full literal names.

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return url;
}

export function supabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  return key;
}

// URL of an object in a private bucket, for requests that send their own
// Authorization header. Keys come from the database or are generated on the
// server, never from the request.
export function objectUrl(bucket: "audio" | "peaks", key: string): string {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl()}/storage/v1/object/authenticated/${bucket}/${path}`;
}
