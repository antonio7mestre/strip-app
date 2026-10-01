type ContentBlock = {
  id: string;
  type: string;
  content?: string;
  src?: string;
};

/** The usable editor, not the area occupied by its toolbar and safe areas. */
export function minimumStripHeight(document: Document): number {
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  // Ask for one more short beat after the content reaches the toolbar. Small
  // viewport units keep the requirement stable through keyboard and Safari changes.
  const occupied = "var(--dock-visible-height, 64px) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)";
  probe.style.cssText = `position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:calc(100vh - ${occupied} + 48px);height:calc(100svh - ${occupied} + 48px);`;
  document.body.appendChild(probe);
  try {
    return probe.getBoundingClientRect().height;
  } finally {
    probe.remove();
  }
}

/** Count the published flow, not editor padding, tools, stickers or the footer. */
export function hasScreenfulOfContent(
  canvas: HTMLElement | null,
  blocks: readonly ContentBlock[],
): boolean {
  if (!canvas) return false;
  const minimumHeight = minimumStripHeight(canvas.ownerDocument);
  if (!Number.isFinite(minimumHeight) || minimumHeight <= 0) return false;

  // A text block's colored surface still occupies space when its text is
  // empty. Measure the actual layout, not whether the user has written words.
  const contentIds = new Set(blocks.filter((block) =>
    block.type === "text" ||
    ((block.type === "image" || block.type === "video") && Boolean(block.src)),
  ).map((block) => block.id));
  let contentHeight = 0;
  for (const child of Array.from(canvas.children)) {
    const id = child.getAttribute("data-block-id");
    if (!id || !contentIds.delete(id)) continue;
    // The viewport is the visible crop. Natural media height and editing
    // controls can extend outside it and must not satisfy the minimum.
    const viewport = child.querySelector(".block-crop-viewport");
    const height = viewport?.getBoundingClientRect().height ?? 0;
    if (Number.isFinite(height)) contentHeight += Math.max(0, height);
  }
  // Ignore only subpixel rounding at the exact full-screen boundary.
  return contentHeight + 1 >= minimumHeight;
}

/** Pre-arm native tap feedback as layout changes. Actions still measure again
 * synchronously on tap, so a late media load can never block a valid Strip. */
export function observeStripContent(
  canvas: HTMLElement | null,
  blocks: readonly ContentBlock[],
  onReady: (ready: boolean) => void,
) {
  if (!canvas) { onReady(false); return; }
  let disposed = false;
  const update = () => { if (!disposed) onReady(hasScreenfulOfContent(canvas, blocks)); };
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
  const observe = () => {
    if (disposed) return;
    resize?.disconnect();
    resize?.observe(canvas);
    canvas.querySelectorAll(".block-crop-viewport").forEach(element => resize?.observe(element));
    update();
  };
  const mutations = new MutationObserver(observe);
  mutations.observe(canvas, { childList: true, subtree: true });
  window.addEventListener("resize", update);
  observe();
  return () => {
    disposed = true;
    resize?.disconnect(); mutations.disconnect();
    window.removeEventListener("resize", update);
  };
}
