/** Keep native momentum inside the tray without rebasing Safari's document. */
export function installStickerTrayScroll(getScroller: () => HTMLElement | null) {
  const root = document.documentElement;
  root.classList.add("sticker-tray-open");
  let lastY: number | null = null;
  let scrollGesture = false;
  const canScroll = (target: EventTarget | null, delta: number) => {
    const scroller = getScroller();
    if (!scroller || !(target instanceof Node) || !scroller.contains(target)) return false;
    const max = scroller.scrollHeight - scroller.clientHeight;
    return max > 1 && (delta > 0 ? scroller.scrollTop < max - 1 : delta < 0 ? scroller.scrollTop > 1 : true);
  };
  const start = (event: TouchEvent) => {
    lastY = event.touches.length === 1 ? event.touches[0].clientY : null;
    const scroller = getScroller();
    scrollGesture = Boolean(scroller && event.target instanceof Node && scroller.contains(event.target));
  };
  const move = (event: TouchEvent) => {
    const y = event.touches[0]?.clientY;
    const delta = lastY === null || y === undefined ? 0 : lastY - y;
    lastY = y ?? null;
    if (event.touches.length === 1 && scrollGesture && canScroll(event.target, delta)) return;
    if (event.cancelable) event.preventDefault();
  };
  const end = () => { lastY = null; scrollGesture = false; };
  const wheel = (event: WheelEvent) => {
    if (!canScroll(event.target, event.deltaY) && event.cancelable) event.preventDefault();
  };
  document.addEventListener("touchstart", start, { passive: true, capture: true });
  document.addEventListener("touchmove", move, { passive: false, capture: true });
  document.addEventListener("touchend", end, { passive: true, capture: true });
  document.addEventListener("touchcancel", end, { passive: true, capture: true });
  document.addEventListener("wheel", wheel, { passive: false, capture: true });
  return () => {
    root.classList.remove("sticker-tray-open");
    document.removeEventListener("touchstart", start, true);
    document.removeEventListener("touchmove", move, true);
    document.removeEventListener("touchend", end, true);
    document.removeEventListener("touchcancel", end, true);
    document.removeEventListener("wheel", wheel, true);
  };
}
