// What people type into a field before its part of the page has loaded.
// That part can arrive later than the rest, and when it does the field is
// drawn again, empty. This module loads with the root of the page, so it
// is listening by then; useTypedEarly hands the text to the new field.
//
// Kept small on purpose: only the fields named below, never a password,
// only real keystrokes, only in memory, at most a minute, and only until
// the field has taken over (from then on the form has the text itself).

/** The fields that may be noted, by their data-early name. */
const FIELDS = new Set([
  "login-email",
  "welcome-username",
  "welcome-display-name",
]);
const MAX_AGE_MS = 60_000;

const typed = new Map<string, { value: string; at: number }>();
/** Fields that have taken over: nothing more is noted for them. */
const taken = new Set<string>();

if (typeof document !== "undefined") {
  document.addEventListener(
    "input",
    (event) => {
      if (!event.isTrusted) return;
      const field = event.target;
      if (
        !(field instanceof HTMLInputElement) &&
        !(field instanceof HTMLTextAreaElement)
      )
        return;
      const name = field.dataset.early;
      if (!name || !FIELDS.has(name) || taken.has(name)) return;
      if (field instanceof HTMLInputElement && field.type === "password")
        return;
      typed.set(name, { value: field.value, at: Date.now() });
    },
    true,
  );
}

/** What was typed into the field marked `name`, once; then it stops noting. */
export function takeEarlyInput(name: string): string | undefined {
  const entry = typed.get(name);
  typed.delete(name);
  taken.add(name);
  if (!entry || Date.now() - entry.at > MAX_AGE_MS) return undefined;
  return entry.value;
}
