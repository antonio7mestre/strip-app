export function intersectsReaderViewport(rect: { top: number; bottom: number; left: number; right: number },
  viewport: { top: number; bottom: number; width: number }) {
  return rect.top < viewport.bottom && rect.bottom > viewport.top && rect.right > 0 && rect.left < viewport.width;
}

/** Visible media jumps ahead if someone scrolls faster than background loading. */
export function readerMediaPriority(rect: { top: number; bottom: number }, height: number) {
  if (rect.bottom > 0 && rect.top < height) return -10000 + Math.max(0, rect.top);
  return rect.top >= height ? rect.top : 10000000 + Math.abs(rect.top);
}
/** Upcoming videos buffer two screens ahead, but only visible/nearby ones play. */
export function readerVideoProximity(rect: { top: number; bottom: number }, height: number) {
  return {
    near: rect.top < height + 120 && rect.bottom > -120,
    warming: rect.top < height * 3 && rect.bottom > -height,
  };
}
