export const COVER_MOVE_MS = 620;
export const COVER_FADE_MS = 650;
export const COVER_PROGRESS_CELLS = 24;
export type CoverOrigin = { left: number; top: number; width: number; height: number };

/** Fit the whole cover, keeping the image itself centered above its readout. */
export function coverEntranceLayout(width: number, height: number, offsetTop: number, aspectRatio: number) {
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const w = Math.max(1, width), h = Math.max(1, height);
  const coverWidth = Math.min(320, w * 0.74, h * 0.56 * ratio);
  const coverHeight = coverWidth / ratio;
  return { left: (w - coverWidth) / 2, top: offsetTop + (h - coverHeight) / 2,
    width: coverWidth, height: coverHeight };
}

export function coverProgressCells(percent: number) {
  const progress = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return progress === 100 ? COVER_PROGRESS_CELLS : Math.floor(progress / 100 * COVER_PROGRESS_CELLS);
}

/** Keep the existing 650ms crossfade and expose its phase for Safari edge tint. */
export function fadeCoverEntrance(host: HTMLElement, onComplete: () => void) {
  let frame = 0, started: number | null = null, disposed = false;
  host.dataset.inkPhase = "fading";
  const tick = (now: number) => {
    if (disposed) return;
    started ??= now;
    const t = Math.max(0, Math.min(1, (now - started) / COVER_FADE_MS));
    host.style.opacity = String(1 - t * t * (3 - 2 * t));
    if (t < 1) frame = requestAnimationFrame(tick);
    else onComplete();
  };
  frame = requestAnimationFrame(tick);
  return () => { disposed = true; cancelAnimationFrame(frame); };
}
