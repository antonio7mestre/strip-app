type ContentBlock = {
  id: string;
  type: string;
  content?: string;
  src?: string;
};

/** A stable screen, unaffected by Safari's toolbar or the on-screen keyboard. */
export function minimumStripHeight(document: Document): number {
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:100vh;height:100svh;";
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

  const contentIds = new Set(blocks.filter((block) =>
    block.type === "text"
      ? Boolean(block.content?.trim())
      : (block.type === "image" || block.type === "video") && Boolean(block.src),
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
