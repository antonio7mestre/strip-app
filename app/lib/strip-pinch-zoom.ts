const RETURN_FREQUENCY = 20;
const BLOCKED_TARGET = "button, a, input, textarea, select, [contenteditable], [role=dialog]";

/** A critically damped return, identical at 60/120 Hz and with no overshoot. */
export function stripZoomReturn(elapsedMs: number) {
  const t = Math.max(0, elapsedMs) / 1000;
  return (1 + RETURN_FREQUENCY * t) * Math.exp(-RETURN_FREQUENCY * t);
}

export function boundedStripZoom(scale: number) {
  return Math.min(3, Math.max(0.8, Number.isFinite(scale) ? scale : 1));
}

type Point = { x: number; y: number };
type SafariGesture = Event & { scale?: number; clientX?: number; clientY?: number };

/** Temporary content magnification, never browser viewport zoom. The real media
 * stays mounted and playing. The fixed footer/tools are outside the canvas and
 * the clipping parent keeps document dimensions unchanged while pinching.
 * All transforms and clipping are removed after release, including on exit. */
export function installStripPinchZoom() {
  const root = document.documentElement;
  root.classList.add("page-zoom-spring");
  let visual: {
    canvas: HTMLElement; clip: HTMLElement; left: number; top: number;
    originalTransform: string; originalOrigin: string;
    origin: Point; scale: number; x: number; y: number;
  } | null = null;
  let gesture: {
    mode: "touch" | "gesture" | "wheel"; center: Point;
    distance: number; scale: number; x: number; y: number;
  } | null = null;
  let frame: number | null = null;
  let wheelTimer: ReturnType<typeof setTimeout> | null = null;
  let touches = 0;
  let ownsTouch = false;
  let suppressClick = false;

  const prevent = (event: Event) => { if (event.cancelable) event.preventDefault(); };
  const stopReturn = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    if (wheelTimer !== null) clearTimeout(wheelTimer);
    wheelTimer = null;
  };
  const clearVisual = () => {
    stopReturn();
    gesture = null;
    if (visual) {
      visual.canvas.style.transform = visual.originalTransform;
      visual.canvas.style.transformOrigin = visual.originalOrigin;
      visual.clip.removeAttribute("data-strip-zoom-clip");
      visual = null;
    }
    root.classList.remove("strip-pinch-active");
  };
  const paint = () => {
    if (!visual) return;
    visual.canvas.style.transformOrigin = `${visual.origin.x}px ${visual.origin.y}px`;
    visual.canvas.style.transform = `translate(${visual.x}px, ${visual.y}px) scale(${visual.scale})`;
  };
  const release = () => {
    if (!gesture || !visual) return;
    stopReturn();
    gesture = null;
    const released = { scale: visual.scale, x: visual.x, y: visual.y };
    const start = performance.now();
    const tick = (now: number) => {
      if (!visual) return;
      const remaining = stripZoomReturn(now - start);
      visual.scale = 1 + (released.scale - 1) * remaining;
      visual.x = released.x * remaining;
      visual.y = released.y * remaining;
      if (remaining < 0.001) { clearVisual(); return; }
      paint();
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
  };
  const canvasFor = (target: EventTarget | null) => {
    if (!(target instanceof Element) || target.closest(BLOCKED_TARGET)) return null;
    const canvas = target.closest<HTMLElement>(".strip-canvas");
    const page = canvas?.closest(".published-mode, .preview-mode, .editor-mode");
    if (!canvas || !page || canvas.closest("[inert]")) return null;
    // Selected stickers already own a canvas-wide pinch/rotate gesture. Text,
    // cropping, and transient dialogs must keep their own input handling too.
    if (page.matches(".editor-mode:not(.is-strip-reader)") &&
        (page.matches(".is-typing, .is-height-cropping") ||
         page.querySelector(".sticker-block.is-selected, textarea:focus, [contenteditable]:focus"))) return null;
    return canvas;
  };
  const begin = (canvas: HTMLElement, center: Point, mode: "touch" | "gesture" | "wheel", distance = 1) => {
    stopReturn();
    if (visual && visual.canvas !== canvas) clearVisual();
    if (!visual) {
      const clip = canvas.parentElement;
      if (!clip) return;
      const rect = canvas.getBoundingClientRect();
      visual = { canvas, clip, left: rect.left, top: rect.top,
        originalTransform: canvas.style.transform, originalOrigin: canvas.style.transformOrigin,
        origin: { x: 0, y: 0 }, scale: 1, x: 0, y: 0 };
      clip.setAttribute("data-strip-zoom-clip", "");
      root.classList.add("strip-pinch-active");
    }
    // Re-grabbing a returning spring keeps its exact on-screen position.
    const local = { x: center.x - visual.left, y: center.y - visual.top };
    const nextOrigin = {
      x: (local.x - visual.x - (1 - visual.scale) * visual.origin.x) / visual.scale,
      y: (local.y - visual.y - (1 - visual.scale) * visual.origin.y) / visual.scale,
    };
    visual.origin = nextOrigin;
    visual.x = local.x - nextOrigin.x;
    visual.y = local.y - nextOrigin.y;
    gesture = { mode, center, distance: Math.max(1, distance), scale: visual.scale, x: visual.x, y: visual.y };
    paint();
  };
  const update = (scale: number, center: Point) => {
    if (!visual || !gesture) return;
    visual.scale = boundedStripZoom(scale);
    visual.x = gesture.x + center.x - gesture.center.x;
    visual.y = gesture.y + center.y - gesture.center.y;
    paint();
  };
  const touchGeometry = (event: TouchEvent) => {
    const [a, b] = [event.touches[0], event.touches[1]];
    return { center: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
      distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY) };
  };
  const touchStart = (event: TouchEvent) => {
    touches = event.touches.length;
    if (touches === 1) { suppressClick = false; return; }
    prevent(event);
    if (gesture?.mode === "touch") return;
    const canvas = canvasFor(event.target);
    if (!canvas) return;
    const { center, distance } = touchGeometry(event);
    ownsTouch = true;
    suppressClick = true;
    begin(canvas, center, "touch", distance);
  };
  const touchMove = (event: TouchEvent) => {
    if (event.touches.length > 1 || ownsTouch) prevent(event);
    if (gesture?.mode !== "touch" || event.touches.length < 2) return;
    const { center, distance } = touchGeometry(event);
    update(gesture.scale * distance / gesture.distance, center);
  };
  const touchEnd = (event: TouchEvent) => {
    touches = event.touches.length;
    if (touches < 2 && gesture?.mode === "touch") release();
    if (!touches) ownsTouch = false;
  };
  const touchCancel = () => { touches = 0; ownsTouch = false; release(); };
  const gestureStart = (event: SafariGesture) => {
    prevent(event);
    if (touches > 0 || gesture?.mode === "wheel") return;
    const canvas = canvasFor(event.target);
    if (canvas) begin(canvas, { x: event.clientX ?? window.innerWidth / 2,
      y: event.clientY ?? window.innerHeight / 2 }, "gesture");
  };
  const gestureMove = (event: SafariGesture) => {
    prevent(event);
    if (gesture?.mode === "gesture") update(gesture.scale * (event.scale ?? 1), gesture.center);
  };
  const gestureEnd = (event: Event) => {
    prevent(event);
    if (gesture?.mode === "gesture") release();
  };
  const wheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    prevent(event);
    if (touches || gesture?.mode === "gesture") return;
    const canvas = canvasFor(event.target);
    if (!canvas) return;
    const center = { x: event.clientX, y: event.clientY };
    if (gesture?.mode !== "wheel") begin(canvas, center, "wheel");
    if (!visual) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    update(visual.scale * Math.exp(-event.deltaY * unit * 0.01), center);
    if (wheelTimer !== null) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(release, 140);
  };
  const click = (event: MouseEvent) => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    prevent(event);
    event.stopPropagation();
  };
  const interrupt = () => { ownsTouch = false; touches = 0; clearVisual(); };
  const visibility = () => { if (document.hidden) interrupt(); };
  const scroll = () => { if (!gesture && !ownsTouch) clearVisual(); };
  const blocking = { capture: true, passive: false };
  const passive = { capture: true, passive: true };
  document.addEventListener("touchstart", touchStart, blocking);
  document.addEventListener("touchmove", touchMove, blocking);
  document.addEventListener("touchend", touchEnd, passive);
  document.addEventListener("touchcancel", touchCancel, passive);
  document.addEventListener("gesturestart", gestureStart, blocking);
  document.addEventListener("gesturechange", gestureMove, blocking);
  document.addEventListener("gestureend", gestureEnd, blocking);
  document.addEventListener("wheel", wheel, blocking);
  document.addEventListener("click", click, true);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("blur", interrupt);
  window.addEventListener("resize", interrupt);
  window.addEventListener("scroll", scroll, { passive: true, capture: true });
  return () => {
    interrupt();
    root.classList.remove("page-zoom-spring");
    document.removeEventListener("touchstart", touchStart, true);
    document.removeEventListener("touchmove", touchMove, true);
    document.removeEventListener("touchend", touchEnd, true);
    document.removeEventListener("touchcancel", touchCancel, true);
    document.removeEventListener("gesturestart", gestureStart, true);
    document.removeEventListener("gesturechange", gestureMove, true);
    document.removeEventListener("gestureend", gestureEnd, true);
    document.removeEventListener("wheel", wheel, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("blur", interrupt);
    window.removeEventListener("resize", interrupt);
    window.removeEventListener("scroll", scroll, true);
  };
}
