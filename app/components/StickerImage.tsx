"use client";

import { useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { watchCoverImage as watchDecodedImage } from "@/app/lib/cover-entrance";

/** Decode before revealing, including cached images. A selection or drag does
 * not remount the image or replay the entrance; only a new source does. */
export function StickerImage({ src, alt, className = "", onSettled, ...props }:
  Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "onLoad" | "onError"> & {
    src: string; alt: string; onSettled?: (loaded: boolean) => void;
  }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const callbackRef = useRef(onSettled);
  const [readySource, setReadySource] = useState<string | null>(null);
  useLayoutEffect(() => { callbackRef.current = onSettled; }, [onSettled]);
  useLayoutEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    return watchDecodedImage(image, () => {
      setReadySource(src);
      callbackRef.current?.(true);
    }, () => callbackRef.current?.(false));
  }, [src]);
  // Pack images are already compact WebPs; retain the native decode lifecycle.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} ref={imageRef} src={src} alt={alt}
    className={`sticker-image-reveal ${className}`}
    data-sticker-ready={readySource === src ? "true" : "false"} />;
}
