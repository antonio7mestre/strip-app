/** Dismiss on scroll intent, including at an edge where the page cannot move. */
export function installPreviewNoticeDismiss(onDismiss: () => void, pill?: HTMLElement | null) {
  const startX = window.scrollX;
  const startY = window.scrollY;
  let dismissed = false;
  let exit: Animation | undefined;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    if (!pill) { onDismiss(); return; }
    const automatic = pill.getAnimations().find(animation =>
      (animation as CSSAnimation).animationName === "top-status-notice");
    // Leave an automatic exit already in progress alone, so it never restarts.
    if (typeof automatic?.currentTime === "number" && automatic.currentTime >= 2640) return;
    const current = getComputedStyle(pill);
    // Match the final 12% of the 3000ms automatic animation. Start at the
    // current paint so a swipe during entry cannot briefly brighten the pill.
    exit = pill.animate([
      { opacity: current.opacity, transform: current.transform },
      { opacity: "0", transform: "translate(-50%, -4px)" },
    ], { duration: 360, easing: "ease", fill: "forwards" });
    exit.onfinish = onDismiss;
  };
  const scroll = () => {
    // Preview restores its current position on entry. A no-op scroll event
    // from that restoration is not a reason to hide the new hint.
    if (window.scrollX !== startX || window.scrollY !== startY) dismiss();
  };
  const wheel = (event: WheelEvent) => {
    if (event.deltaX || event.deltaY) dismiss();
  };
  window.addEventListener("scroll", scroll, { passive: true });
  window.addEventListener("wheel", wheel, { passive: true });
  window.addEventListener("touchmove", dismiss, { passive: true });
  return () => {
    if (exit) { exit.onfinish = null; exit.cancel(); }
    window.removeEventListener("scroll", scroll);
    window.removeEventListener("wheel", wheel);
    window.removeEventListener("touchmove", dismiss);
  };
}
