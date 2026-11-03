"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { normalizedFontSize } from "@/app/lib/font-sizing";
import { profileFontInfo, profileFontWeight } from "@/app/lib/profile";
import { paintTextSticker, type TextStickerCaret } from "@/app/lib/text-sticker-render";
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
  const [padding, setPadding] = useState({ top: 12, bottom: 12 });
  const [selection, setSelection] = useState({ start: value.content.length, end: value.content.length });
  const [caretPaint, setCaretPaint] = useState<{ key: string; carets: TextStickerCaret[] }>({ key: "", carets: [] });
  const paintKey = JSON.stringify(value);
  const syncSelection = () => {
    const input = inputRef.current;
    if (input) setSelection({ start: input.selectionStart, end: input.selectionEnd });
  };
  const displayContent = value.content || (typing ? "Type something" : "");
  useLayoutEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const measure = () => setWidth(parseFloat(getComputedStyle(element).width) || TEXT_STICKER_WIDTH);
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    let cancelled = false;
    let settledFrame = 0;
    // Draw offscreen so a stale font request cannot repaint the live canvas.
    const drawing = document.createElement("canvas");
    void paintTextSticker(drawing, { ...value, content: displayContent }, typing).then(({height, paddingTop, paddingBottom, carets}) => {
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = drawing.width; canvas.height = drawing.height;
      canvas.getContext("2d")?.drawImage(drawing, 0, 0);
      setHeight(height);
      setPadding({ top: paddingTop, bottom: paddingBottom });
      setCaretPaint({ key: paintKey, carets: carets ?? [] });
      settledFrame = requestAnimationFrame(() => { if (!cancelled) callbacks.current.onSettled(true); });
    }).catch(() => {
      if (cancelled) return;
      callbacks.current.onSettled(false);
    });
    return () => { cancelled = true; cancelAnimationFrame(settledFrame); };
  }, [value.content, value.fontStyle, value.fontSize, value.textColor, value.textAlign, value.backgroundColor, displayContent, typing, paintKey]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    // Never collapse a focused field to zero: Safari may scroll its internal
    // text/caret during that intermediate layout and retain the wrong offset.
    input.style.height = `${height}px`;
    input.style.height = `${Math.max(height, input.scrollHeight)}px`;
    input.scrollTop = 0;
  }, [value.content, value.fontStyle, value.fontSize, width, height, typing, padding.top, padding.bottom]);
  useLayoutEffect(() => {
    const input = inputRef.current;
    const scroller = wrapperRef.current?.closest<HTMLElement>(".text-sticker-editor-scroll");
    if (!typing || !input || !scroller) return;
    // Once the artwork fills the keyboard-safe area, keep newly typed lines
    // visible inside that area. Never move the page or scroll older edits away.
    const keepEndVisible = () => {
      if (document.activeElement === input && input.selectionEnd === value.content.length) {
        scroller.scrollTop = Math.max(0, height * width / TEXT_STICKER_WIDTH - scroller.clientHeight);
      }
    };
    keepEndVisible();
    const observer = new ResizeObserver(keepEndVisible);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [height, width, value.content, typing]);
  useLayoutEffect(() => {
    if (!typing) return;
    const input = inputRef.current;
    // Size and select before focus, so moving the caret cannot ask Safari
    // for a second reveal after preventScroll has already been applied.
    input?.setSelectionRange(input.value.length, input.value.length);
    input?.focus({ preventScroll: true });
  }, [typing]);
  const scale = width / TEXT_STICKER_WIDTH;
  const caret = typing && value.content && selection.start === selection.end && caretPaint.key === paintKey
    ? caretPaint.carets[selection.start] : undefined;
  return <span ref={wrapperRef} className={`text-sticker-visual ${typing ? "is-typing" : ""} ${value.backgroundColor ? "has-background" : ""}`}
    style={{ "--text-sticker-color": value.textColor, height: height * scale } as CSSProperties}>
    {/* One 320px typography plane in both modes. The native input supplies
        selection and keyboard behavior. Words and cursor share the canvas's
        exact line metrics throughout typing, motion and placement. */}
    <span className="text-sticker-artwork" style={{ width: TEXT_STICKER_WIDTH, transform: `scale(${scale})` }}>
    <canvas ref={canvasRef} role="img" aria-hidden={typing || undefined} aria-label={value.content || "Text sticker"}
      style={{ width: TEXT_STICKER_WIDTH, height, opacity: typing && !value.content ? .65 : 1 }} />
    {typing ? <textarea ref={inputRef} className="text-sticker-input" aria-label="Sticker text"
      placeholder="Type something" value={value.content} maxLength={TEXT_STICKER_MAX_LENGTH}
      spellCheck autoCapitalize="sentences"
      style={{ fontFamily: profileFontInfo(value.fontStyle).family, fontWeight: profileFontWeight(value.fontStyle) ?? 450,
        fontSize: normalizedFontSize(value.fontStyle, value.fontSize),
        lineHeight: `${Math.max(value.fontSize * 1.22, normalizedFontSize(value.fontStyle, value.fontSize) * 1.12)}px`,
        padding: `${padding.top}px 12px ${padding.bottom}px`,
        // Empty inputs hide their caret, but keep the real typing geometry.
        // The first character must not change alignment or animate into place.
        textAlign: value.textAlign }}
      onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
      onChange={event => { syncSelection(); onChange(event.target.value); }}
      onSelect={syncSelection}
      onScroll={event => { event.currentTarget.scrollTop = 0; }}
      onBlur={() => { if (finishOnBlur) callbacks.current.onFinish(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === "Escape" || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
          event.preventDefault();
          if (!finishOnBlur) callbacks.current.onFinish();
          event.currentTarget.blur();
        }
      }} /> : null}
    {caret ? <span key={`${paintKey}:${selection.start}`} className="text-sticker-caret" aria-hidden="true"
      style={{ left: caret.x, top: caret.y, height: caret.height }} /> : null}
    </span>
  </span>;
}
