import { editorScrollSurface } from "./editor-scroll";

/** WebKit can retain the old root scroll range when deletion shortens the page
 * beneath a fixed dock. Measure the real editor after React commits, rather
 * than the stale root scrollHeight, and clamp before the next paint. */
export function clampEditorScrollAfterDelete(editor: HTMLElement | null) {
  if (!editor) return;
  const surface = editorScrollSurface();
  if (surface) {
    const content = surface.querySelector<HTMLElement>(".editor-canvas");
    const bottom = content
      ? content.getBoundingClientRect().bottom - surface.getBoundingClientRect().top + surface.scrollTop
      : surface.scrollHeight;
    const maximum = Math.max(0, Math.ceil(bottom) - surface.clientHeight);
    if (surface.scrollTop > maximum) surface.scrollTo({ top: maximum, behavior: "instant" });
    return;
  }
  const bottom = editor.getBoundingClientRect().bottom + window.scrollY;
  const maxScroll = Math.max(0, Math.ceil(bottom) - window.innerHeight);
  if (window.scrollY > maxScroll) {
    window.scrollTo({ top: maxScroll, left: window.scrollX, behavior: "instant" });
  }
}
