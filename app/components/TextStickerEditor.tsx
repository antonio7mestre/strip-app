"use client";

import { cloneElement, isValidElement, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { TextStickerVisual } from "./TextStickerVisual";
import type { TextSticker } from "@/app/lib/text-sticker";
import { focusedTextSticker, textStickerFocusWidth } from "@/app/lib/text-sticker-focus";
import { stepTextStickerSpring, type SpringAxis } from "@/app/lib/text-sticker-motion";

type Pose = { x: number; y: number; scale: number; rotation: number };
type Motion = { [Key in keyof Pose]: SpringAxis };
const axes = ["x", "y", "scale", "rotation"] as const;

/** A temporary typing surface. It never changes the sticker's placed transform. */
export function TextStickerEditor({ value, onChange, onFinish, controls, sourceRef }: {
  value: TextSticker;
  onChange: (content: string) => void;
  onFinish: () => void;
  controls: ReactNode;
  sourceRef: RefObject<HTMLElement | null>;
}) {
  // The focus width scales the entire artwork. Keep the same font-to-width
  // ratio so every line and its background match the placed sticker.
  const focusedValue = focusedTextSticker(value);
  const panelRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<Motion | null>(null);
  const frameRef = useRef(0);
  const previousFrameRef = useRef(0);
  const startedRef = useRef(0);
  const wakeRef = useRef<() => void>(() => {});
  const targetRef = useRef<() => Pose>(() => ({ x: 0, y: 0, scale: 1, rotation: 0 }));
  const completeRef = useRef<() => void>(() => {});
  const enteredRef = useRef(false);
  const closingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const [layout, setLayout] = useState<{ left: number; top: number; width: number; maxHeight: number; viewportTop: number; layerHeight: number } | null>(null);
  const layoutRef = useRef(layout);
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
      const next = {
        left: bounds ? bounds.left + bounds.width / 2 : viewportWidth / 2,
        top: (top + bottom) / 2,
        width: textStickerFocusWidth(bounds?.width ?? viewportWidth, viewportWidth),
        maxHeight: Math.max(80, bottom - top),
        viewportTop, layerHeight: Math.max(100, visibleBottom - viewportTop),
      };
      layoutRef.current = next;
      setLayout(next);
      wakeRef.current();
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
    cancelAnimationFrame(frameRef.current);
    if (sourceRef.current) {
      delete sourceRef.current.dataset.textReturning;
      sourceRef.current.style.removeProperty("--text-sticker-return-opacity");
    }
  }, [sourceRef]);
  const placedPose = (): Pose => {
    const source = sourceRef.current;
    const panel = panelRef.current;
    if (!source || !panel) return { x: layoutRef.current?.left ?? 0, y: layoutRef.current?.top ?? 0, scale: .94, rotation: 0 };
    const from = source.getBoundingClientRect();
    const scale = source.offsetWidth / Math.max(1, panel.offsetWidth);
    const rotation = parseFloat(source.style.getPropertyValue("--sticker-rotation")) || 0;
    return { x: from.left + from.width / 2, y: from.top + from.height / 2, scale, rotation };
  };
  targetRef.current = () => closingRef.current ? placedPose() : {
    x: layoutRef.current?.left ?? 0, y: layoutRef.current?.top ?? 0, scale: 1, rotation: 0,
  };
  completeRef.current = () => {
    const source = sourceRef.current;
    if (source) {
      delete source.dataset.textReturning;
      source.style.removeProperty("--text-sticker-return-opacity");
    }
    if (isValidElement<{ onConfirmStickerText?: () => void }>(controls) && controls.props.onConfirmStickerText) controls.props.onConfirmStickerText();
    else onFinish();
  };
  // One compositor transform owns the whole journey. A changing keyboard
  // target keeps the current position and velocity instead of restarting CSS
  // top/left transitions underneath a separate zoom animation.
  const tick = (now: number) => {
    frameRef.current = 0;
    const panel = panelRef.current;
    const motion = motionRef.current;
    if (!panel || !motion) return;
    const delta = previousFrameRef.current ? now - previousFrameRef.current : 0;
    previousFrameRef.current = now;
    const target = targetRef.current();
    let settled = true;
    for (const axis of axes) {
      motion[axis] = stepTextStickerSpring(motion[axis], target[axis], delta);
      const precision = axis === "scale" ? .001 : .15;
      if (Math.abs(motion[axis].value - target[axis]) > precision || Math.abs(motion[axis].velocity) > precision * 10) settled = false;
    }
    const { x, y, scale, rotation } = motion;
    panel.style.transform = `translate3d(${x.value}px, ${y.value}px, 0) translate(-50%, -50%) rotate(${rotation.value}deg) scale(${scale.value})`;
    const elapsed = now - startedRef.current;
    const handoff = closingRef.current ? Math.max(0, Math.min(1, (elapsed - 300) / 140)) : 0;
    panel.style.opacity = String(closingRef.current ? 1 - handoff : Math.min(1, .6 + elapsed / 350));
    if (closingRef.current && sourceRef.current) sourceRef.current.style.setProperty("--text-sticker-return-opacity", String(handoff));
    if (closingRef.current && elapsed >= 440 && (settled || elapsed >= 1000)) {
      completeRef.current();
      return;
    }
    if (!settled || elapsed < 440) frameRef.current = requestAnimationFrame(tick);
    else previousFrameRef.current = 0;
  };
  wakeRef.current = () => {
    if (enteredRef.current && !frameRef.current) frameRef.current = requestAnimationFrame(tick);
  };
  const enter = () => {
    if (enteredRef.current || !panelRef.current) return;
    enteredRef.current = true;
    setReady(true);
    const pose = placedPose();
    motionRef.current = Object.fromEntries(axes.map(axis => [axis, { value: pose[axis], velocity: 0 }])) as Motion;
    startedRef.current = performance.now();
    tick(startedRef.current);
  };
  const finish = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const source = sourceRef.current;
    if (source) source.dataset.textReturning = "true";
    if (!motionRef.current) { completeRef.current(); return; }
    startedRef.current = performance.now();
    wakeRef.current();
  };
  const typingControls = isValidElement<{ onConfirmStickerText?: () => void }>(controls)
    ? cloneElement(controls, { onConfirmStickerText: finish }) : controls;
  if (!layout) return null;
  return createPortal(
    <div className={`text-sticker-editor-layer${closing ? " is-closing" : ""}`} role="group" aria-label="Type on your Strip"
      style={{ top: 0, height: layout.viewportTop + layout.layerHeight }}
      onPointerDown={event => {
        event.stopPropagation();
        if (event.target === event.currentTarget) event.preventDefault();
      }}
      onClick={event => event.stopPropagation()}>
      <div ref={panelRef} className="text-sticker-editor-panel" data-ready={ready || undefined}
        style={{ width: layout.width }}>
        <div className="text-sticker-editor-scroll" style={{ maxHeight: layout.maxHeight }}>
          <TextStickerVisual value={focusedValue} typing finishOnBlur={false}
            onChange={onChange} onFinish={finish} onSettled={enter} />
        </div>
        {typingControls}
      </div>
    </div>, document.body,
  );
}
