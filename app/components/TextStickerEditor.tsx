"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TextStickerVisual } from "./TextStickerVisual";
import type { TextSticker } from "@/app/lib/text-sticker";

/** A temporary typing surface. It never changes the sticker's placed transform. */
export function TextStickerEditor({ value, onChange, onFinish, controls }: {
  value: TextSticker;
  onChange: (content: string) => void;
  onFinish: () => void;
  controls: ReactNode;
}) {
  const [layout, setLayout] = useState<{ left: number; top: number; width: number; maxHeight: number; viewportTop: number; layerHeight: number } | null>(null);
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      const bounds = document.querySelector(".editor-mode .strip-canvas")?.getBoundingClientRect();
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const dock = document.querySelector(".selector-dock.is-visible, .main-composer-dock")?.getBoundingClientRect();
      const visibleBottom = Math.min(viewportTop + viewportHeight - 12,
        dock && dock.top > viewportTop + 100 ? dock.top - 16 : Infinity);
      const top = viewportTop + 20;
      const bottom = Math.max(top + 80, visibleBottom - 72);
      setLayout({
        left: bounds ? bounds.left + bounds.width / 2 : viewportWidth / 2,
        top: (top + bottom) / 2 - viewportTop,
        width: Math.max(180, Math.min(480, (bounds?.width ?? viewportWidth) * .82, viewportWidth - 32)),
        maxHeight: Math.max(80, bottom - top),
        viewportTop, layerHeight: Math.max(100, visibleBottom - viewportTop),
      });
    };
    const queue = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    viewport?.addEventListener("resize", queue);
    viewport?.addEventListener("scroll", queue);
    window.addEventListener("resize", queue);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", queue);
      viewport?.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
    };
  }, []);
  if (!layout) return null;
  return createPortal(
    <>
    <div className="text-sticker-editor-backdrop" aria-hidden="true" />
    <div className="text-sticker-editor-layer" role="group" aria-label="Type on your Strip"
      style={{ top: layout.viewportTop, height: layout.layerHeight }}
      onPointerDown={event => {
        event.stopPropagation();
        if (event.target === event.currentTarget) event.preventDefault();
      }}
      onClick={event => event.stopPropagation()}>
      <div className="text-sticker-editor-panel"
        style={{ left: layout.left, top: layout.top, width: layout.width }}>
        <div className="text-sticker-editor-scroll" style={{ maxHeight: layout.maxHeight }}>
          <TextStickerVisual value={value} typing finishOnBlur={false}
            onChange={onChange} onFinish={onFinish} onSettled={() => {}} />
        </div>
        {controls}
      </div>
    </div>
    </>, document.body,
  );
}
