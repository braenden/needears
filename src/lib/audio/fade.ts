/**
 * Micro fades on an audio element, so starting, stopping and jumping do
 * not click. Only with the element's own volume (no Web Audio, which
 * stops playback on iPhones when the screen locks). Where the volume
 * cannot be changed (iOS), everything happens at once, as before.
 *
 * The element's volume is always the listener's volume times a fade gain
 * from 0 to 1. A change of volume (the slider) applies at once, also in
 * the middle of a fade, and every fade ends exactly at that volume.
 */

/**
 * Long enough to soften the click of a start or stop, short enough to feel
 * immediate (the button changes at once anyway). Measured on a 40 Hz tone
 * with the volume stepping every 4 ms: 40 ms takes about 9.5 dB off the
 * click, 30 ms about 8 and 25 ms about 7. At 4 ms a tick that is 10 steps,
 * so even when a busy page makes a tick take two, no step is bigger than
 * about 0.3.
 */
export const FADE_MS = 40;
// Fine enough for a smooth ramp; requestAnimationFrame (16 ms) is too
// coarse, and barely better than no fade at all.
const TICK_MS = 4;
// A seek that never reports back still fades in after this.
const SEEKED_TIMEOUT_MS = 300;

type FadeState = {
  /** The listener's volume, 0 to 1. */
  volume: number;
  /** The fade, 0 to 1. */
  gain: number;
  timer: ReturnType<typeof setInterval> | null;
  /** Ends the running ramp early: false, a newer one took over. */
  stop: ((finished: boolean) => void) | null;
  /** Counts play, pause and seek requests, so a stale one gives way. */
  seq: number;
  fadable: boolean | null;
};

const states = new WeakMap<HTMLMediaElement, FadeState>();

function stateOf(element: HTMLMediaElement): FadeState {
  let state = states.get(element);
  if (!state) {
    state = {
      volume: element.volume,
      gain: 1,
      timer: null,
      stop: null,
      seq: 0,
      fadable: null,
    };
    states.set(element, state);
  }
  return state;
}

/**
 * Whether this element's volume can be changed from the page. iOS ignores
 * it, so the answer comes from trying, not from the user agent.
 */
export function canFade(element: HTMLMediaElement) {
  const state = stateOf(element);
  if (state.fadable === null) {
    const before = element.volume;
    const probe = before > 0.5 ? before - 0.1 : before + 0.1;
    element.volume = probe;
    state.fadable = Math.abs(element.volume - probe) < 0.01;
    element.volume = before;
  }
  return state.fadable;
}

/**
 * Whether to fade now: not where the volume cannot change, and not in a
 * hidden tab, where timers run about once a second.
 */
function fadeNow(element: HTMLMediaElement) {
  return (
    canFade(element) && !(typeof document !== "undefined" && document.hidden)
  );
}

function apply(element: HTMLMediaElement, state: FadeState) {
  element.volume = Math.min(1, Math.max(0, state.volume * state.gain));
}

/** The listener's volume. Applies at once, even in the middle of a fade. */
export function setListenerVolume(element: HTMLMediaElement, volume: number) {
  const state = stateOf(element);
  state.volume = volume;
  if (canFade(element)) apply(element, state);
  else element.volume = volume;
}

function cancelRamp(state: FadeState) {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  const stop = state.stop;
  state.stop = null;
  stop?.(false);
}

/**
 * Moves the gain to `to` in steps along a raised cosine, which starts and
 * ends gently, so the ramp itself makes no sound. It counts steps, not
 * time: when the page is busy and a tick comes late, the fade waits instead
 * of jumping to the end (that jump would be the very click it is there to
 * prevent). A late tick takes two steps at most, so a busy page still ends
 * it within about twice the time. Resolves true when it got there, false
 * when a newer ramp took over.
 */
