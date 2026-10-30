// Reputation levels and rate limits. This file is the only place the
// numbers live: `pnpm db:config` turns it into supabase/seeds/reputation.sql,
// which fills the `reputation_levels` table that the database triggers read.
// A unit test fails if the SQL file is out of date.
//
// Reputation counts the comments a user has had marked Helpful by the
// uploader, at most `trustRules.helpfulPerGiver` from each uploader.

export type ReputationLevelId =
  "new_ear" | "listener" | "trusted_ear" | "golden_ear";

export type RateLimits = {
  tracksPerDay: number;
  tracksPerWeek: number;
  commentsPerHour: number;
  reportsPerDay: number;
  reactionsPerHour: number;
};

export type ReputationLevel = {
  id: ReputationLevelId;
  name: string;
  minHelpful: number;
  // Shown in the badge tooltip.
  description: string;
  limits: RateLimits;
};

const baseLimits: RateLimits = {
  tracksPerDay: 2,
  tracksPerWeek: 6,
  commentsPerHour: 60,
  reportsPerDay: 20,
  reactionsPerHour: 120,
};

// Sorted by minHelpful, lowest first.
export const reputationLevels: readonly ReputationLevel[] = [
  {
    id: "new_ear",
    name: "New ear",
    minHelpful: 0,
    description: "Just getting started. Everyone starts here.",
    limits: baseLimits,
  },
  {
    id: "listener",
    name: "Listener",
    minHelpful: 3,
    description: "Their comments have helped a few times.",
    limits: baseLimits,
  },
  {
    id: "trusted_ear",
    name: "Trusted ear",
    minHelpful: 15,
    description: "People can count on their comments.",
    limits: {
      tracksPerDay: 4,
      tracksPerWeek: 12,
      commentsPerHour: 120,
      reportsPerDay: 40,
      reactionsPerHour: 240,
    },
  },
  {
    id: "golden_ear",
    name: "Golden ear",
    minHelpful: 60,
    description: "Their feedback has helped again and again.",
    limits: {
      tracksPerDay: 6,
      tracksPerWeek: 20,
      commentsPerHour: 180,
      reportsPerDay: 60,
      reactionsPerHour: 360,
    },
  },
];

// Rules that keep one person with a few extra accounts from farming
// reputation or hiding other people's posts.

export type TrustRules = {
  // The most reputation one track owner can give one person.
  helpfulPerGiver: number;
  // Helpful from an account younger than this counts once it is this old.
  giverMinAgeDays: number;
  // Reports count toward auto hide only from accounts at least this old...
  reporterMinAgeDays: number;
  // ...and with at least this much reputation.
  reporterMinReputation: number;
  // Reports from different counting accounts that hide a post.
  autoHideReports: number;
};

export const trustRules: TrustRules = {
  helpfulPerGiver: 3,
  giverMinAgeDays: 7,
  reporterMinAgeDays: 7,
  reporterMinReputation: 1,
  autoHideReports: 3,
};

export function reputationLevelFor(helpful: number): ReputationLevel {
  let level = reputationLevels[0]!;
  for (const candidate of reputationLevels) {
    if (helpful >= candidate.minHelpful) level = candidate;
  }
  return level;
}

// The level for a reputation plus the next one up, for the progress text.
export function reputationFor(helpful: number) {
  const level = reputationLevelFor(helpful);
  const next = reputationLevels.find((l) => l.minHelpful > helpful) ?? null;
  return { ...level, next };
}

// Trusted ear and up: the "From trusted ears" comment filter.
export function isTrusted(helpful: number) {
  const { id } = reputationLevelFor(helpful);
  return id === "trusted_ear" || id === "golden_ear";
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

// The SQL written to supabase/seeds/reputation.sql. Idempotent, so it can be
// applied to production with `psql -1 -f` after a change.
export function reputationSeedSql(): string {
  const rows = reputationLevels.map((level) =>
    [
      sqlString(level.id),
      sqlString(level.name),
      level.minHelpful,
      level.limits.tracksPerDay,
      level.limits.tracksPerWeek,
      level.limits.commentsPerHour,
      level.limits.reportsPerDay,
      level.limits.reactionsPerHour,
    ].join(", "),
  );

  return [
    "-- Generated from src/config/reputation.ts by `pnpm db:config`. Do not edit.",
    "delete from public.reputation_levels",
    `where id not in (${reputationLevels.map((l) => sqlString(l.id)).join(", ")});`,
    "insert into public.reputation_levels",
    "  (id, name, min_helpful, tracks_per_day, tracks_per_week, comments_per_hour, reports_per_day, reactions_per_hour)",
    "values",
    rows.map((row) => `  (${row})`).join(",\n"),
    "on conflict (id) do update set",
    "  name = excluded.name,",
    "  min_helpful = excluded.min_helpful,",
    "  tracks_per_day = excluded.tracks_per_day,",
    "  tracks_per_week = excluded.tracks_per_week,",
    "  comments_per_hour = excluded.comments_per_hour,",
    "  reports_per_day = excluded.reports_per_day,",
    "  reactions_per_hour = excluded.reactions_per_hour;",
    "insert into public.trust_rules",
    "  (id, helpful_per_giver, giver_min_age_days, reporter_min_age_days, reporter_min_reputation, auto_hide_reports)",
    "values",
    `  (true, ${[
      trustRules.helpfulPerGiver,
      trustRules.giverMinAgeDays,
      trustRules.reporterMinAgeDays,
      trustRules.reporterMinReputation,
      trustRules.autoHideReports,
    ].join(", ")})`,
    "on conflict (id) do update set",
    "  helpful_per_giver = excluded.helpful_per_giver,",
    "  giver_min_age_days = excluded.giver_min_age_days,",
    "  reporter_min_age_days = excluded.reporter_min_age_days,",
    "  reporter_min_reputation = excluded.reporter_min_reputation,",
    "  auto_hide_reports = excluded.auto_hide_reports;",
    "",
  ].join("\n");
}
