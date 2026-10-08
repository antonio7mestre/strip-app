"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { profileInk } from "@/app/lib/profile";
import { mediaSourcePoint } from "@/app/lib/page-color-sampler";

/** Use the pixels behind the icon, not the average color of the whole cover. */
export function LibraryDeleteButton({ coverColor, imageSrc, label, disabled, onClick }: {
  coverColor?: string; imageSrc?: string; label: string; disabled: boolean; onClick: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [sample, setSample] = useState<{ src: string; ink: string } | null>(null);
  useLayoutEffect(() => {
    if (!imageSrc) return;
    const button = buttonRef.current;
    const image = button?.closest(".library-card")?.querySelector<HTMLImageElement>(".library-cover img");
    if (!button || !image) return;
    const sampleCorner = () => {
      if (!image.complete || !image.naturalWidth) return;
      const imageBox = image.getBoundingClientRect();
      const iconBox = button.querySelector("svg")?.getBoundingClientRect();
      if (!iconBox || !imageBox.width || !imageBox.height) return;
      const style = getComputedStyle(image);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 5;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      // Transparent cover pixels reveal the existing dark cover surface.
      context.fillStyle = "#141414";
      context.fillRect(0, 0, 5, 5);
      try {
        for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
          const point = mediaSourcePoint(iconBox.left - imageBox.left + (x + .5) / 5 * iconBox.width,
            iconBox.top - imageBox.top + (y + .5) / 5 * iconBox.height,
            imageBox.width, imageBox.height, image.naturalWidth, image.naturalHeight, style.objectFit, style.objectPosition);
          if (point) context.drawImage(image, Math.floor(point.x), Math.floor(point.y), 1, 1, x, y, 1, 1);
        }
        const pixels = context.getImageData(0, 0, 5, 5).data;
        const rgb = [0, 0, 0];
        for (let i = 0; i < pixels.length; i += 4) for (let channel = 0; channel < 3; channel++) rgb[channel] += pixels[i + channel];
        const color = `#${rgb.map(value => Math.round(value / 25).toString(16).padStart(2, "0")).join("")}`;
        const ink = profileInk(color);
        setSample(previous => previous?.src === imageSrc && previous.ink === ink ? previous : { src: imageSrc, ink });
      } catch { /* Unreadable cross-origin media retains the neutral fallback. */ }
    };
    sampleCorner();
    image.addEventListener("load", sampleCorner);
    const observer = new ResizeObserver(sampleCorner);
    observer.observe(image);
    observer.observe(button);
    return () => { image.removeEventListener("load", sampleCorner); observer.disconnect(); };
  }, [imageSrc]);
  const ink = coverColor ? profileInk(coverColor) : sample && sample.src === imageSrc ? sample.ink : "#FFFFFF";
  return <button ref={buttonRef} className="library-card-delete-button" type="button" style={{ color: ink }}
    onClick={onClick} disabled={disabled} aria-label={label}><Trash2 aria-hidden="true" /></button>;
}
