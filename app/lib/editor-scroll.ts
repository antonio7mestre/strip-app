/** Instagram's editor scrolls its artwork independently of the bottom tools.
 * Other browsers and routes keep the browser's document scrolling. */
export function editorScrollSurface(): HTMLElement | null {
  if (typeof document === "undefined" || document.documentElement.dataset?.inAppBrowser !== "instagram") return null;
  return document.querySelector<HTMLElement>(".editor-scroll-surface");
}

export function pageScrollTop() {
  return editorScrollSurface()?.scrollTop ?? window.scrollY;
}

export function pageScrollHeight() {
  return editorScrollSurface()?.scrollHeight ?? document.documentElement.scrollHeight;
}

export function pageViewportHeight() {
  return editorScrollSurface()?.clientHeight ?? window.innerHeight;
}

export function scrollPageTo(options: ScrollToOptions) {
  const surface = editorScrollSurface();
  if (surface) surface.scrollTo(options);
  else window.scrollTo(options);
}

export function scrollPageBy(options: ScrollToOptions) {
  const surface = editorScrollSurface();
  if (surface) surface.scrollBy(options);
  else window.scrollBy(options);
}

/** Retain Safari's existing explicit root/body restoration after layout swaps. */
export function restorePageScrollTop(top: number, left?: number) {
  scrollPageTo({ top, ...(left === undefined ? {} : { left }), behavior: "auto" });
  if (!editorScrollSurface()) {
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
  }
}
