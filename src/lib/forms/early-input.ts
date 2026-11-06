// What people type into a field before its part of the page has loaded.
// That part can arrive later than the rest, and when it does the field is
// drawn again, empty. On a slow phone the field can even show before any
// of the page's scripts have run, so the noting is a few lines inline at
// the top of the page (EARLY_INPUT_SCRIPT, with the page's CSP nonce);
// useTypedEarly hands the text to the new field.
//
// Kept small on purpose: only the fields named below, never a password,
// only real keystrokes, only in memory, at most a minute, and only until
// the field has taken over (from then on the form has the text itself).

/** The fields that may be noted, by their data-early name. */
const FIELDS = ["login-email", "welcome-username", "welcome-display-name"];
const MAX_AGE_MS = 60_000;
const GLOBAL = "__needearsEarlyInput";

type EarlyInputStore = { take: (name: string) => string | undefined };

/**
 * Inline, at the top of <body>. Plain ES5 on purpose: it runs before any
 * bundle, as written.
 */
export const EARLY_INPUT_SCRIPT = `(function(){var F=${JSON.stringify(
  Object.fromEntries(FIELDS.map((name) => [name, 1])),
)},T={},D={};window.${GLOBAL}={take:function(n){var e=D[n];delete D[n];T[n]=1;return e&&Date.now()-e.at<=${MAX_AGE_MS}?e.value:undefined}};document.addEventListener("input",function(v){if(!v.isTrusted)return;var f=v.target;if(!f||(f.tagName!=="INPUT"&&f.tagName!=="TEXTAREA")||f.type==="password")return;var n=f.getAttribute("data-early");if(!n||!F.hasOwnProperty(n)||T[n])return;D[n]={value:f.value,at:Date.now()}},true)})();`;

/** What was typed into the field marked `name`, once; then it stops noting. */
export function takeEarlyInput(name: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const store = (window as unknown as Record<string, EarlyInputStore>)[GLOBAL];
  return store?.take(name);
}
