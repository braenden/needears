// Writes the generated config rows: supabase/seeds/reputation.sql from
// src/config/reputation.ts and supabase/seeds/profile.sql from
// src/config/profile.ts. Node 24 strips the TypeScript types when importing.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { profileSeedSql } from "../src/config/profile.ts";
import { reputationSeedSql } from "../src/config/reputation.ts";

for (const [name, sql] of [
  ["reputation", reputationSeedSql()],
  ["profile", profileSeedSql()],
]) {
  const target = fileURLToPath(
    new URL(`../supabase/seeds/${name}.sql`, import.meta.url),
  );
  writeFileSync(target, sql);
  console.log(`Wrote ${target}`);
}
