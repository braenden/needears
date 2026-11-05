// Errors from Supabase queries, for the server logs.

export type QueryError = { code?: string; message?: string; details?: string };

/** A request cut off because the page was left (or the server stopped it). */
export function aborted(error: QueryError) {
  return /abort/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}

/** The code when there is one, and always the message, for the logs. */
export function describeError(error: QueryError) {
  return [error.code, error.message].filter(Boolean).join(" ") || "unknown";
}
