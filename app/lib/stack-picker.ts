// The cover picker is the motion reference for both vertical card stacks.
export const STACK_SWIPE_THRESHOLD = 0.24;

export function stackSwipeProgress(start: number, current: number, index: number, count: number) {
  let progress = (start - current) / 150;
  if ((index === 0 && progress < 0) || (index === count - 1 && progress > 0)) progress *= 0.2;
  return Math.max(-0.95, Math.min(0.95, progress));
}

export function stackSwipeTarget(index: number, progress: number, count: number) {
  return Math.max(0, Math.min(count - 1, index + (Math.abs(progress) >= STACK_SWIPE_THRESHOLD ? Math.sign(progress) : 0)));
}

export function stackCardStyle({ relativePosition, dragProgress, cardHeight, cardWidth, selectedHeight, stageHeight, centerPercent }: {
  relativePosition: number; dragProgress: number; cardHeight: number; cardWidth: number;
  selectedHeight: number; stageHeight: number; centerPercent: number;
}) {
  const position = Math.max(-2, Math.min(2, relativePosition - dragProgress));
  const neighborScale = Math.min(0.62, 220 / cardWidth);
  const neighborOffset = Math.max(24, selectedHeight / 2 + 44 - cardHeight * neighborScale / 2);
  const neighborOffsetPercent = (neighborOffset / stageHeight) * 100;
  const hiddenTravelPercent = Math.min(8, Math.max(5.5, neighborOffsetPercent * 0.36));
  const hiddenScale = Math.max(0.36, neighborScale * 0.82);
  const frames = [
    { top: centerPercent - neighborOffsetPercent - hiddenTravelPercent, scale: hiddenScale, opacity: 0 },
    { top: centerPercent - neighborOffsetPercent, scale: neighborScale, opacity: 0.62 },
    { top: centerPercent, scale: 1, opacity: 1 },
    { top: centerPercent + neighborOffsetPercent, scale: neighborScale, opacity: 0.62 },
    { top: centerPercent + neighborOffsetPercent + hiddenTravelPercent, scale: hiddenScale, opacity: 0 },
  ];
  const lowerPosition = Math.floor(position);
  const lower = frames[lowerPosition + 2], upper = frames[Math.ceil(position) + 2];
  const progress = position - lowerPosition;
  const mix = (start: number, end: number) => start + (end - start) * progress;
  return {
    top: `${mix(lower.top, upper.top)}%`,
    opacity: mix(lower.opacity, upper.opacity),
    transform: `translate(-50%, -50%) scale(${mix(lower.scale, upper.scale)})`,
    zIndex: Math.max(0, Math.round(3 - Math.abs(position))),
    "--cover-dim": Math.min(0.54, Math.abs(position) * 0.54),
  };
}
