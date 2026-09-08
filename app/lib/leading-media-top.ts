const TOP_RETURN_FREQUENCY = 18;

/** Analytic critical damping keeps the same curve at 60 and 120 Hz. */
export function sampleLeadingMediaReturn(distance: number, elapsedSeconds: number, initialVelocity = 0) {
  const time = Math.max(0, elapsedSeconds);
  const decay = Math.exp(-TOP_RETURN_FREQUENCY * time);
  const velocity = Math.max(-TOP_RETURN_FREQUENCY * distance, initialVelocity);
  const coefficient = velocity + TOP_RETURN_FREQUENCY * distance;
  return {
    distance: (distance + coefficient * time) * decay,
    velocity: (velocity - TOP_RETURN_FREQUENCY * coefficient * time) * decay,
  };
}

/** Elastic resistance approaches the viewport size instead of a hard clamp. */
export function leadingMediaRubberBand(distance: number, dimension: number) {
  const size = Math.max(1, dimension);
  return size * 0.55 * Math.max(0, distance) / (size + 0.55 * Math.max(0, distance));
}

function inverseRubberBand(distance: number, dimension: number) {
  const size = Math.max(1, dimension);
  const bounded = Math.min(Math.max(0, distance), size - 0.1);
  return bounded * size / (0.55 * (size - bounded));
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
  let ownsPull = false;
  let rawPullDistance = 0;
  let lastMoveAt = 0;
  let pullVelocity = 0;
  let pullDimension = window.innerHeight;
  let nativeReturnActive = false;
  let topEdgeMode = false;
  const syncTopEdgeMode = () => {
    const remaining = root.scrollHeight - root.clientHeight - window.scrollY;
    const next = inset > 0 && (returnFrame !== null || ownsPull ||
      window.scrollY <= inset + 4 ||
      (window.scrollY < inset + window.innerHeight && remaining > window.innerHeight / 2));
    if (next === topEdgeMode) return;
    topEdgeMode = next;
    root.classList.toggle("leading-media-top-edge", next);
  };
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
    if (nativeReturnActive) window.scrollTo({ top: window.scrollY, left: 0, behavior: "auto" });
    if (returnFrame !== null) window.cancelAnimationFrame(returnFrame);
    returnFrame = null;
    returnDistance = 0;
    caughtReturn = false;
    nativeReturnActive = false;
    root.classList.remove("leading-media-return-active");
    root.style.removeProperty("--leading-media-return-y");
  };
  const paintReturn = (distance: number) => {
    returnDistance = distance;
    // WebKit may deliver a queued native scroll after scrollTo. Compensate
    // against the actual coordinate without restarting the visible spring.
    root.style.setProperty("--leading-media-return-y", `${distance + window.scrollY - inset}px`);
    root.classList.add("leading-media-return-active");
  };
  const editorOwnsPosition = () => Boolean(document.querySelector(
    "html.inline-preview-exit-locked, html.keyboard-open, html.keyboard-settling, " +
    ".editor-mode.is-typing, .image-block.is-height-cropping, .sticker-block.is-transforming",
  ));
  const startReturn = (initialVelocity = 0) => {
    if (inset <= 0 || !armed || touchCount > 0 || returnFrame !== null || nativeReturnActive || editorOwnsPosition()) return;
    const distance = returnDistance > 0 ? returnDistance : inset - window.scrollY;
    if (distance <= 0.1) return;

    if (returnDistance <= 0) {
      // A native fling stays on Safari's compositor. Mixing an immediate
      // scrollTo with a transformed page can paint those two changes in
      // different frames. One native animation needs no compensating layer.
      nativeReturnActive = true;
      window.scrollTo({ top: inset, left: 0, behavior: "smooth" });
      return;
    }

    // Top pulls keep the real scroll position at the media anchor throughout.
    // A native scroll reaching this edge gets the same pixel-preserving handoff.
    paintReturn(distance);
    window.scrollTo({ top: inset, left: 0, behavior: "auto" });
    paintReturn(distance);
    const startedAt = performance.now();
    const tick = (now: number) => {
      returnFrame = null;
      if (editorOwnsPosition()) {
        clearReturn();
        return;
      }
      const next = sampleLeadingMediaReturn(distance, (now - startedAt) / 1000, initialVelocity);
      if (next.distance < 0.1 && Math.abs(next.velocity) < 1) {
        // Do not drop the compensating layer until Safari has accepted the
        // endpoint. A delayed native reset to zero cannot strand the image.
        if (Math.abs(window.scrollY - inset) > 0.5) {
          paintReturn(0);
          window.scrollTo({ top: inset, left: 0, behavior: "auto" });
          paintReturn(0);
        }
        if (Math.abs(window.scrollY - inset) <= 0.5) {
          clearReturn();
          return;
        }
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
    lastMoveAt = performance.now();
    pullVelocity = 0;
    // Safari changes innerHeight as its controls move. One gesture must keep
    // one resistance curve, including a long pull while those controls expand.
    pullDimension = window.innerHeight;
    nativeReturnActive = false;
    syncTopEdgeMode();
    // A fresh touch catches the moving spring at its current visual position.
    if (returnFrame !== null) window.cancelAnimationFrame(returnFrame);
    returnFrame = null;
    caughtReturn = returnDistance > 0;
    ownsPull = caughtReturn;
    rawPullDistance = inverseRubberBand(returnDistance, pullDimension);
  };
  const handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1 || editorOwnsPosition()) return;
    const y = event.touches[0].clientY;
    const delta = y - lastTouchY;
    lastTouchY = y;
    const now = performance.now();
    const elapsed = Math.max(8, now - lastMoveAt);
    lastMoveAt = now;
    if (!ownsPull) {
      // Leave all scrolling below the anchor native. Claim only a pull that
      // crosses the leading edge, before Safari starts its own rubber band.
      if (delta <= 0 || window.scrollY - delta > inset || !event.cancelable) return;
      rawPullDistance = inset - window.scrollY;
      ownsPull = true;
      syncTopEdgeMode();
    }
    if (!event.cancelable) return;
    event.preventDefault();
    const previousDistance = returnDistance;
    rawPullDistance += delta;
    if (rawPullDistance <= 0) {
      clearReturn();
      window.scrollTo({ top: inset - rawPullDistance, left: 0, behavior: "auto" });
      pullVelocity = 0;
    } else {
      const next = leadingMediaRubberBand(rawPullDistance, pullDimension);
      if (window.scrollY !== inset) window.scrollTo({ top: inset, left: 0, behavior: "auto" });
      paintReturn(next);
      pullVelocity = 0.65 * ((next - previousDistance) * 1000 / elapsed) + 0.35 * pullVelocity;
    }
  };
  const handleTouchEnd = (event: TouchEvent) => {
    touchCount = event.touches.length;
    if (touchCount > 0) {
      lastTouchY = event.touches[0].clientY;
      return;
    }
    caughtReturn = false;
    ownsPull = false;
    if (editorOwnsPosition()) {
      clearReturn();
      return;
    }
    const sinceMove = performance.now() - lastMoveAt;
    const velocity = sinceMove < 80 ? pullVelocity * Math.exp(-sinceMove / 24) : 0;
    startReturn(velocity);
  };
  const handleScroll = () => {
    syncTopEdgeMode();
    if (nativeReturnActive) {
      if (window.scrollY >= inset - 0.5 || editorOwnsPosition()) nativeReturnActive = false;
      return;
    }
    if (returnFrame !== null || caughtReturn || (ownsPull && rawPullDistance > 0)) {
      // A queued compositor update is not a new gesture. Keep the current
      // visible position even when Safari briefly reports either side of the
      // anchor. Only actual new input or an editor operation can interrupt it.
      if (editorOwnsPosition()) clearReturn();
      else paintReturn(returnDistance);
      return;
    }
    startReturn();
  };
  const interruptReturn = () => {
    clearReturn();
    ownsPull = false;
  };

  // Entry gets one placement and one frame for route restoration. No delayed
  // retries or scrollend checkpoints. Native and direct-pull recovery never
  // run at the same time.
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
    syncTopEdgeMode();
    document.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", handleTouchEnd, { passive: true, capture: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("wheel", interruptReturn, { passive: true });
    window.addEventListener("keydown", interruptReturn, { passive: true });
  }

  return () => {
    cancelEntry();
    clearReturn();
    document.removeEventListener("touchstart", handleTouchStart, true);
    document.removeEventListener("touchmove", handleTouchMove, true);
    document.removeEventListener("touchend", handleTouchEnd, true);
    document.removeEventListener("touchcancel", handleTouchEnd, true);
    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("wheel", interruptReturn);
    window.removeEventListener("keydown", interruptReturn);
    document.removeEventListener("pointerdown", cancelEntry, true);
    document.removeEventListener("wheel", cancelEntry, true);
    document.removeEventListener("keydown", cancelEntry, true);
    root.classList.remove("leading-image-inset-active");
    root.classList.remove("leading-media-top-edge");
    root.style.removeProperty("--leading-image-inset");
  };
}

/** The restored anchor changes scroll position, not the content's flow layout. */
export function scrollAfterLeadingInsetChange(scrollTop: number, _previousInset: number, _nextInset: number) {
  void _previousInset;
  void _nextInset;
  return Math.max(0, scrollTop);
}
