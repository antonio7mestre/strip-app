/** iOS can dismiss its keyboard without blurring the input. Observe the
 * viewport separately, and use the same finish path as an ordinary blur. */
export function installTextStickerKeyboardDismiss(onDismiss: () => void) {
  const viewport = window.visualViewport;
  // Desktop window resizing and hardware-keyboard editing must never finish a sticker.
  if (!viewport || !navigator.maxTouchPoints || !window.matchMedia("(pointer: coarse)").matches) return () => {};

  let width = viewport.width;
  let fullHeight = Math.max(window.innerHeight, viewport.height);
  let peakInset = 0;
  let keyboardSeen = false;
  let finished = false;
  let poll: number | undefined;
  const sample = () => {
    if (finished || document.visibilityState === "hidden") return;
    // Pinch zoom and rotation are not keyboard transitions.
    if (Math.abs(viewport.scale - 1) > .02) return;
    if (Math.abs(viewport.width - width) > 32) {
      width = viewport.width;
      fullHeight = Math.max(window.innerHeight, viewport.height);
      peakInset = 0;
      keyboardSeen = false;
      return;
    }
    fullHeight = Math.max(fullHeight, window.innerHeight, viewport.height);
    const inset = Math.max(0, fullHeight - viewport.height);
    if (inset >= 140 && document.activeElement?.matches(".text-sticker-input")) {
      keyboardSeen = true;
      peakInset = Math.max(peakInset, inset);
    }
    if (!keyboardSeen || inset > Math.max(80, peakInset * .25) || peakInset - inset < 120) return;
    finished = true;
    window.clearInterval(poll);
    // Run before the focus-layout resize frame can recenter a newly placed sticker.
    onDismiss();
  };

  viewport.addEventListener("resize", sample);
  viewport.addEventListener("scroll", sample);
  window.addEventListener("resize", sample);
  window.addEventListener("focus", sample);
  window.addEventListener("pageshow", sample);
  document.addEventListener("visibilitychange", sample);
  // A system interruption can omit both blur and resize. Poll only for the
  // lifetime of this mobile typing session, without measuring page layout.
  poll = window.setInterval(sample, 150);
  sample();
  return () => {
    finished = true;
    window.clearInterval(poll);
    viewport.removeEventListener("resize", sample);
    viewport.removeEventListener("scroll", sample);
    window.removeEventListener("resize", sample);
    window.removeEventListener("focus", sample);
    window.removeEventListener("pageshow", sample);
    document.removeEventListener("visibilitychange", sample);
  };
}
