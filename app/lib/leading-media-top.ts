/** Preserve the old safe-area tuck, with Safari's native scroll origin at zero. */
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

  let frame: number | null = null;
  let userHasControl = false;
  const releaseReloadScroll = () => {
    if (ownsReloadScroll && root.dataset.stripReloadScroll === "manual") {
      history.scrollRestoration = "auto";
      delete root.dataset.stripReloadScroll;
    }
  };
  const placeAtNativeTop = () => {
    if (resetScroll && !userHasControl && Math.abs(window.scrollY) > 0.5) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  };
  const releaseToUser = () => {
    userHasControl = true;
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    releaseReloadScroll();
    removeInputListeners();
  };
  const inputEvents = ["touchstart", "pointerdown", "wheel", "keydown"] as const;
  const removeInputListeners = () => {
    for (const type of inputEvents) document.removeEventListener(type, releaseToUser, true);
  };

  // Only route entry owns placement. Never write scroll position during a drag,
  // momentum scroll, native rubber-band, scrollend, or Safari toolbar resize.
  if (resetScroll || ownsReloadScroll) {
    for (const type of inputEvents) {
      document.addEventListener(type, releaseToUser, { capture: true, passive: true });
    }
    placeAtNativeTop();
    frame = window.requestAnimationFrame(() => {
      frame = null;
      placeAtNativeTop();
      releaseReloadScroll();
      removeInputListeners();
    });
  }

  return () => {
    releaseToUser();
    root.classList.remove("leading-image-inset-active");
    root.style.removeProperty("--leading-image-inset");
  };
}

/** Reordering can change the layout tuck without moving the visible content. */
export function scrollAfterLeadingInsetChange(scrollTop: number, previousInset: number, nextInset: number) {
  return Math.max(0, scrollTop + previousInset - nextInset);
}
