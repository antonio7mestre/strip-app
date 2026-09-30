export type PreviewLayoutTransition = { start: (preview: boolean) => void; cancel: () => void };

/** Hold the outgoing scroll range before React swaps editor clearance for the
 * reader footer. Release only that extra space, on the toolbar's easing clock.
 * Native scroll clamping then follows it smoothly, without translating photos
 * or forcing scroll positions while someone is touching the page. */
export function preparePreviewLayout(
  canvas: HTMLElement | null,
  previous: PreviewLayoutTransition | null,
  duration: number,
): PreviewLayoutTransition | null {
  const outgoingHeight = canvas?.getBoundingClientRect().height ?? 0;
  previous?.cancel();
  if (!canvas || outgoingHeight <= 0) return null;
  const root = document.documentElement;
  const originalMinimum = canvas.style.minHeight;
  let frame = 0;
  let disposed = false;
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
    start(preview) {
      if (disposed) return;
      const strip = canvas.querySelector<HTMLElement>(".strip-canvas");
      if (!strip) { cancel(); return; }
      const naturalHeight = Math.max(window.innerHeight, strip.getBoundingClientRect().height);
      const reserve = Math.max(0, outgoingHeight - naturalHeight);
      // Keep the white surface and the last block's corner fill opaque. Only
      // the incoming controls fade, so there is never a translucent edge seam.
      controls = preview ? strip.querySelector<HTMLElement>(".strip-ending-card-inner") : null;
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
