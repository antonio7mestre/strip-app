import { pageScrollTop, scrollPageTo, pageViewportHeight } from "./editor-scroll";
import { STRIP_FOOTER_BACKGROUND } from "./strip-ending";
import { easePreviewHandoff } from "./preview-motion";

export type PreviewLayoutTransition = {
  rebase: () => number;
  start: (preview: boolean) => void;
  cancel: () => void;
};

const bottomPaintOwners = new WeakMap<HTMLElement, number>();

/** The layout and toolbar hand the same bottom paint to each other. Neither may
 * expose the root canvas until the other has finished, including a reversal. */
export function retainPreviewBottomPaint() {
  const root = document.documentElement;
  const alreadyHeld = bottomPaintOwners.has(root);
  const initialColor = root.matches(".preview-bottom-canvas-active, .published-bottom-sheet-canvas-active")
    ? STRIP_FOOTER_BACKGROUND : "#FFFFFF";
  bottomPaintOwners.set(root, (bottomPaintOwners.get(root) ?? 0) + 1);
  root.classList.add("preview-bottom-handoff-active");
  const theme = document.querySelector<HTMLMetaElement>("#strip-theme-color");
  // A second owner or a fast reversal must keep the currently painted shade.
  if (!alreadyHeld) paintPreviewBottom(initialColor);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (bottomPaintOwners.get(root) ?? 1) - 1;
    if (remaining > 0) { bottomPaintOwners.set(root, remaining); return; }
    bottomPaintOwners.delete(root);
    root.classList.remove("preview-bottom-handoff-active");
    root.style.removeProperty("--preview-handoff-color");
    const readerOwnsBottom = root.matches(".preview-bottom-canvas-active, .published-bottom-sheet-canvas-active");
    root.style.setProperty("--bottom-safe-area-color", readerOwnsBottom ? STRIP_FOOTER_BACKGROUND : "#000000");
    theme?.setAttribute("content", readerOwnsBottom ? STRIP_FOOTER_BACKGROUND
      : root.style.getPropertyValue("--top-safe-area-color") || "#000000");
  };
}

export function paintPreviewBottom(color: string) {
  const root = document.documentElement;
  if (!bottomPaintOwners.has(root)) return;
  root.style.setProperty("--preview-handoff-color", color);
  root.style.setProperty("--bottom-safe-area-color", color);
  document.querySelector<HTMLMetaElement>("#strip-theme-color")?.setAttribute("content", color);
}

/** Hold the outgoing scroll range before React swaps editor clearance for the
 * reader footer. Release only that extra space, on the toolbar's easing clock.
 * At the very bottom, follow the incoming bottom on that same clock. Otherwise
 * keep the current reading position. Media itself is never translated. */
