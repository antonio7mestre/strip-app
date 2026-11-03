/** A tiny, already-loaded backing stays behind the real photo. This is the
 * backing from the restored 11:55 AM release, not a separate retained canvas. */
export function readerImageBacking(image: HTMLImageElement): string | undefined {
  if (!image.naturalWidth || !image.naturalHeight) return;
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 240 / image.naturalWidth);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch { return; }
}