function ramp(
  element: HTMLMediaElement,
  state: FadeState,
  to: number,
  ms = FADE_MS,
): Promise<boolean> {
  cancelRamp(state);
  const from = state.gain;
  if (from === to) return Promise.resolve(true);
  const steps = Math.max(1, Math.round(ms / TICK_MS));
  let step = 0;
  let last = performance.now();
  return new Promise((resolve) => {
    state.stop = resolve;
    state.timer = setInterval(() => {
      const now = performance.now();
      step += now - last > TICK_MS * 1.5 ? 2 : 1;
      last = now;
      const t = Math.min(1, step / steps);
      state.gain = from + ((to - from) * (1 - Math.cos(Math.PI * t))) / 2;
      if (t >= 1) {
        state.gain = to;
        clearInterval(state.timer!);
        state.timer = null;
        state.stop = null;
        resolve(true);
      }
      apply(element, state);
    }, TICK_MS);
  });
}

/** Plays, fading in from silence; or, during a fade out, back up from there. */
export async function fadeInPlay(element: HTMLMediaElement) {
  const state = stateOf(element);
  const mine = ++state.seq;
  if (!fadeNow(element)) {
    cancelRamp(state);
    state.gain = 1;
    if (canFade(element)) apply(element, state);
    await element.play();
    return;
  }
  if (element.paused) {
    cancelRamp(state);
    state.gain = 0;
    apply(element, state);
  }
  try {
    await element.play();
  } catch (error) {
    // Nothing plays: leave it at full volume for the next try.
    cancelRamp(state);
    state.gain = 1;
    apply(element, state);
    throw error;
  }
  if (state.seq !== mine) return;
  await ramp(element, state, 1);
}

/**
 * Fades out, then pauses. The caller shows "paused" at once; the sound
 * goes a moment later. A play in between cancels the pause.
 */
export async function fadeOutPause(element: HTMLMediaElement) {
  const state = stateOf(element);
  const mine = ++state.seq;
  if (element.paused) return;
  if (!fadeNow(element)) {
    cancelRamp(state);
    element.pause();
    state.gain = 1;
    if (canFade(element)) apply(element, state);
    return;
  }
  const finished = await ramp(element, state, 0);
  if (!finished || state.seq !== mine) return;
  element.pause();
  // Ready at full volume for whatever plays it next.
  state.gain = 1;
  apply(element, state);
}

/**
 * Fades to silence and keeps playing, so the position runs on: for
 * switching to another source at the same spot. The new source fades in
 * when it plays (fadeInPlay).
 */
export async function fadeToSilence(element: HTMLMediaElement) {
  const state = stateOf(element);
  ++state.seq;
  if (element.paused || !fadeNow(element)) return;
  await ramp(element, state, 0);
}

function seeked(element: HTMLMediaElement) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      element.removeEventListener("seeked", done);
      resolve();
    };
    const timer = setTimeout(done, SEEKED_TIMEOUT_MS);
    element.addEventListener("seeked", done);
  });
}

/**
 * Jumps to `seconds`. While playing: fade out, jump, wait for the element
 * to get there, fade in. While paused there is nothing to hear, so it
 * jumps at once.
 */
export async function fadedSeek(element: HTMLMediaElement, seconds: number) {
  const state = stateOf(element);
  const mine = ++state.seq;
  // Nothing loaded yet (a slow connection, right after Play): nothing to
  // hear, but a position set this early can be dropped, so set it again
  // once the element knows the track, unless a newer seek came since.
  if (element.readyState < 1 /* HAVE_METADATA */) {
    element.currentTime = seconds;
    element.addEventListener(
      "loadedmetadata",
      () => {
        if (state.seq === mine) element.currentTime = seconds;
      },
      { once: true },
    );
    return;
  }
  if (element.paused || !fadeNow(element)) {
    element.currentTime = seconds;
    return;
  }
  const finished = await ramp(element, state, 0);
  if (!finished || state.seq !== mine) return;
  const arrived = seeked(element);
  element.currentTime = seconds;
  await arrived;
  if (state.seq !== mine || element.paused) return;
  await ramp(element, state, 1);
}
