/** Dismiss on scroll intent, including at an edge where the page cannot move. */
export function installPreviewNoticeDismiss(onDismiss: () => void, pill?: HTMLElement | null) {
  const startX = window.scrollX;
  const startY = window.scrollY;
  let dismissed = false;
  let finished = false;
  let exit: Animation | undefined;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDismiss();
  };
  const automaticEnd = (event: AnimationEvent) => {
    if (event.target === pill && event.animationName === "top-status-notice") finish();
  };
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    if (!pill) { finish(); return; }
    const automatic = pill.getAnimations().find(animation =>
      (animation as CSSAnimation).animationName === "top-status-notice");
    // Leave an automatic exit already in progress alone, so it never restarts.
    if (typeof automatic?.currentTime === "number" && automatic.currentTime >= 2640) return;
    const opacity = getComputedStyle(pill).opacity;
    // Match the final 12% of the 3000ms automatic animation. Start at the
    // current paint, then stop that animation before starting the one exit.
    // Keep position untouched: matrix-to-percent transform handoffs can jump
    // during Safari's toolbar/viewport movement on the same swipe.
    pill.style.opacity = opacity;
    pill.style.animation = "none";
    exit = pill.animate([
      { opacity },
      { opacity: "0" },
    ], { duration: 360, easing: "ease", fill: "forwards" });
    exit.onfinish = finish;
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
  pill?.addEventListener("animationend", automaticEnd);
  return () => {
    finished = true;
    if (exit) { exit.onfinish = null; exit.cancel(); }
    pill?.removeEventListener("animationend", automaticEnd);
    window.removeEventListener("scroll", scroll);
    window.removeEventListener("wheel", wheel);
    window.removeEventListener("touchmove", dismiss);
  };
}
