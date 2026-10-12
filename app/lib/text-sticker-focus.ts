import type { TextSticker } from "./text-sticker";

/** Scale the whole sticker to the focus width, never reflow its typography. */
export function focusedTextSticker(value: TextSticker): TextSticker {
  return { ...value };
}

export function textStickerFocusWidth(canvasWidth: number, viewportWidth: number) {
  return Math.max(180, Math.min(480, canvasWidth * .82, viewportWidth - 32));
}

/** The floating input moves, never the document underneath it. Do not lock
 * body layout or change either safe-area surface to hold this position. */
export function installTextStickerScrollAnchor() {
  const left = window.scrollX;
  const top = window.scrollY;
  const viewport = window.visualViewport;
  const restore = () => {
    const maxTop = Math.max(0, document.documentElement.scrollHeight - document.documentElement.clientHeight);
    const targetTop = Math.max(0, Math.min(top, maxTop));
    if (Math.abs(window.scrollY - targetTop) > .5 || Math.abs(window.scrollX - left) > .5) {
      window.scrollTo({ left, top: targetTop, behavior: "instant" });
    }
  };
  window.addEventListener("scroll", restore, { passive: true });
  window.addEventListener("focusin", restore);
  viewport?.addEventListener("resize", restore);
  viewport?.addEventListener("scroll", restore);
  return () => {
    window.removeEventListener("scroll", restore);
    window.removeEventListener("focusin", restore);
    viewport?.removeEventListener("resize", restore);
    viewport?.removeEventListener("scroll", restore);
  };
}
