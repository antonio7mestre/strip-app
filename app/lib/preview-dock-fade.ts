import { COVER_DOCK_DROP_MS, type CoverDockOrigin } from "./cover-entrance";
import { STRIP_FOOTER_BACKGROUND } from "./strip-ending";
import { paintPreviewBottom } from "./preview-layout";
import { easePreviewHandoff } from "./preview-motion";

/** At the ending, exchange controls in place. Moving the entire white dock
 * exposes a sliding white stripe under Safari, followed by a separate tint snap. */
export function fadePreviewDock(
  host: HTMLElement, dock: HTMLElement, origin: CoverDockOrigin,
  preview: boolean, onComplete: () => void, fromOpacity = preview ? 1 : 0,
) {
  const timelineTime = document.timeline.currentTime;
  const started = typeof timelineTime === "number" ? timelineTime : performance.now();
  let frame = 0, disposed = false;
  const target = preview ? 0 : 1;
  const gray = [1, 3, 5].map(index => parseInt(STRIP_FOOTER_BACKGROUND.slice(index, index + 2), 16));
  Object.assign(dock.style, { width: `${origin.width}px`, height: `${origin.height}px`,
    padding: origin.padding, borderRadius: origin.borderRadius, boxShadow: origin.boxShadow,
    visibility: "visible" });
  if (origin.cornerShape) dock.style.setProperty("corner-shape", origin.cornerShape);
  const paint = (progress: number) => {
    const bounds = host.getBoundingClientRect();
    const eased = easePreviewHandoff(progress);
    const opacity = fromOpacity + (target - fromOpacity) * eased;
    // Only compensate the document paint surface. The visible top never slides.
    dock.style.left = `${origin.left - bounds.left}px`;
    dock.style.top = `${origin.top - bounds.top}px`;
    dock.style.opacity = String(opacity);
    const color = "#" + gray.map(channel => Math.round(channel + (255 - channel) * opacity)
      .toString(16).padStart(2, "0")).join("");
    paintPreviewBottom(color);
  };
  paint(0);
  const tick = (now: number) => {
    if (disposed) return;
    const progress = Math.min(1, Math.max(0, (now - started) / COVER_DOCK_DROP_MS));
    paint(progress);
    if (progress < 1) frame = requestAnimationFrame(tick);
    else onComplete();
  };
  frame = requestAnimationFrame(tick);
  return () => { disposed = true; cancelAnimationFrame(frame); };
}
