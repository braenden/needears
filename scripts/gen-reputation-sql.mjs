// Writes supabase/seeds/reputation.sql from src/config/reputation.ts.
// Node 24 strips the TypeScript types when importing the .ts file.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { reputationSeedSql } from "../src/config/reputation.ts";

const target = fileURLToPath(
  new URL("../supabase/seeds/reputation.sql", import.meta.url),
);
writeFileSync(target, reputationSeedSql());
console.log(`Wrote ${target}`);
