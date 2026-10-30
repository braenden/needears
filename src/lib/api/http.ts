// Small helpers so every route handler answers errors the same way:
// { "error": { "code": "rate_limited", "message": "..." } }.

export function jsonError(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

type PostgrestLikeError = {
  code?: string;
  message?: string;
  hint?: string | null;
};

// Maps the error codes our triggers and policies raise (see the triggers
// migration) to HTTP. Anything unknown becomes a 500 without details.
export function databaseError(error: PostgrestLikeError) {
  switch (error.code) {
    case "PT429":
      return jsonError(
        429,
        "rate_limited",
        error.hint ?? "Too many requests, try again later.",
      );
    case "42501":
      return jsonError(403, "not_allowed", "You are not allowed to do that.");
    case "22023":
      // Our triggers raise short snake_case reasons (time_out_of_range,
      // invalid_parent ...). Postgres itself uses the same code with prose
      // messages, which must not reach the client.
      return jsonError(
        400,
        /^[a-z_]{1,40}$/.test(error.message ?? "")
          ? error.message!
          : "invalid_input",
        "The request was not valid.",
      );
    case "23505":
      return jsonError(409, "conflict", "That already exists.");
    default:
      console.error("Unexpected database error", error.code);
      return jsonError(500, "internal_error", "Something went wrong.");
  }
}

// Parses a JSON body with a size cap, so a huge body cannot tie up the function.
export async function readJson(
  request: Request,
  maxBytes = 16 * 1024,
): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new BodyError("Request body is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new BodyError("Request body must be JSON.");
  }
}

export class BodyError extends Error {}
