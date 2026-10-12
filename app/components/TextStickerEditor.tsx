"use client";

import { cloneElement, isValidElement, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";
import { TextStickerVisual } from "./TextStickerVisual";
import type { TextSticker } from "@/app/lib/text-sticker";
import { focusedTextSticker, installTextStickerScrollAnchor, textStickerFocusWidth } from "@/app/lib/text-sticker-focus";
import { stepTextStickerSpring, textStickerLayoutSize, textStickerToolFrame, type SpringAxis } from "@/app/lib/text-sticker-motion";

type Pose = { x: number; y: number; scale: number; rotation: number };
type Motion = { [Key in keyof Pose]: SpringAxis };
type TypingControls = { onConfirmStickerText?: () => void; onTextTool?: (tool: "font" | "color" | "background") => void };
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
  const toolsRef = useRef<HTMLDivElement>(null);
  const initialToolsStyleRef = useRef<CSSProperties | null>(null);
  const toolRequestedRef = useRef(false);
  const motionRef = useRef<Motion | null>(null);
  const frameRef = useRef(0);
  const previousFrameRef = useRef(0);
  const startedRef = useRef(0);
  const wakeRef = useRef<() => void>(() => {});
  const targetRef = useRef<() => Pose>(() => ({ x: 0, y: 0, scale: 1, rotation: 0 }));
  const completeRef = useRef<() => void>(() => {});
  const enteredRef = useRef(false);
  const closingRef = useRef(false);
  const handoffFramesRef = useRef(0);
  const initialTransformRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [closing, setClosing] = useState(false);
  const [layout, setLayout] = useState<{ left: number; top: number; width: number; maxHeight: number; viewportTop: number; layerHeight: number } | null>(null);
  const layoutRef = useRef(layout);
  // The first render has no input yet. Capture the page anchor before the
  // measured render mounts and focuses it, including Safari's later pan.
  useLayoutEffect(installTextStickerScrollAnchor, []);
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const measure = () => {
      const source = sourceRef.current;
      if (source && !initialToolsStyleRef.current) {
        const from = source.getBoundingClientRect();
        const size = textStickerLayoutSize(source);
        initialToolsStyleRef.current = textStickerToolFrame({
          x: from.left + from.width / 2, y: from.top + from.height / 2, scale: 1,
          rotation: parseFloat(source.style.getPropertyValue("--sticker-rotation")) || 0,
        }, size.width, size.height);
      }
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
  }, [sourceRef]);
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
    const scale = textStickerLayoutSize(source).width / Math.max(1, textStickerLayoutSize(panel).width);
    const rotation = parseFloat(source.style.getPropertyValue("--sticker-rotation")) || 0;
    return { x: from.left + from.width / 2, y: from.top + from.height / 2, scale, rotation };
  };
  targetRef.current = () => closingRef.current ? placedPose() : {
    x: layoutRef.current?.left ?? 0, y: layoutRef.current?.top ?? 0, scale: 1, rotation: 0,
  };
  completeRef.current = () => {
    // Removing the floating copy and releasing is-text-composing must be one
    // commit. Keep the placed copy visible until the unmount cleanup runs.
    flushSync(() => {
      // A styling tool is already open while the sticker returns. Finish
      // typing without resetting that selector at the placement handoff.
      if (!toolRequestedRef.current && isValidElement<TypingControls>(controls) && controls.props.onConfirmStickerText) controls.props.onConfirmStickerText();
      else onFinish();
    });
  };
  const paintTools = (pose: Pose) => {
    const tools = toolsRef.current;
    const panel = panelRef.current;
    if (!tools || !panel) return;
    const size = textStickerLayoutSize(panel);
    const frame = textStickerToolFrame(pose, size.width, size.height);
    tools.style.width = `${frame.width}px`;
    tools.style.height = `${frame.height}px`;
    tools.style.transform = frame.transform;
    tools.style.setProperty("--sticker-counter-rotation", frame["--sticker-counter-rotation"]);
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
    paintTools({ x: x.value, y: y.value, scale: scale.value, rotation: rotation.value });
    const elapsed = now - startedRef.current;
    panel.style.opacity = String(closingRef.current ? 1 : Math.min(1, .6 + elapsed / 350));
    if (closingRef.current && elapsed >= 440 && (settled || elapsed >= 1000)) {
      // Make before break: align both copies, then allow the placed canvas
      // two paint opportunities while the moving copy remains fully opaque.
      panel.style.transform = `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -50%) rotate(${target.rotation}deg) scale(${target.scale})`;
      paintTools(target);
      sourceRef.current?.style.setProperty("--text-sticker-return-opacity", "1");
      if (handoffFramesRef.current >= 2) completeRef.current();
      else {
        handoffFramesRef.current += 1;
        frameRef.current = requestAnimationFrame(tick);
      }
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
  const finish = (openTool?: () => void) => {
    const alreadyClosing = closingRef.current;
    if (!alreadyClosing) {
      closingRef.current = true;
      setClosing(true);
      panelRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.blur();
    }
    // Begin revealing the selector in the same event that drops the keyboard,
    // even if Safari already blurred the input before delivering this tap.
    if (openTool && value.content.trim()) {
      toolRequestedRef.current = true;
      openTool();
    }
    if (alreadyClosing) return;
    const source = sourceRef.current;
    if (source) source.dataset.textReturning = "true";
    if (!motionRef.current) { completeRef.current(); return; }
    startedRef.current = performance.now();
    wakeRef.current();
  };
  const typingControls = isValidElement<TypingControls>(controls)
    ? cloneElement(controls, {
      onConfirmStickerText: () => finish(),
      onTextTool: tool => finish(() => controls.props.onTextTool?.(tool)),
    }) : controls;
  if (!layout) return null;
  // Native focus must see an on-screen input, not a box at (-50%, -50%).
  // Keep this initial React style stable; the spring owns it after entry.
  initialTransformRef.current ??= `translate3d(${layout.left}px, ${layout.top}px, 0) translate(-50%, -50%)`;
  return createPortal(
    <div className={`text-sticker-editor-layer${closing ? " is-closing" : ""}`} role="group" aria-label="Type on your Strip"
      style={{ top: 0, height: layout.viewportTop + layout.layerHeight }}
      onPointerDown={event => {
        event.stopPropagation();
        if (event.target === event.currentTarget) event.preventDefault();
      }}
      onClick={event => event.stopPropagation()}>
      <div ref={panelRef} className="text-sticker-editor-panel" data-ready={ready || undefined}
        style={{ width: layout.width, transform: initialTransformRef.current }}>
        <div className="text-sticker-editor-scroll" style={{ maxHeight: layout.maxHeight }}>
          {/* Safari's keyboard Done button blurs the input. Use the same
              guarded finish path as the pill check and styling buttons. */}
          <TextStickerVisual value={focusedValue} typing finishOnBlur
            onChange={onChange} onFinish={finish} onSettled={enter} />
        </div>
      </div>
      <div ref={toolsRef} className="text-sticker-editor-tools" style={initialToolsStyleRef.current ?? undefined}>
        {typingControls}
      </div>
    </div>, document.body,
  );
}
