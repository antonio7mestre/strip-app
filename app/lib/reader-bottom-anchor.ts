/** Keep an already-reached reader ending above Safari's returning controls.
 * The footer stays in normal flow. No paint layer, spacer or touch interception. */
export function installReaderBottomAnchor(enabled: boolean) {
  const viewport = window.visualViewport;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!enabled || !viewport || !ios || window.innerWidth >= 900) return;
  const root = document.scrollingElement ?? document.documentElement;
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
  let updating = false;
  let disposed = false;
  const sync = () => {
    if (disposed || updating) return;
    const next = read();
    const shrinking = next.height < last.height - 0.5 || next.layoutHeight < last.layoutHeight - 0.5;
    const movingAway = next.top < last.top - 3;
    const samePage = Math.abs(next.width - last.width) < 1 && Math.abs(next.contentHeight - last.contentHeight) < 1;
    const typing = document.activeElement?.matches('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]');
    // Resize and scroll can arrive in either order. Compare against the prior
    // viewport before updating bottom membership, not the newly exposed gap.
    if (pinned && shrinking && !movingAway && samePage && !typing && viewport.scale === 1 &&
        last.height - next.height < 180) {
      const target = Math.max(0, next.contentHeight - next.height);
      if (target > next.top + 0.5) {
        updating = true;
        // Safari owns the animation clock. Follow this frame immediately;
        // smooth scrolling or a timeout would make the buttons arrive later.
        window.scrollTo({ top: target, left: window.scrollX, behavior: "auto" });
        updating = false;
      }
    }
    last = read();
    pinned = atBottom(last);
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
  };
}
