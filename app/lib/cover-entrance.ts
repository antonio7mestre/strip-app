export const COVER_MOVE_MS = 1400;
export const COVER_FADE_MS = 650;
export const COVER_PROGRESS_CELLS = 24;
export const COVER_DOCK_DROP_MS = 420;
export const COVER_APPEAR_MS = 180;

/** The paper rim is 2.25% of the outer width on every side. */
export function stickerAspectRatio(mediaRatio: number) {
  const ratio = Number.isFinite(mediaRatio) && mediaRatio > 0 ? mediaRatio : 1;
  return 1 / (0.955 / ratio + 0.045);
}

/** A small lift for browsers without a flexible 3D surface. Never turn the
 * sticker over: the leading edge curls in the primary mesh renderer. */
export function stickerLiftKeyframes(direction: number): Keyframe[] {
  const side = direction < 0 ? -1 : 1;
  return Array.from({ length: 41 }, (_, i) => {
    const t = i / 40, arc = i === 40 ? 0 : Math.sin(Math.PI * t);
    const turn = -8 * side * arc;
    return { offset: t, transform: `perspective(700px) translateZ(${(32 * arc).toFixed(3)}px) rotateX(${(-12 * arc).toFixed(3)}deg) rotateY(${turn.toFixed(3)}deg) rotateZ(${(-5 * side * Math.sin(2 * Math.PI * t)).toFixed(3)}deg)` };
  });
}

export type CoverOrigin = { left: number; top: number; width: number; height: number; image?: HTMLImageElement | null };
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
  return moveCoverDock(host, dock, origin, "down", onComplete);
}

/** Preview uses the same complete surface, reversed on the way back to edit.
 * An interrupted transition resumes from its painted edge, without a jump. */
export function moveCoverDock(host: HTMLElement, dock: HTMLElement, origin: CoverDockOrigin,
  direction: "down" | "up", onComplete?: () => void, fromTop?: number) {
  // Use the rendering clock so Safari starts moving on the first available frame.
  const timelineTime = typeof document === "undefined" ? null : document.timeline.currentTime;
  const started = typeof timelineTime === "number" ? timelineTime : performance.now();
  const startTop = fromTop ?? (direction === "down" ? origin.top : host.getBoundingClientRect().bottom + 8);
  let frame = 0, disposed = false, lastTop = startTop;
  sizeCoverDock(dock, origin);
  const paint = (progress: number) => {
    const surface = host.getBoundingClientRect();
    // Start immediately, then ease out through the whole safe area.
    const eased = 1 - Math.pow(1 - progress, 3);
    const target = direction === "down" ? Math.max(startTop, surface.bottom + 8) : origin.top;
    const nextTop = startTop + (target - startTop) * eased;
    lastTop = direction === "down" ? Math.max(lastTop, nextTop) : Math.min(lastTop, nextTop);
    dock.style.left = origin.left - surface.left + "px";
    dock.style.top = lastTop - surface.top + "px";
  };
  paint(0);
  const tick = (now: number) => {
    if (disposed) return;
    const progress = Math.min(1, Math.max(0, (now - started) / COVER_DOCK_DROP_MS));
    paint(progress);
    if (progress < 1) frame = requestAnimationFrame(tick);
    else { if (direction === "down") dock.style.visibility = "hidden"; onComplete?.(); }
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

/** Also handle cached images whose load event happened before hydration. */
export function watchCoverImage(image: HTMLImageElement, onReady: () => void, onError: () => void) {
  let disposed = false, settling = false;
  const fail = () => { if (!disposed && !settling) { settling = true; onError(); } };
  const ready = async () => {
    if (disposed || settling) return;
    settling = true;
    await image.decode().catch(() => {});
    if (!disposed) { if (image.naturalWidth > 0) onReady(); else onError(); }
  };
  image.addEventListener("load", ready);
  image.addEventListener("error", fail);
  if (image.complete) { if (image.naturalWidth > 0) void ready(); else fail(); }
  return () => {
    disposed = true;
    image.removeEventListener("load", ready);
    image.removeEventListener("error", fail);
  };
}

/** Direct loads only: show decoded pixels before releasing the progress bar. */
export function fadeInCover(cover: HTMLElement, onComplete: () => void) {
  let frame = 0, started: number | null = null, disposed = false;
  cover.style.opacity = "0";
  const tick = (now: number) => {
    if (disposed) return;
    started ??= now;
    const t = Math.max(0, Math.min(1, (now - started) / COVER_APPEAR_MS));
    cover.style.opacity = String(1 - Math.pow(1 - t, 3));
    if (t < 1) frame = requestAnimationFrame(tick);
    else onComplete();
  };
  frame = requestAnimationFrame(tick);
  return () => { disposed = true; cancelAnimationFrame(frame); };
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
