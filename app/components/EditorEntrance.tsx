"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { startEntranceCounter } from "@/app/lib/strip-entrance";
import { installScribbleSurface } from "@/app/lib/scribble-entrance";
import { TopStatusPill } from "./TopStatusPill";

export function EditorEntrance({ revealing, percent = 0, onCountComplete, handoffColor }: {
  revealing: boolean;
  handoffColor?: string;
  percent?: number; onCountComplete?: () => void;
}) {
  const [displayPercent, setDisplayPercent] = useState(0);
  const [stalled, setStalled] = useState(false);
  const counterRef = useRef<ReturnType<typeof startEntranceCounter> | null>(null);
  const completedRef = useRef(false);
  const surfaceRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    // Use the same under-glass paint bounds as the reader loader. A fixed
    // viewport-only layer can expose Safari's top edge before it fades away.
    return installScribbleSurface(surface, () => {}, { suspendTheme: true });
  }, []);
  useLayoutEffect(() => {
    const counter = startEntranceCounter(setDisplayPercent);
    counterRef.current = counter;
    return () => { counter.dispose(); counterRef.current = null; };
  }, []);
  useLayoutEffect(() => { counterRef.current?.setTarget(percent); }, [percent]);
  useLayoutEffect(() => {
    setStalled(false);
    if (displayPercent === 0 || displayPercent >= 100 || revealing) return;
    const timer = window.setTimeout(() => setStalled(true), 500);
    return () => window.clearTimeout(timer);
  }, [displayPercent, revealing]);
  useLayoutEffect(() => {
    if (displayPercent === 100 && !completedRef.current) { completedRef.current = true; onCountComplete?.(); }
  }, [displayPercent, onCountComplete]);
  return <section ref={surfaceRef} className={`editor-entrance${handoffColor ? " is-onboarding-handoff" : ""}${revealing ? " is-revealing" : ""}`}
    style={handoffColor ? { backgroundColor: handoffColor } : undefined}>
    <TopStatusPill progress={displayPercent}
      waiting={!revealing && displayPercent < 100 && (displayPercent === 0 || stalled)} />
  </section>;
}
