"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { normalizedFontSize } from "@/app/lib/font-sizing";
import { profileFontInfo, profileFontWeight } from "@/app/lib/profile";
import { paintTextSticker } from "@/app/lib/text-sticker-render";
import { TEXT_STICKER_MAX_LENGTH, TEXT_STICKER_WIDTH, type TextSticker } from "@/app/lib/text-sticker";

/** The editor draws the same transparent artwork that gets saved as a sticker.
 * Typing remains native, directly on the canvas, with no separate dialog. */
export function TextStickerVisual({ value, typing, onChange, onFinish, onSettled, finishOnBlur = true }: {
  value: TextSticker; typing: boolean; onChange: (content: string) => void;
  onFinish: () => void; onSettled: (loaded: boolean) => void;
  finishOnBlur?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const callbacks = useRef({ onSettled, onFinish });
  callbacks.current = { onSettled, onFinish };
  const [width, setWidth] = useState(TEXT_STICKER_WIDTH);
  const [height, setHeight] = useState(66);
  const [background, setBackground] = useState({ x: 0, width: TEXT_STICKER_WIDTH });
  const [padding, setPadding] = useState({ top: 12, bottom: 12 });
  const displayContent = value.content || (typing ? "Type something" : "");
  useLayoutEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const measure = () => setWidth(element.offsetWidth || TEXT_STICKER_WIDTH);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    let cancelled = false;
    let settledFrame = 0;
    // Draw offscreen so a stale font request cannot repaint the live canvas.
    const drawing = document.createElement("canvas");
    void paintTextSticker(drawing, { ...value, content: displayContent }).then(({height, paddingTop, paddingBottom, backgroundX, backgroundWidth}) => {
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = drawing.width; canvas.height = drawing.height;
      canvas.getContext("2d")?.drawImage(drawing, 0, 0);
      setHeight(height); setBackground({ x: backgroundX, width: backgroundWidth });
      setPadding({ top: paddingTop, bottom: paddingBottom });
      settledFrame = requestAnimationFrame(() => { if (!cancelled) callbacks.current.onSettled(true); });
    }).catch(() => { if (!cancelled) callbacks.current.onSettled(false); });
    return () => { cancelled = true; cancelAnimationFrame(settledFrame); };
  }, [value.content, value.fontStyle, value.fontSize, value.textColor, value.textAlign, value.backgroundColor, displayContent]);
  useLayoutEffect(() => {
    if (!typing) return;
    const input = inputRef.current;
    input?.focus({ preventScroll: true });
    input?.setSelectionRange(input.value.length, input.value.length);
  }, [typing]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${input.scrollHeight}px`;
  }, [value.content, value.fontStyle, value.fontSize, width, typing, padding.top, padding.bottom]);
  const scale = width / TEXT_STICKER_WIDTH;
  return <span ref={wrapperRef} className={`text-sticker-visual ${typing ? "is-typing" : ""} ${value.backgroundColor ? "has-background" : ""}`}
    style={{ "--text-sticker-color": value.textColor,
      "--text-sticker-box-left": `${background.x * scale}px`,
      "--text-sticker-box-width": `${background.width * scale}px` } as CSSProperties}>
    <canvas ref={canvasRef} role="img" aria-label={value.content || "Text sticker"}
      style={{ width: "100%", height: height * scale, visibility: typing ? "hidden" : "visible" }} />
    {typing && value.backgroundColor ? <span aria-hidden="true" className="text-sticker-typing-background"
      style={{ backgroundColor: value.backgroundColor, height: height * scale }} /> : null}
    {typing ? <textarea ref={inputRef} className="text-sticker-input" aria-label="Sticker text"
      placeholder="Type something" value={value.content} maxLength={TEXT_STICKER_MAX_LENGTH}
      spellCheck autoCapitalize="sentences"
      style={{ fontFamily: profileFontInfo(value.fontStyle).family, fontWeight: profileFontWeight(value.fontStyle) ?? 450,
        fontSize: normalizedFontSize(value.fontStyle, value.fontSize) * scale,
        lineHeight: `${Math.max(value.fontSize * 1.22, normalizedFontSize(value.fontStyle, value.fontSize) * 1.12) * scale}px`,
        padding: `${padding.top * scale}px ${12 * scale}px ${padding.bottom * scale}px`,
        textAlign: value.textAlign, color: value.textColor }}
      onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
      onChange={event => onChange(event.target.value)}
      onBlur={() => { if (finishOnBlur) callbacks.current.onFinish(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
          event.preventDefault();
          if (!finishOnBlur) callbacks.current.onFinish();
          event.currentTarget.blur();
        }
      }} /> : null}
  </span>;
}
