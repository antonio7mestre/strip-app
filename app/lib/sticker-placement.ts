export type StickerPlacement = { x: number; y: number; width: number };

/** Capture the visible canvas before a picker or camera roll covers it. */
export function stickerPlacementInView({
  canvasTop,
  canvasWidth,
  contentTop,
  contentBottom,
  viewportTop,
  viewportHeight,
  dockTop,
  verticalAnchor = 0.5,
}: {
  canvasTop: number;
  canvasWidth: number;
  contentTop: number;
  contentBottom: number;
  viewportTop: number;
  viewportHeight: number;
  dockTop?: number;
  verticalAnchor?: number;
}): StickerPlacement {
  const viewportBottom = viewportTop + viewportHeight;
  const visibleBottom = dockTop !== undefined && dockTop > viewportTop
    ? Math.min(viewportBottom, dockTop)
    : viewportBottom;
  const center = viewportTop + (visibleBottom - viewportTop) * verticalAnchor;
  return {
    x: 50,
    y: Math.max(contentTop, Math.min(contentBottom, center)) - canvasTop,
    width: Math.min(34, Math.max(24, 132 / Math.max(1, canvasWidth) * 100)),
  };
}

export function captureStickerPlacement(verticalAnchor = 0.5): StickerPlacement | null {
  const canvas = document.querySelector<HTMLElement>(".editor-mode .strip-canvas");
  if (!canvas) return null;
  const flow = Array.from(canvas.children).filter(
    (element): element is HTMLElement => element instanceof HTMLElement &&
      element.matches(".text-block, .image-block, .video-block"),
  );
  if (!flow.length) return null;
  const bounds = canvas.getBoundingClientRect();
  const viewport = window.visualViewport;
  return stickerPlacementInView({
    canvasTop: bounds.top,
    canvasWidth: bounds.width,
    contentTop: flow[0].getBoundingClientRect().top,
    contentBottom: flow[flow.length - 1].getBoundingClientRect().bottom,
    viewportTop: viewport?.offsetTop ?? 0,
    viewportHeight: viewport?.height ?? window.innerHeight,
    dockTop: document.querySelector(".main-composer-dock")?.getBoundingClientRect().top,
    verticalAnchor,
  });
}
