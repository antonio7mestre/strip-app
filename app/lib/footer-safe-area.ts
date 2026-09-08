type VerticalBounds = { top: number; bottom: number };

/** Safari can still paint page content behind its shrinking browser controls. */
export function getSafeAreaPaintViewport(
  windowHeight: number,
  layoutHeight: number,
  visualViewport: { offsetTop: number; height: number } | null,
): VerticalBounds {
  const visualTop = visualViewport?.offsetTop ?? 0;
  return {
    top: Math.min(0, visualTop),
    bottom: Math.max(windowHeight, layoutHeight, visualTop + (visualViewport?.height ?? 0)),
  };
}

/** Enter just ahead of the footer; leave only after it fully clears the screen. */
export function shouldUseFooterSafeAreaColor(
  footer: VerticalBounds,
  viewport: VerticalBounds,
  wasActive: boolean,
) {
  // Different entry/exit edges prevent a fractional scroll or toolbar resize
  // from repeatedly switching the root canvas at the visibility boundary.
  const margin = wasActive ? 32 : 16;
  return footer.top <= viewport.bottom + margin && footer.bottom >= viewport.top - margin;
}
