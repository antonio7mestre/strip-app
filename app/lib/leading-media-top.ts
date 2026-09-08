const TOP_RETURN_FREQUENCY = 18;

/** Analytic critical damping keeps the same curve at 60 and 120 Hz. */
export function sampleLeadingMediaReturn(distance: number, elapsedSeconds: number) {
  const time = Math.max(0, elapsedSeconds);
  const decay = Math.exp(-TOP_RETURN_FREQUENCY * time);
  return {
    distance: distance * (1 + TOP_RETURN_FREQUENCY * time) * decay,
    velocity: -distance * TOP_RETURN_FREQUENCY ** 2 * time * decay,
  };
}

/** Use a real positive scroll offset so Safari paints media under its top UI. */
export function installLeadingMediaTop({
  inset,
  resetScroll,
  ownsReloadScroll,
}: {
  inset: number;
  resetScroll: boolean;
  ownsReloadScroll: boolean;
}) {
  const root = document.documentElement;
  root.style.setProperty("--leading-image-inset", `${inset}px`);
  root.classList.toggle("leading-image-inset-active", inset > 0);

  let entryFrame: number | null = null;
  let returnFrame: number | null = null;
  let userHasControl = false;
  let armed = resetScroll;
  let touchCount = 0;
  let caughtReturn = false;
  let lastTouchY = 0;
  let returnDistance = 0;
  let returnAnchor = inset;
  const releaseReloadScroll = () => {
    if (ownsReloadScroll && root.dataset.stripReloadScroll === "manual") {
      history.scrollRestoration = "auto";
      delete root.dataset.stripReloadScroll;
    }
  };
  const cancelEntry = () => {
    userHasControl = true;
    if (entryFrame !== null) window.cancelAnimationFrame(entryFrame);
    entryFrame = null;
    releaseReloadScroll();
    document.removeEventListener("pointerdown", cancelEntry, true);
    document.removeEventListener("wheel", cancelEntry, true);
    document.removeEventListener("keydown", cancelEntry, true);
  };
  const clearReturn = () => {
    if (returnFrame !== null) window.cancelAnimationFrame(returnFrame);
    returnFrame = null;
    returnDistance = 0;
    caughtReturn = false;
    root.classList.remove("leading-media-return-active");
    root.style.removeProperty("--leading-media-return-y");
  };
  const paintReturn = (distance: number) => {
    returnDistance = distance;
    root.style.setProperty("--leading-media-return-y", `${distance}px`);
    root.classList.add("leading-media-return-active");
  };
  const editorOwnsPosition = () => Boolean(document.querySelector(
    "html.inline-preview-exit-locked, html.keyboard-open, html.keyboard-settling, " +
    ".editor-mode.is-typing, .image-block.is-height-cropping, .sticker-block.is-transforming",
  ));
  const startReturn = () => {
    if (inset <= 0 || !armed || touchCount > 0 || returnFrame !== null || editorOwnsPosition()) return;
    const distance = inset - window.scrollY + returnDistance;
    if (distance <= 0.1) return;

    // Cancel native rebound once without moving a visible pixel: this translation
    // offsets the scroll-coordinate change, including negative rubber-band Y.
    // Only the spring moves content after the handoff, with no second scroll.
    paintReturn(distance);
    window.scrollTo({ top: inset, left: 0, behavior: "auto" });
    returnAnchor = window.scrollY;
    // If the browser clamps the requested offset during a viewport change,
    // compensate using the actual scroll delta, never an assumed coordinate.
    const initialDistance = distance + returnAnchor - inset;
    paintReturn(initialDistance);
    const startedAt = performance.now();
    const tick = (now: number) => {
      returnFrame = null;
      const next = sampleLeadingMediaReturn(initialDistance, (now - startedAt) / 1000);
      if (next.distance < 0.1 && Math.abs(next.velocity) < 1) {
        clearReturn();
        return;
      }
      paintReturn(next.distance);
      returnFrame = window.requestAnimationFrame(tick);
    };
    returnFrame = window.requestAnimationFrame(tick);
  };
  const placeAtAnchor = () => {
    if (!resetScroll || userHasControl) return;
    if (window.scrollY < -0.5) {
      startReturn();
    } else if (Math.abs(window.scrollY - inset) > 0.5) {
      window.scrollTo({ top: inset, left: 0, behavior: "auto" });
    }
  };
  const handleTouchStart = (event: TouchEvent) => {
    cancelEntry();
    armed = true;
    touchCount = event.touches.length;
    lastTouchY = event.touches[0]?.clientY ?? 0;
    // A fresh touch catches the moving spring at its current visual position.
    if (returnFrame !== null) window.cancelAnimationFrame(returnFrame);
    returnFrame = null;
    caughtReturn = returnDistance > 0;
  };
  const handleTouchMove = (event: TouchEvent) => {
    if (!caughtReturn || event.touches.length !== 1 || !event.cancelable || editorOwnsPosition()) return;
    const y = event.touches[0].clientY;
    const delta = y - lastTouchY;
    lastTouchY = y;
    // Only a re-grab of our own rebound uses this path. Normal drags, long
    // native pulls, momentum scrolling and multi-touch stay with Safari.
    event.preventDefault();
    const resistance = delta > 0
      ? 0.55 / (1 + returnDistance / Math.max(1, window.innerHeight))
      : 1;
    const next = returnDistance + delta * resistance;
    if (next <= 0) {
      clearReturn();
      window.scrollTo({ top: inset - next, left: 0, behavior: "auto" });
    } else {
      paintReturn(next);
    }
  };
  const handleTouchEnd = (event: TouchEvent) => {
    touchCount = event.touches.length;
    if (touchCount > 0) {
      lastTouchY = event.touches[0].clientY;
      return;
    }
    caughtReturn = false;
    if (editorOwnsPosition()) {
      clearReturn();
      return;
    }
    startReturn();
  };
  const handleScroll = () => {
    if (returnFrame !== null || caughtReturn) {
      // An editor anchor, keyboard, or fresh native scroll owns its new target.
      // Do not leave a frozen translation behind or fight that navigation.
      if (Math.abs(window.scrollY - returnAnchor) > 1) clearReturn();
      return;
    }
    startReturn();
  };

  // Entry gets one placement and one frame for route restoration. No delayed
  // retries, scrollend checkpoints, or competing browser smooth-scroll calls.
  if (resetScroll || ownsReloadScroll) {
    placeAtAnchor();
    entryFrame = window.requestAnimationFrame(() => {
      entryFrame = null;
      placeAtAnchor();
      cancelEntry();
    });
    document.addEventListener("pointerdown", cancelEntry, { passive: true, capture: true });
    document.addEventListener("wheel", cancelEntry, { passive: true, capture: true });
    document.addEventListener("keydown", cancelEntry, { passive: true, capture: true });
  }
  if (inset > 0) {
    document.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", handleTouchEnd, { passive: true, capture: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
  }

  return () => {
    cancelEntry();
    clearReturn();
    document.removeEventListener("touchstart", handleTouchStart, true);
    document.removeEventListener("touchmove", handleTouchMove, true);
    document.removeEventListener("touchend", handleTouchEnd, true);
    document.removeEventListener("touchcancel", handleTouchEnd, true);
    window.removeEventListener("scroll", handleScroll);
    document.removeEventListener("pointerdown", cancelEntry, true);
    document.removeEventListener("wheel", cancelEntry, true);
    document.removeEventListener("keydown", cancelEntry, true);
    root.classList.remove("leading-image-inset-active");
    root.style.removeProperty("--leading-image-inset");
  };
}

/** The restored anchor changes scroll position, not the content's flow layout. */
export function scrollAfterLeadingInsetChange(scrollTop: number, _previousInset: number, _nextInset: number) {
  void _previousInset;
  void _nextInset;
  return Math.max(0, scrollTop);
}
