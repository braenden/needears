// Versions of a track. The database enforces the same numbers
// (supabase/migrations/*_track_versions.sql).
export const VERSIONS_MAX = 10;
export const VERSION_NOTE_MAX = 500;
// A new version within this many hours of the previous one does not count
// against the upload limit.
export const VERSION_FREE_WINDOW_HOURS = 24;
// Integrated loudness in LUFS, measured in the browser.
export const LOUDNESS_MIN = -70;
export const LOUDNESS_MAX = 0;
