/** WebKit can retain the old root scroll range when deletion shortens the page
 * beneath a fixed dock. Measure the real editor after React commits, rather
 * than the stale root scrollHeight, and clamp before the next paint. */
export function clampEditorScrollAfterDelete(editor: HTMLElement | null) {
  if (!editor) return;
  const bottom = editor.getBoundingClientRect().bottom + window.scrollY;
  const maxScroll = Math.max(0, Math.ceil(bottom) - window.innerHeight);
  if (window.scrollY > maxScroll) {
    window.scrollTo({ top: maxScroll, left: window.scrollX, behavior: "instant" });
  }
}
