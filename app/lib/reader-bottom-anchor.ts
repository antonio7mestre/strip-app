/** Follow Safari's returning controls without interrupting its native swipe.
 * Only the already-reached ending moves. Its flow size and page scroll stay
 * untouched, even when visual and layout resize arrive separately. */
export function installReaderBottomAnchor(enabled: boolean) {
  const viewport = window.visualViewport;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!enabled || !viewport || !ios || window.innerWidth >= 900) return;
  const root = document.scrollingElement ?? document.documentElement;
  const ending = document.querySelector<HTMLElement>(".is-strip-reader .strip-end-sheet");
  if (!ending) return;
  const read = () => ({
    top: window.scrollY,
    height: Math.min(window.innerHeight, viewport.offsetTop + viewport.height),
    layoutHeight: window.innerHeight,
    width: window.innerWidth,
    contentHeight: root.scrollHeight,
  });
  let last = read();
  const atBottom = (state: ReturnType<typeof read>) =>
    state.contentHeight - state.top - state.layoutHeight <= 3;
  let pinned = atBottom(last);
  let expandedFrom = 0;
  let lift = 0;
  let disposed = false;
  const paint = (nextLift: number, animate: boolean) => {
    if (nextLift === lift) return;
    lift = nextLift;
    ending.style.setProperty("--reader-ending-motion", animate ? "160ms" : "0ms");
    ending.style.setProperty("--reader-ending-lift", `${lift}px`);
    ending.toggleAttribute("data-reader-toolbar-lift", lift > 0);
  };
  const sync = () => {
    if (disposed) return;
    const next = read();
    const shrinking = next.height < last.height - 0.5;
    const moved = Math.abs(next.top - last.top) > 0.5;
    const movingAway = next.top < last.top - 3;
    // The existing two-pixel footer paint overlap can leave scrollable overflow
    // as the footer lifts. That is not a new block or a layout change.
    const samePage = Math.abs(next.width - last.width) < 1 && Math.abs(next.contentHeight - last.contentHeight) <= 3;
    const typing = document.activeElement?.matches('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]');
    const valid = samePage && !typing && viewport.scale === 1 && window.innerWidth < 900 &&
      Math.abs(last.height - next.height) < 180;
    if (!valid) {
      expandedFrom = 0;
      paint(0, false);
    } else {
      if (!expandedFrom && pinned && shrinking && !movingAway) expandedFrom = last.height;
      if (expandedFrom) {
        const chrome = Math.max(0, expandedFrom - next.height);
        const gap = Math.max(0, next.contentHeight - next.top - next.height);
        const nextLift = Math.min(chrome, gap);
        // Never scrollTo: that cancels momentum on affected iOS releases.
        // Ease a late viewport jump, but follow streamed resize frames and
        // native scrolling directly instead of restarting an animation.
        paint(nextLift, !moved && Math.abs(nextLift - lift) > 24);
        const endingBelowScreen = gap - nextLift > ending.offsetHeight + 2;
        if (chrome <= 0 || endingBelowScreen) {
          expandedFrom = 0;
          paint(0, false);
        }
      }
    }
    last = next;
    pinned = atBottom(next);
  };
  window.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync, { passive: true });
  viewport.addEventListener("resize", sync, { passive: true });
  viewport.addEventListener("scroll", sync, { passive: true });
  return () => {
    disposed = true;
    window.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
    viewport.removeEventListener("resize", sync);
    viewport.removeEventListener("scroll", sync);
    ending.style.removeProperty("--reader-ending-lift");
    ending.style.removeProperty("--reader-ending-motion");
    ending.removeAttribute("data-reader-toolbar-lift");
  };
}
