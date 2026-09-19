const TEXT_ENTRY = 'textarea, input:not([type]), input[type="text"], input[type="tel"], input[type="email"], input[type="url"], input[type="search"], input[type="password"], input[type="number"]';

/** Cancel Safari's keyboard pan for docks only, without moving the text/caret. */
export function installKeyboardDockPosition() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const root = document.documentElement;
  let textSession = false;
  let focusFrame = 0;
  let previous = "";

  const sync = () => {
    const focused = document.activeElement?.matches(TEXT_ENTRY) ?? false;
    if (focused) textSession = true;
    // A fixed element follows the layout viewport when Safari pans to a low
    // input. Compensate only that pan, not the keyboard height, so the existing
    // dock stays at the screen bottom underneath the native keyboard.
    const pan = textSession && viewport.scale === 1
      ? Math.max(0, viewport.offsetTop)
      : 0;
    const value = `${pan}px`;
    if (value !== previous) {
      root.style.setProperty("--keyboard-dock-pan", value);
      previous = value;
    }
    // Blur arrives before the keyboard finishes dismissing. Keep following
    // its viewport until it reaches zero, including a rapid focus transfer.
    if (!focused && pan === 0) textSession = false;
  };
  const focusChanged = () => {
    sync();
    window.cancelAnimationFrame(focusFrame);
    focusFrame = window.requestAnimationFrame(sync);
  };

  sync();
  viewport.addEventListener("resize", sync);
  viewport.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);
  window.addEventListener("focusin", focusChanged);
  window.addEventListener("focusout", focusChanged);
  return () => {
    window.cancelAnimationFrame(focusFrame);
    viewport.removeEventListener("resize", sync);
    viewport.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
    window.removeEventListener("focusin", focusChanged);
    window.removeEventListener("focusout", focusChanged);
    root.style.removeProperty("--keyboard-dock-pan");
  };
}
