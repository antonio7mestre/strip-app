/** Keep native momentum inside the tray without rebasing Safari's document. */
export function installStickerTrayScroll(
  getScroller: () => HTMLElement | null,
  getHorizontalScrollers: () => Array<HTMLElement | null> = () => [],
) {
  const root = document.documentElement;
  root.classList.add("sticker-tray-open");
  type Axis = "x" | "y";
  let last: { x: number; y: number } | null = null;
  let startPoint: typeof last = null;
  let gestureAxis: Axis | null = null;
  let gestureTarget: EventTarget | null = null;
  const canScroll = (target: EventTarget | null, delta: number, axis: Axis) => {
    if (!(target instanceof Node)) return false;
    const scroller = axis === "x"
      ? getHorizontalScrollers().find(element => element?.contains(target))
      : getScroller();
    if (!scroller || !scroller.contains(target)) return false;
    const max = axis === "x" ? scroller.scrollWidth - scroller.clientWidth : scroller.scrollHeight - scroller.clientHeight;
    const offset = axis === "x" ? scroller.scrollLeft : scroller.scrollTop;
    return max > 1 && (delta > 0 ? offset < max - 1 : delta < 0 ? offset > 1 : true);
  };
  const start = (event: TouchEvent) => {
    last = event.touches.length === 1 ? { x: event.touches[0].clientX ?? 0, y: event.touches[0].clientY } : null;
    startPoint = last;
    gestureAxis = null;
    gestureTarget = event.target;
  };
  const move = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (event.touches.length === 1 && touch && last && startPoint) {
      const x = touch.clientX ?? 0, y = touch.clientY;
      // Ignore initial finger jitter before deciding the gesture direction.
      if (!gestureAxis && Math.max(Math.abs(startPoint.x - x), Math.abs(startPoint.y - y)) < 4 &&
        (canScroll(gestureTarget, 0, "x") || canScroll(gestureTarget, 0, "y"))) return;
      gestureAxis ??= Math.abs(startPoint.x - x) > Math.abs(startPoint.y - y) ? "x" : "y";
      const delta = gestureAxis === "x" ? last.x - x : last.y - y;
      last = { x, y };
      if (canScroll(gestureTarget, delta, gestureAxis)) return;
    }
    if (event.cancelable) event.preventDefault();
  };
  const end = () => { last = null; startPoint = null; gestureAxis = null; gestureTarget = null; };
  const wheel = (event: WheelEvent) => {
    const horizontal = Math.abs(event.deltaX || 0) > Math.abs(event.deltaY) || event.shiftKey;
    const delta = horizontal ? event.deltaX || event.deltaY : event.deltaY;
    if (!canScroll(event.target, delta, horizontal ? "x" : "y") && event.cancelable) event.preventDefault();
  };
  const key = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === " " && event.target instanceof Element && event.target.closest("button")) return;
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, PageDown: 1, End: 1, " ": event.shiftKey ? -1 : 1, ArrowUp: -1, PageUp: -1, Home: -1 }[event.key];
    const axis = event.key === "ArrowRight" || event.key === "ArrowLeft" ? "x" : "y";
    if (delta && !canScroll(event.target, delta, axis)) event.preventDefault();
  };
  document.addEventListener("touchstart", start, { passive: true, capture: true });
  document.addEventListener("touchmove", move, { passive: false, capture: true });
  document.addEventListener("touchend", end, { passive: true, capture: true });
  document.addEventListener("touchcancel", end, { passive: true, capture: true });
  document.addEventListener("wheel", wheel, { passive: false, capture: true });
  document.addEventListener("keydown", key, true);
  return () => {
    root.classList.remove("sticker-tray-open");
    document.removeEventListener("touchstart", start, true);
    document.removeEventListener("touchmove", move, true);
    document.removeEventListener("touchend", end, true);
    document.removeEventListener("touchcancel", end, true);
    document.removeEventListener("wheel", wheel, true);
    document.removeEventListener("keydown", key, true);
  };
}
