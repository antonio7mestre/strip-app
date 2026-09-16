export const COVER_MOVE_MS = 620;
export const COVER_FADE_MS = 650;
export const COVER_PROGRESS_CELLS = 24;
export const COVER_DOCK_DROP_MS = 420;
export type CoverOrigin = { left: number; top: number; width: number; height: number };
export type CoverDockOrigin = CoverOrigin & { markup: string; padding: string; borderRadius: string; cornerShape: string; boxShadow: string };

/** Capture only our own navigation markup, before hiding the live controls. */
export function captureCoverDock(dock: HTMLElement | null): CoverDockOrigin | undefined {
  if (!dock) return;
  const bounds = dock.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const style = getComputedStyle(dock);
  return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height,
    markup: dock.innerHTML, padding: style.padding, borderRadius: style.borderRadius,
    cornerShape: style.getPropertyValue("corner-shape"), boxShadow: style.boxShadow };
}

function sizeCoverDock(dock: HTMLElement, origin: CoverDockOrigin) {
  Object.assign(dock.style, { width: origin.width + "px", height: origin.height + "px",
    padding: origin.padding, borderRadius: origin.borderRadius, boxShadow: origin.boxShadow, visibility: "visible" });
  if (origin.cornerShape) dock.style.setProperty("corner-shape", origin.cornerShape);
}

/** Move document paint, not a fixed compositor layer. Safari must repaint the
 * same white surface behind its controls as the navigation leaves the glass. */
export function dropCoverDock(host: HTMLElement, dock: HTMLElement, origin: CoverDockOrigin, onComplete?: () => void) {
  // Use the rendering clock so Safari starts moving on the first available frame.
  const timelineTime = typeof document === "undefined" ? null : document.timeline.currentTime;
  const started = typeof timelineTime === "number" ? timelineTime : performance.now();
  let frame = 0, disposed = false, lastTop = origin.top;
  sizeCoverDock(dock, origin);
  const paint = (progress: number) => {
    const surface = host.getBoundingClientRect();
    // Start immediately, then ease out through the whole safe area.
    const eased = 1 - Math.pow(1 - progress, 3);
    lastTop = Math.max(lastTop, origin.top + Math.max(0, surface.bottom + 8 - origin.top) * eased);
    dock.style.left = origin.left - surface.left + "px";
    dock.style.top = lastTop - surface.top + "px";
  };
  paint(0);
  const tick = (now: number) => {
    if (disposed) return;
    const progress = Math.min(1, Math.max(0, (now - started) / COVER_DOCK_DROP_MS));
    paint(progress);
    if (progress < 1) frame = requestAnimationFrame(tick);
    else { dock.style.visibility = "hidden"; onComplete?.(); }
  };
  frame = requestAnimationFrame(tick);
  return () => { disposed = true; cancelAnimationFrame(frame); };
}

/** One shared poster width for every shape, with portrait-safe room on short screens. */
export function coverEntranceLayout(width: number, height: number, offsetTop: number, aspectRatio: number) {
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const w = Math.max(1, width), h = Math.max(1, height);
  const coverWidth = Math.min(320, w * 0.74, h * 0.42);
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
