// Turns a failed profile update into the microcopy for the form.
export function handleErrorText(
  error: { code?: string; message?: string },
  handle: string,
): string {
  if (error.code === "23505") return `"${handle}" is taken. Try another.`;
  if (error.message === "handle_reserved")
    return "That username is reserved. Try another.";
  if (error.code === "23514")
    return "Use 3 to 20 letters, numbers or underscores.";
  return "Something broke on our side. Try again, or come back in a minute.";
}
