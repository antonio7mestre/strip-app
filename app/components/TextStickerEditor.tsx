"use client";

import { cloneElement, isValidElement, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { TextStickerVisual } from "./TextStickerVisual";
import type { TextSticker } from "@/app/lib/text-sticker";
import { focusedTextSticker, textStickerFocusWidth } from "@/app/lib/text-sticker-focus";

/** A temporary typing surface. It never changes the sticker's placed transform. */
export function TextStickerEditor({ value, onChange, onFinish, controls, sourceRef }: {
  value: TextSticker;
  onChange: (content: string) => void;
  onFinish: () => void;
  controls: ReactNode;
  sourceRef: RefObject<HTMLElement | null>;
}) {
  // Normalize the opening view, without writing its temporary size to the
  // sticker. Explicit font-size changes still scale naturally while typing.
  const [initialFontSize] = useState(value.fontSize);
  const focusedValue = focusedTextSticker(value, initialFontSize);
  const panelRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<Animation | null>(null);
  const enteredRef = useRef(false);
  const closingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [closing, setClosing] = useState(false);
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
        width: textStickerFocusWidth(bounds?.width ?? viewportWidth, viewportWidth),
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
  useLayoutEffect(() => () => {
    motionRef.current?.cancel();
    if (sourceRef.current) delete sourceRef.current.dataset.textReturning;
  }, [sourceRef]);
  const placedTransform = () => {
    const source = sourceRef.current;
    const panel = panelRef.current;
    if (!source || !panel) return "translate(-50%, -50%) scale(.94)";
    const from = source.getBoundingClientRect();
    // offset dimensions and layout coordinates ignore an in-flight animation.
    const toX = (layout?.left ?? 0);
    const toY = (layout?.top ?? 0) + (layout?.viewportTop ?? 0);
    const dx = from.left + from.width / 2 - toX;
    const dy = from.top + from.height / 2 - toY;
    const scale = source.offsetWidth / Math.max(1, panel.offsetWidth) * value.fontSize / focusedValue.fontSize;
    const rotation = source.style.getPropertyValue("--sticker-rotation") || "0deg";
    return `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${rotation}) scale(${scale})`;
  };
  const enter = () => {
    if (enteredRef.current || !panelRef.current) return;
    enteredRef.current = true;
    setReady(true);
    motionRef.current = panelRef.current.animate([
      { transform: placedTransform(), opacity: .35 },
      { transform: "translate(-50%, -50%)", opacity: 1 },
    ], { duration: 280, easing: "cubic-bezier(.22, 1, .36, 1)" });
  };
  const finish = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const panel = panelRef.current;
    const source = sourceRef.current;
    const currentTransform = panel ? getComputedStyle(panel).transform : "none";
    motionRef.current?.cancel();
    if (source) source.dataset.textReturning = "true";
    const complete = () => {
      if (source) delete source.dataset.textReturning;
      if (isValidElement<{ onConfirmStickerText?: () => void }>(controls) && controls.props.onConfirmStickerText) controls.props.onConfirmStickerText();
      else onFinish();
    };
    if (!panel) { complete(); return; }
    motionRef.current = panel.animate([
      { transform: currentTransform, opacity: 1 },
      { transform: placedTransform(), opacity: 0 },
    ], { duration: 280, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" });
    void motionRef.current.finished.then(complete).catch(() => {});
  };
  const typingControls = isValidElement<{ onConfirmStickerText?: () => void }>(controls)
    ? cloneElement(controls, { onConfirmStickerText: finish }) : controls;
  if (!layout) return null;
  return createPortal(
    <div className={`text-sticker-editor-layer${closing ? " is-closing" : ""}`} role="group" aria-label="Type on your Strip"
      style={{ top: layout.viewportTop, height: layout.layerHeight }}
      onPointerDown={event => {
        event.stopPropagation();
        if (event.target === event.currentTarget) event.preventDefault();
      }}
      onClick={event => event.stopPropagation()}>
      <div ref={panelRef} className="text-sticker-editor-panel" data-ready={ready || undefined}
        style={{ left: layout.left, top: layout.top, width: layout.width }}>
        <div className="text-sticker-editor-scroll" style={{ maxHeight: layout.maxHeight }}>
          <TextStickerVisual value={focusedValue} typing finishOnBlur={false}
            onChange={onChange} onFinish={finish} onSettled={enter} />
        </div>
        {typingControls}
      </div>
    </div>, document.body,
  );
}
