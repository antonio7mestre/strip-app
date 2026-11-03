/** A focused field alone is not a software keyboard (hardware keyboards keep
 * the full viewport). Keep the action alive through blur so its tap completes. */
export function observeTitleKeyboard(input: HTMLInputElement, onChange: (open: boolean) => void) {
  const viewport = window.visualViewport;
  if (!viewport) return;
  let width = window.innerWidth;
  let restingHeight = Math.max(window.innerHeight, viewport.height);
  let session = false;
  let previous = false;
  const sync = () => {
    if (window.innerWidth !== width) {
      width = window.innerWidth;
      restingHeight = window.innerHeight;
    }
    if (document.activeElement === input) session = true;
    const obscured = Math.max(restingHeight, window.innerHeight) - viewport.height;
    const open = session && viewport.scale === 1 && obscured > 100;
    if (!open && document.activeElement !== input) {
      session = false;
      restingHeight = Math.max(window.innerHeight, viewport.height);
    }
    if (open !== previous) { previous = open; onChange(open); }
  };
  sync();
  viewport.addEventListener("resize", sync);
  window.addEventListener("resize", sync);
  window.addEventListener("focusin", sync);
  window.addEventListener("focusout", sync);
  return () => {
    viewport.removeEventListener("resize", sync);
    window.removeEventListener("resize", sync);
    window.removeEventListener("focusin", sync);
    window.removeEventListener("focusout", sync);
  };
}
