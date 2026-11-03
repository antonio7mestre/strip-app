/** Place a newly opened Strip once, then leave scrolling and refresh native. */
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
  let entryFrame: number | null = null;
  let userHasControl = false;
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
  const placeAtAnchor = () => {
    // A negative offset belongs to the browser's live overscroll, never to us.
    if (!resetScroll || userHasControl || window.scrollY < 0) return;
    if (Math.abs(window.scrollY - inset) > 0.5) {
      window.scrollTo({ top: inset, left: 0, behavior: "auto" });
    }
  };
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
  return cancelEntry;
}

/** Preserve the viewport after a reorder, without leaving media below its top anchor. */
export function scrollAfterLeadingInsetChange(scrollTop: number, _previousInset: number, nextInset: number) {
  void _previousInset;
  return Math.max(0, scrollTop, nextInset);
}
