// Web Share has no "sheet presented" event. Reveal the cue after presentation,
// and keep it running until Safari reports dismissal, without a timeout.
export const STORY_SHARE_COVER_MS = 700;
export const STORY_SHARE_DISMISS_MS = 320;

export type StorySharePhase = "closed" | "presenting" | "covered" | "closing";

const transitions: Partial<Record<StorySharePhase, [StorySharePhase, number]>> = {
  presenting: ["covered", STORY_SHARE_COVER_MS],
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
