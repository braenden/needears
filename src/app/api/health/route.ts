import { createClient } from "@supabase/supabase-js";
import { connection } from "next/server";

// Liveness check for uptime monitors and the daily keep-alive cron.
// It makes one real database round trip, which also keeps a free
// Supabase project from pausing.
export async function GET() {
  await connection();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return Response.json(
      { status: "error", database: "not configured" },
      { status: 503 },
    );
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // `graphql_public.graphql` ships with every Supabase project and runs
  // inside Postgres, so this needs no schema of our own.
  const started = performance.now();
  const { error } = await supabase
    .schema("graphql_public")
    .rpc("graphql", { query: "{ __typename }" });
  const latencyMs = Math.round(performance.now() - started);

  if (error) {
    return Response.json(
      { status: "error", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { status: "ok", database: "ok", latencyMs },
    { headers: { "Cache-Control": "no-store" } },
  );
}
