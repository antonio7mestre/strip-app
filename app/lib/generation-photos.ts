import { MAX_GENERATION_PHOTOS, type GenerationPhoto } from "./generated-strip";

export async function prepareGenerationPhotos(files: File[], signal: AbortSignal, onProgress: (count: number) => void): Promise<GenerationPhoto[]> {
  if (!files.length || files.length > MAX_GENERATION_PHOTOS) throw new Error(`Choose 1 to ${MAX_GENERATION_PHOTOS} photos.`);
  if (files.some((file) => !file.type.startsWith("image/") || file.size > 30 * 1024 * 1024)) {
    throw new Error("Choose photos under 30 MB each.");
  }
  const photos: GenerationPhoto[] = [];
  // Decode sequentially. A dozen full-resolution camera photos at once can
  // exhaust mobile Safari's memory. Canvas also strips EXIF/location metadata.
  for (const file of files) {
    signal.throwIfAborted();
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
      signal.throwIfAborted();
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("Empty photo.");
      const canvas = document.createElement("canvas");
      const render = (maxEdge: number, quality: number) => {
        const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Couldn’t prepare this photo.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", quality);
      };
      const src = render(2000, .86);
      const width = canvas.width;
      const height = canvas.height;
      const preview = render(768, .7);
      canvas.width = canvas.height = 1;
      photos.push({ src, preview, width, height, alt: file.name.replace(/\.[^/.]+$/, "").slice(0, 160) });
      onProgress(photos.length);
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error("One photo couldn’t open. Try a JPG, PNG or WebP instead.");
    } finally {
      image.src = "";
      URL.revokeObjectURL(url);
    }
  }
  return photos;
}
