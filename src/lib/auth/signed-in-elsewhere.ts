// Signing in from the emailed link opens a new tab. The tab that sent the
// link is told, so it does not stay on "Check your email". The message is
// only a nudge: the waiting tab checks for a session of its own before it
// moves on.

const CHANNEL = "needears:signed-in";

/** The tab the link opened: tell the others. */
export function announceSignedIn(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage("signed-in");
  channel.close();
}

/**
 * The waiting tab: runs `check` when another tab says it signed in, and
 * whenever this tab comes back into view (for browsers without the
 * channel, and for a link opened in another window). Returns the cleanup.
 */
export function onSignedInElsewhere(check: () => void): () => void {
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(CHANNEL);
  const onMessage = (event: MessageEvent) => {
    if (event.data === "signed-in") check();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") check();
  };
  channel?.addEventListener("message", onMessage);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  return () => {
    channel?.removeEventListener("message", onMessage);
    channel?.close();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}
