"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { normalizedFontSize } from "@/app/lib/font-sizing";
import { profileFontInfo, profileFontWeight, type StripProfile } from "@/app/lib/profile";
import { readProfilePresentation } from "@/app/lib/profile-reload";
import { startEntranceCounter } from "@/app/lib/strip-entrance";

export function EditorEntrance({ profile, revealing, profilePending = false, owner, percent = 0, onCountComplete }: {
  profile: StripProfile; revealing: boolean; profilePending?: boolean; owner?: string;
  percent?: number; onCountComplete?: () => void;
}) {
  const [cached, setCached] = useState<ReturnType<typeof readProfilePresentation>>(null);
  const [displayPercent, setDisplayPercent] = useState(0);
  const [stalled, setStalled] = useState(false);
  const counterRef = useRef<ReturnType<typeof startEntranceCounter> | null>(null);
  const completedRef = useRef(false);
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
  useLayoutEffect(() => { if (profilePending) setCached(readProfilePresentation(owner)); }, [profilePending, owner]);
  const theme = profilePending && cached && !cached.owner.startsWith("public:")
    ? { ...profile, ...cached, font: profileFontInfo(cached.font).id } : profile;
  return <section className={`editor-entrance${revealing ? " is-revealing" : ""}`}
    role="status" aria-label="Loading Strip">
    <div className="editor-entrance-mark" style={{ fontFamily: profileFontInfo(theme.font).family,
      fontWeight: profileFontWeight(theme.font) ?? 600, fontSize: normalizedFontSize(theme.font, 24) }}>
      <div className={`editor-entrance-square${/^#0{3}(0{3})?$/i.test(theme.background) ? " is-outlined" : ""}`}
        style={{ backgroundColor: theme.background }} aria-hidden="true" />
      <div className="editor-entrance-label" data-waiting={!revealing && displayPercent < 100 && (displayPercent === 0 || stalled)}
        role="progressbar" aria-label="Strip loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayPercent}>{displayPercent}</div>
    </div>
  </section>;
}
