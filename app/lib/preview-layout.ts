export type PreviewLayoutTransition = {
  rebase: () => number;
  start: (preview: boolean) => void;
  cancel: () => void;
};

/** Hold the outgoing scroll range before React swaps editor clearance for the
 * reader footer. Release only that extra space, on the toolbar's easing clock.
 * Native scroll clamping then follows it smoothly, without translating photos
 * or forcing scroll positions while someone is touching the page. */
export function preparePreviewLayout(
  canvas: HTMLElement | null,
  previous: PreviewLayoutTransition | null,
  duration: number,
): PreviewLayoutTransition | null {
  let outgoingHeight = canvas?.getBoundingClientRect().height ?? 0;
  const outgoingTop = canvas ? canvas.getBoundingClientRect().top + window.scrollY : 0;
  const anchor = canvas?.querySelector<HTMLElement>(".strip-block:not(.sticker-block)");
  const outgoingOrigin = anchor ? anchor.getBoundingClientRect().top + window.scrollY : null;
  previous?.cancel();
  if (!canvas || outgoingHeight <= 0) return null;
  const root = document.documentElement;
  const originalMinimum = canvas.style.minHeight;
  let frame = 0;
  let disposed = false;
  let rebased = false;
  let controls: HTMLElement | null = null;
  let originalOpacity = "";
  canvas.style.minHeight = `${outgoingHeight}px`;
  root.classList.add("inline-preview-layout-moving");

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
    canvas.style.minHeight = originalMinimum;
    if (controls) controls.style.opacity = originalOpacity;
    root.classList.remove("inline-preview-layout-moving");
    syncBoundary();
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
      const delta = anchor.getBoundingClientRect().top + window.scrollY - outgoingOrigin;
      const wrapperShift = canvas.getBoundingClientRect().top + window.scrollY - outgoingTop;
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
      const naturalHeight = Math.max(preview ? 0 : window.innerHeight,
        strip.getBoundingClientRect().height + (ending?.getBoundingClientRect().height ?? 0));
      const reserve = Math.max(0, outgoingHeight - naturalHeight);
      // Keep the white surface and the last block's corner fill opaque. Only
      // the incoming controls fade, so there is never a translucent edge seam.
      controls = preview ? canvas.querySelector<HTMLElement>(".strip-ending-card-inner") : null;
      originalOpacity = controls?.style.opacity ?? "";
      const timelineTime = document.timeline.currentTime;
      const started = typeof timelineTime === "number" ? timelineTime : performance.now();
      const paint = (progress: number) => {
        const eased = 1 - Math.pow(1 - progress, 3);
        canvas.style.minHeight = `${naturalHeight + reserve * (1 - eased)}px`;
        if (controls) controls.style.opacity = String(eased);
        syncBoundary();
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
