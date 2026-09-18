// Web Share has no "sheet presented" event. Keep the bottom paint unchanged
// through iOS's presentation, then swap it while the native tray covers it.
export const STORY_SHARE_COVER_MS = 700;
export const STORY_SHARE_PULSE_MS = 2000;
export const STORY_SHARE_DISMISS_MS = 320;

export type StorySharePhase = "closed" | "presenting" | "covered" | "settled" | "closing";

const transitions: Partial<Record<StorySharePhase, [StorySharePhase, number]>> = {
  presenting: ["covered", STORY_SHARE_COVER_MS],
  // Retire the cue while the sheet is still open. Native action dismissal can
  // finish before Safari resolves share(), so do not wait for that notification.
  covered: ["settled", STORY_SHARE_PULSE_MS],
  closing: ["closed", STORY_SHARE_DISMISS_MS],
};

export function scheduleStorySharePhase(
  phase: StorySharePhase,
  update: (next: StorySharePhase) => void,
  clock = { set: (fn: () => void, ms: number) => window.setTimeout(fn, ms), clear: (id: number) => window.clearTimeout(id) },
) {
  const transition = transitions[phase];
  if (!transition) return () => {};
  const [next, delay] = transition;
  const timer = clock.set(() => update(next), delay);
  return () => clock.clear(timer);
}
