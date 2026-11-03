"use client";

import { useLayoutEffect, useState } from "react";
import { sampleLeadingMediaColor } from "@/app/lib/leading-media-color";

export function useLeadingMediaAppearance(enabled: boolean, block: {
  id: string; src: string; cropTop?: number; cropBottom?: number;
} | null, surface: string, pendingColor = "#000000") {
  const key = enabled && block ? JSON.stringify([block.id, block.src, block.cropTop, block.cropBottom]) : "";
  const [sample, setSample] = useState({ key: "", color: "#000000" });
  useLayoutEffect(() => {
    if (!key) return;
    // A pending import can precede the visible block in the DOM. Sample the
    // actual selected leading block, not the first (possibly hidden) media.
    const first = Array.from(document.querySelectorAll<HTMLElement>(":is(.is-strip-reader, .editor-mode) .strip-canvas > .strip-block:not(.sticker-block)"))
      .find(element => element.dataset.blockId === block?.id);
    const media = first?.querySelector<HTMLImageElement | HTMLVideoElement>(".block-crop-content > img, .block-crop-content > video, .block-crop-viewport > .text-block-texture");
    if (!first || !media) return;
    let disposed = false;
    const sync = () => {
      if (disposed) return;
      const color = sampleLeadingMediaColor(media, first);
      // A decoded cross-origin image can be visible without being readable by
      // canvas. Settle with the existing fallback instead of holding entry open.
      const decoded = media instanceof HTMLImageElement
        ? media.complete && media.naturalWidth > 0 : media.readyState >= 2;
      if (color || decoded) {
        const nextColor = color ?? pendingColor;
        setSample(previous => previous.key === key && previous.color === nextColor ? previous : { key, color: nextColor });
      }
    };
    const sampleWhenReady = () => {
      // Safari can fire load while async image decoding still gives canvas an
      // empty bitmap. Wait for the same decode barrier as the reader reveal.
      if (media instanceof HTMLImageElement) void media.decode().then(sync, () => {});
      else sync();
    };
    // One stable video frame, not chrome that flickers along with playback.
    media.addEventListener("load", sampleWhenReady);
    media.addEventListener("loadeddata", sync);
    const resize = new ResizeObserver(sampleWhenReady);
    resize.observe(media);
    resize.observe(first);
    sampleWhenReady();
    return () => {
      disposed = true;
      media.removeEventListener("load", sampleWhenReady);
      media.removeEventListener("loadeddata", sync);
      resize.disconnect();
    };
  }, [key, surface]);
  // Reordering/cropping a decoded image still crosses an async decode boundary.
  // Keep the editor's already-painted color until the replacement is ready.
  return { color: key && sample.key === key ? sample.color : pendingColor,
    ready: !key || sample.key === key };
}

export function useLeadingMediaColor(...args: Parameters<typeof useLeadingMediaAppearance>) {
  return useLeadingMediaAppearance(...args).color;
}
