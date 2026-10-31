// Text limits. They mirror the check constraints in
// supabase/migrations/20261030180100_tables.sql, so forms can tell people
// before the database says no.

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
export const DISPLAY_NAME_MAX = 50;
export const BIO_MAX = 300;

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 2000;
export const TAGS_MAX = 5;
// Lower case letters, digits, spaces and hyphens, 1 to 24 characters
// (private.normalize_tags).
export const TAG_PATTERN = /^[a-z0-9]([a-z0-9 -]{0,22}[a-z0-9])?$/;

export const COMMENT_MAX = 2000;
export const REPORT_DETAILS_MAX = 1000;
// The reason an admin gives in a moderation notice.
export const MODERATION_REASON_MAX = 500;

// Feeds: the database caps the page size at 50. The page number is capped
// here so a crafted URL cannot ask Postgres for a huge offset (issue 022).
export const FEED_PAGE_SIZE = 20;
export const FEED_MAX_PAGE = 50;

// Search: the database ignores shorter or longer queries and returns at most
// SEARCH_MAX_RESULTS.
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
export const SEARCH_MAX_RESULTS = 50;
