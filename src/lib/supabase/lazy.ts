import type { createClient } from "./client";

type BrowserClient = ReturnType<typeof createClient>;

let client: Promise<BrowserClient> | null = null;

// The browser client, loaded on first use. supabase-js is one of the
// biggest pieces of JavaScript on a page, and most visitors only listen,
// so pages fetch it when someone signs in, comments or saves.
export function browserClient(): Promise<BrowserClient> {
  client ??= import("./client").then((m) => m.createClient());
  return client;
}