export function preparePreviewLayout(
  canvas: HTMLElement | null,
  previous: PreviewLayoutTransition | null,
  duration: number,
  onBottomScroll?: (scrollTop: number) => void,
): PreviewLayoutTransition | null {
  let outgoingHeight = canvas?.getBoundingClientRect().height ?? 0;
  const outgoingTop = canvas ? canvas.getBoundingClientRect().top + pageScrollTop() : 0;
  let outgoingScroll = pageScrollTop();
  let followBottom = outgoingHeight > 0 &&
    outgoingTop + outgoingHeight - outgoingScroll - pageViewportHeight() <= 2;
  const anchor = canvas?.querySelector<HTMLElement>(".strip-block:not(.sticker-block)");
  const outgoingOrigin = anchor ? anchor.getBoundingClientRect().top + pageScrollTop() : null;
  const root = document.documentElement;
  // Away from the ending the toolbar still slides fully away as before.
  // At the ending, reserve one shared paint owner while the dock crossfades
  // between editor and reader without moving its visible edge.
  const keepBottomWhite = canvas && outgoingHeight > 0 && window.innerWidth < 900 && (
    root.matches(".preview-bottom-canvas-active, .preview-bottom-handoff-active") ||
    outgoingTop + outgoingHeight - pageScrollTop() <= pageViewportHeight() + 64
  );
  // Acquire before releasing an interrupted transition: no intermediate tint.
  const releaseBottomPaint = keepBottomWhite ? retainPreviewBottomPaint() : () => {};
  previous?.cancel();
  if (!canvas || outgoingHeight <= 0) { releaseBottomPaint(); return null; }
  const originalMinimum = canvas.style.minHeight;
  let frame = 0;
  let disposed = false;
  let rebased = false;
  let controls: HTMLElement | null = null;
  let originalOpacity = "";
  canvas.style.minHeight = `${outgoingHeight}px`;
  root.classList.add("inline-preview-layout-moving");
  const stopFollowing = () => {
    followBottom = false;
    onBottomScroll?.(pageScrollTop());
  };
  for (const event of ["touchstart", "pointerdown", "wheel"]) {
    window.addEventListener(event, stopFollowing, { passive: true });
  }

  const syncBoundary = () => {
    // The document-painted toolbar must not preserve an obsolete page height
    // after the real canvas gets shorter. It clips ink, never adds scroll room.
    const shell = canvas.closest<HTMLElement>(".editor-mode");
    const boundary = document.querySelector<HTMLElement>(".preview-dock-boundary");
    if (shell && boundary) boundary.style.height = `${shell.getBoundingClientRect().bottom + window.scrollY}px`;
  };
  const cancel = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    for (const event of ["touchstart", "pointerdown", "wheel"]) {
      window.removeEventListener(event, stopFollowing);
    }
    canvas.style.minHeight = originalMinimum;
    if (controls) controls.style.opacity = originalOpacity;
    root.classList.remove("inline-preview-layout-moving");
    syncBoundary();
    releaseBottomPaint();
  };
  return {
    cancel,
    rebase() {
      if (disposed || rebased) return 0;
      rebased = true;
      if (!anchor?.isConnected || outgoingOrigin === null) return 0;
      // Measure the actual flow origin after the reader's safe-area styles
      // apply. Safari can report a real safe inset or use the fallback, so an
      // inset-only estimate misses part of the shift on some devices.
      const delta = anchor.getBoundingClientRect().top + pageScrollTop() - outgoingOrigin;
      outgoingScroll = Math.max(0, outgoingScroll + delta);
      const wrapperShift = canvas.getBoundingClientRect().top + pageScrollTop() - outgoingTop;
      outgoingHeight = Math.max(0, outgoingHeight + delta - wrapperShift);
      canvas.style.minHeight = `${outgoingHeight}px`;
      syncBoundary();
      return delta;
    },
    start(preview) {
      if (disposed) return;
      const strip = canvas.querySelector<HTMLElement>(".strip-canvas");
      if (!strip) { cancel(); return; }
      // The reader footer follows the content canvas, exactly as publication
      // does. Keep its height out of sticker coordinates but in this handoff.
      const ending = preview ? canvas.querySelector<HTMLElement>(".strip-ending-card") : null;
      const stripBounds = strip.getBoundingClientRect();
      const canvasBounds = canvas.getBoundingClientRect();
      const naturalHeight = Math.max(preview ? 0 : pageViewportHeight(),
        stripBounds.bottom - canvasBounds.top + (ending?.getBoundingClientRect().height ?? 0));
      const destinationBottom = canvasBounds.top + pageScrollTop() + naturalHeight;
      const reserve = Math.max(0, outgoingHeight - naturalHeight);
      // Keep the footer surface and the last block's corner fill opaque. Only
      // the incoming controls fade, so there is never a translucent edge seam.
      controls = preview ? canvas.querySelector<HTMLElement>(".strip-ending-card-inner") : null;
      originalOpacity = controls?.style.opacity ?? "";
      const timelineTime = document.timeline.currentTime;
      const started = typeof timelineTime === "number" ? timelineTime : performance.now();
      const paint = (progress: number) => {
        const eased = keepBottomWhite ? easePreviewHandoff(progress) : 1 - Math.pow(1 - progress, 3);
        canvas.style.minHeight = `${naturalHeight + reserve * (1 - eased)}px`;
        if (controls) controls.style.opacity = String(eased);
        syncBoundary();
        if (followBottom) {
          const destinationScroll = Math.max(0, destinationBottom - pageViewportHeight());
          const scrollTop = outgoingScroll + (destinationScroll - outgoingScroll) * eased;
          // Keep history restoration on the same moving anchor. The returned
          // dock can otherwise preserve the old, taller preview scroll range.
          onBottomScroll?.(scrollTop);
          scrollPageTo({ top: scrollTop, left: 0, behavior: "instant" });
        }
      };
      paint(0);
      const tick = (now: number) => {
        if (disposed) return;
        const progress = Math.min(1, Math.max(0, (now - started) / duration));
        paint(progress);
        if (progress < 1) frame = requestAnimationFrame(tick);
        else cancel();
      };
      frame = requestAnimationFrame(tick);
    },
  };
}
