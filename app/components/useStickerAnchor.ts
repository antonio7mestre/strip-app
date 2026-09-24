"use client";
import { useLayoutEffect, useState, type RefObject } from "react";
import type { StickerLayout } from "@/app/lib/sticker-layout";

export function useStickerAnchor<T extends StickerLayout & { y: number }>(source: T, elementRef: RefObject<HTMLElement | null>): T {
  const [position, setPosition] = useState<{ anchorId: string; y: number } | null>(null);
  // Re-measure after reorders, text edits and selection changes, not just resize.
  useLayoutEffect(() => {
    const canvas = elementRef.current?.closest<HTMLElement>(".strip-canvas");
    if (!canvas || !source.anchorBlockId || source.anchorY === undefined) return;
    const anchorId = source.anchorBlockId;
    const anchorY = source.anchorY;
    const anchor = Array.from(canvas.querySelectorAll<HTMLElement>(".strip-block:not(.sticker-block)"))
      .find((element) => element.dataset.blockId === anchorId);
    if (!anchor) return;
    const measure = () => {
      const bounds = anchor.getBoundingClientRect();
      const y = bounds.top - canvas.getBoundingClientRect().top + bounds.height * anchorY;
      setPosition((previous) => previous?.anchorId === anchorId && Math.abs(previous.y - y) < .5 ? previous : { anchorId, y });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    canvas.querySelectorAll(".strip-block:not(.sticker-block)").forEach((block) => observer.observe(block));
    return () => observer.disconnect();
  });
  return source.anchorBlockId && position?.anchorId === source.anchorBlockId ? { ...source, y: position.y } : source;
}
