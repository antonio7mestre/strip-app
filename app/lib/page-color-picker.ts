/** Use the visible screen, not the position of a tray that may be animating. */
export function pageColorPickerCenter(viewport: {
  innerWidth: number;
  innerHeight: number;
  visualViewport?: { offsetLeft: number; offsetTop: number; width: number; height: number } | null;
}) {
  const visible = viewport.visualViewport;
  return {
    x: (visible?.offsetLeft ?? 0) + (visible?.width ?? viewport.innerWidth) / 2,
    y: (visible?.offsetTop ?? 0) + (visible?.height ?? viewport.innerHeight) / 2,
  };
}

/** All page samplers use the same handle-only gesture. Releasing a drag
 * never confirms or closes the picker; only the tray's checkmark does that. */
export function installPageColorDrag({ onSample, onDraggingChange }: {
  onSample: (clientX: number, clientY: number) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  let pointerId: number | null = null;
  let indicator: HTMLElement | null = null;
  let scrollAnchor: { x: number; y: number } | null = null;
  const root = document.documentElement;
  root.classList.add("page-color-picking");
  const own = (event: PointerEvent) => { event.preventDefault(); event.stopPropagation(); };
  const release = () => {
    const id = pointerId;
    pointerId = null;
    scrollAnchor = null;
    root.classList.remove("page-color-dragging");
    onDraggingChange(false);
    if (id !== null && indicator?.hasPointerCapture(id)) indicator.releasePointerCapture(id);
    indicator = null;
  };
  const down = (event: PointerEvent) => {
    if (pointerId !== null || !(event.target instanceof Element) ||
      (event.pointerType === "mouse" && event.button !== 0) ||
      event.target.closest(".selector-dock, .profile-editor-dock, .block-controls")) return;
    const handle = event.target.closest<HTMLElement>(".page-color-picker-indicator");
    if (!handle) return;
    own(event);
    pointerId = event.pointerId;
    indicator = handle;
    scrollAnchor = { x: window.scrollX, y: window.scrollY };
    root.classList.add("page-color-dragging");
    handle.setPointerCapture(pointerId);
    onDraggingChange(true);
    onSample(event.clientX, event.clientY);
  };
  const move = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    own(event);
    onSample(event.clientX, event.clientY);
  };
  const up = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    own(event);
    onSample(event.clientX, event.clientY);
    release();
  };
  const cancel = (event: PointerEvent) => { if (pointerId === event.pointerId) release(); };
  const touchMove = (event: TouchEvent) => {
    if (pointerId !== null && event.cancelable) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  // WebKit can queue a scroll or focus pan even after a pointer is captured.
  // Hold the document's existing position only for the active drag, without
  // swapping its scrolling surface or disabling off-handle page scrolling.
  const holdScroll = () => {
    if (scrollAnchor && (window.scrollX !== scrollAnchor.x || window.scrollY !== scrollAnchor.y)) {
      window.scrollTo({ left: scrollAnchor.x, top: scrollAnchor.y, behavior: "instant" });
    }
  };
  const wheel = (event: WheelEvent) => {
    if (pointerId !== null && event.cancelable) event.preventDefault();
  };
  const preventSelection = (event: Event) => event.preventDefault();
  document.addEventListener("pointerdown", down, { capture: true, passive: false });
  document.addEventListener("pointermove", move, { capture: true, passive: false });
  document.addEventListener("pointerup", up, { capture: true, passive: false });
  document.addEventListener("pointercancel", cancel, true);
  document.addEventListener("lostpointercapture", cancel, true);
  document.addEventListener("touchmove", touchMove, { capture: true, passive: false });
  document.addEventListener("touchstart", touchMove, { capture: true, passive: false });
  window.addEventListener("scroll", holdScroll, { capture: true, passive: true });
  window.addEventListener("wheel", wheel, { capture: true, passive: false });
  document.addEventListener("selectstart", preventSelection, true);
  return () => {
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", up, true);
    document.removeEventListener("pointercancel", cancel, true);
    document.removeEventListener("lostpointercapture", cancel, true);
    document.removeEventListener("touchmove", touchMove, true);
    document.removeEventListener("touchstart", touchMove, true);
    window.removeEventListener("scroll", holdScroll, true);
    window.removeEventListener("wheel", wheel, true);
    document.removeEventListener("selectstart", preventSelection, true);
    release();
    root.classList.remove("page-color-picking");
  };
}
