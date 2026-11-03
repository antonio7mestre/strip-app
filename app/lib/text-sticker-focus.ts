import type { TextSticker } from "./text-sticker";

/** Scale the whole sticker to the focus width, never reflow its typography. */
export function focusedTextSticker(value: TextSticker): TextSticker {
  return { ...value };
}

export function textStickerFocusWidth(canvasWidth: number, viewportWidth: number) {
  return Math.max(180, Math.min(560, canvasWidth * .92, viewportWidth - 24));
}

/** Sit a little below center without moving the bottom of long text into its tools. */
export function textStickerFocusFrame(top: number, bottom: number) {
  const available = Math.max(80, bottom - top);
  const offset = Math.min(24, Math.max(0, (available - 80) / 2), available * .08);
  return { top: top + available / 2 + offset, maxHeight: available - offset * 2 };
}

/** Save the artwork the user actually sees, not the clipped typing panel.
 * Both rectangles are viewport-relative, so page scroll cancels out. */
export function textStickerPlacementFromArtwork(
  artwork: { left: number; top: number; width: number; height: number },
  canvas: { left: number; top: number; width: number },
) {
  return {
    x: (artwork.left + artwork.width / 2 - canvas.left) / Math.max(1, canvas.width) * 100,
    y: artwork.top + artwork.height / 2 - canvas.top,
    width: artwork.width / Math.max(1, canvas.width) * 100,
    rotation: 0,
  };
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
