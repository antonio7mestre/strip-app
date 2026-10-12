/** Dismiss on scroll intent, including at an edge where the page cannot move. */
export function installPreviewNoticeDismiss(onDismiss: () => void) {
  const startX = window.scrollX;
  const startY = window.scrollY;
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    onDismiss();
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
    window.removeEventListener("scroll", scroll);
    window.removeEventListener("wheel", wheel);
    window.removeEventListener("touchmove", dismiss);
  };
}
