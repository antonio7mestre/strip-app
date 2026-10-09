"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { profileFontInfo, profileFontWeight, type ProfileFont } from "@/app/lib/profile";
import { entranceLoadPercent } from "@/app/lib/strip-entrance";

export const EDITOR_ENTRANCE_FADE_MS = 320;
export const EDITOR_ENTRANCE_MIN_MS = 280;
type LoadableBlock = { id: string; type: string; fontStyle?: ProfileFont };
type Entrance = { request: number; startedAt: number; dataReady: boolean; counted: boolean; phase: "loading" | "revealing" };

/** Keep the real canvas mounted and decoded behind one entrance. Never seed it
 * with the published copy: the saved draft may contain unpublished changes. */
export function useEditorEntrance(blocks: LoadableBlock[], media: Record<string, "loaded" | "error">,
  font: ProfileFont, profileLoading: boolean) {
  const [entrance, setEntrance] = useState<Entrance | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const requestRef = useRef(0);
  const start = useCallback(() => {
    const request = ++requestRef.current;
    setFontsReady(false);
    setEntrance({ request, startedAt: performance.now(), dataReady: false, counted: false, phase: "loading" });
    return request;
  }, []);
  const resolve = useCallback((request: number) => {
    setEntrance(current => current?.request === request ? { ...current, dataReady: true } : current);
  }, []);
  const cancel = useCallback(() => { ++requestRef.current; setEntrance(null); }, []);
  const isCurrent = useCallback((request: number) => requestRef.current === request, []);
  const completeCount = useCallback((request: number) => {
    setEntrance(current => current?.request === request && !current.counted ? { ...current, counted: true } : current);
  }, []);
  const request = entrance?.request;
  const dataReady = entrance?.dataReady ?? false;
  const fontKey = [...new Set([font, ...blocks.filter(block => block.type === "text").map(block => block.fontStyle ?? "sans")])].sort().join("|");

  useEffect(() => {
    if (!request || !dataReady || profileLoading) return;
    let cancelled = false;
    setFontsReady(false);
    void Promise.all(fontKey.split("|").map(id => {
      const face = profileFontInfo(id);
      return document.fonts.load(`${profileFontWeight(id) ?? 400} 24px ${face.family}`).catch(() => []);
    })).then(() => { if (!cancelled) setFontsReady(true); });
    return () => { cancelled = true; };
  }, [request, dataReady, fontKey, profileLoading]);

  const assetsSettled = blocks.every(block => block.type === "text" || media[block.id] !== undefined);
  const assets = blocks.filter(block => block.type !== "text");
  const percent = dataReady ? entranceLoadPercent(1 + (fontsReady && !profileLoading ? 1 : 0)
    + assets.filter(block => media[block.id] !== undefined).length, assets.length + 2) : 0;
  useEffect(() => {
    if (!entrance || !entrance.counted || entrance.phase !== "loading" || !dataReady || !fontsReady || profileLoading || !assetsSettled) return;
    let frame = 0;
    // Give a cached load a single intentional entrance, not a one-frame flash.
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(() => setEntrance(current => current && current.request === request
        ? { ...current, phase: "revealing" } : current));
    }, Math.max(0, EDITOR_ENTRANCE_MIN_MS - (performance.now() - entrance.startedAt)));
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [entrance, request, dataReady, fontsReady, profileLoading, assetsSettled]);

  useEffect(() => {
    if (entrance?.phase !== "revealing") return;
    const timer = window.setTimeout(() => setEntrance(current => current?.request === request ? null : current),
      EDITOR_ENTRANCE_FADE_MS);
    return () => clearTimeout(timer);
  }, [entrance?.phase, request]);

  return { active: entrance !== null, phase: entrance?.phase, request, percent, completeCount, start, resolve, cancel, isCurrent };
}
