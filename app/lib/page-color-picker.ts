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

/** Both editor samplers use the same handle-only gesture. Releasing a drag
 * never confirms or closes the picker; only the tray's checkmark does that. */
export function installPageColorDrag({ onSample, onDraggingChange }: {
  onSample: (clientX: number, clientY: number) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  let pointerId: number | null = null;
  let indicator: HTMLElement | null = null;
  const root = document.documentElement;
  root.classList.add("page-color-picking");
  const own = (event: PointerEvent) => { event.preventDefault(); event.stopPropagation(); };
  const release = () => {
    const id = pointerId;
    pointerId = null;
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
    if (pointerId !== null && event.cancelable) event.preventDefault();
  };
  const preventSelection = (event: Event) => event.preventDefault();
  document.addEventListener("pointerdown", down, { capture: true, passive: false });
  document.addEventListener("pointermove", move, { capture: true, passive: false });
  document.addEventListener("pointerup", up, { capture: true, passive: false });
  document.addEventListener("pointercancel", cancel, true);
  document.addEventListener("lostpointercapture", cancel, true);
  document.addEventListener("touchmove", touchMove, { capture: true, passive: false });
  document.addEventListener("selectstart", preventSelection, true);
  return () => {
    document.removeEventListener("pointerdown", down, true);
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", up, true);
    document.removeEventListener("pointercancel", cancel, true);
    document.removeEventListener("lostpointercapture", cancel, true);
    document.removeEventListener("touchmove", touchMove, true);
    document.removeEventListener("selectstart", preventSelection, true);
    release();
    root.classList.remove("page-color-picking");
  };
}
