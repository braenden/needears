// What people type into a field before its part of the page has loaded.
// That part can arrive later than the rest, and when it does the field is
// drawn again, empty. This module loads with the root of the page, so it
// is listening by then; useTypedEarly hands the text to the new field.
// Only fields marked with data-early are noted, and only in memory.

const typed = new Map<string, string>();

if (typeof document !== "undefined") {
  document.addEventListener(
    "input",
    (event) => {
      const field = event.target;
      if (
        (field instanceof HTMLInputElement ||
          field instanceof HTMLTextAreaElement) &&
        field.dataset.early
      )
        typed.set(field.dataset.early, field.value);
    },
    true,
  );
}

/** What was typed into the field marked `name`, once. */
export function takeEarlyInput(name: string): string | undefined {
  const value = typed.get(name);
  typed.delete(name);
  return value;
}
