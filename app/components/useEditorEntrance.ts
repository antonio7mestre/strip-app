"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { profileFontInfo, profileFontWeight, type ProfileFont } from "@/app/lib/profile";
import { entranceLoadPercent } from "@/app/lib/strip-entrance";
import { useReaderViewport } from "./useReaderViewport";
import { textTexture } from "@/app/lib/text-textures";

export const EDITOR_ENTRANCE_FADE_MS = 480;
export const EDITOR_ENTRANCE_MIN_MS = 280;
type LoadableBlock = { id: string; type: string; fontStyle?: ProfileFont; backgroundTexture?: string };
type Entrance = { request: number; startedAt: number; dataReady: boolean; counted: boolean; phase: "loading" | "revealing"; handoffColor?: string };

/** Keep the real canvas mounted and decoded behind one entrance. Never seed it
 * with the published copy: the saved draft may contain unpublished changes. */
export function useEditorEntrance(blocks: LoadableBlock[], media: Record<string, "loaded" | "error">,
  font: ProfileFont, profileLoading: boolean, canvas: RefObject<HTMLElement | null>) {
  const [entrance, setEntrance] = useState<Entrance | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const requestRef = useRef(0);
  const start = useCallback((options?: { handoffColor: string }) => {
    const request = ++requestRef.current;
    setFontsReady(false);
    setEntrance({ request, startedAt: performance.now(), dataReady: false, counted: Boolean(options?.handoffColor), phase: "loading", handoffColor: options?.handoffColor });
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
  const completeReveal = useCallback((request: number) => {
    setEntrance(current => current?.request === request && current.phase === "revealing" ? null : current);
  }, []);
  const request = entrance?.request;
  const dataReady = entrance?.dataReady ?? false;
  const handoffColor = entrance?.handoffColor;
  const isOnboarding = Boolean(handoffColor);
  // The first Strip uses its own text fonts, already shown in onboarding.
  // An unrelated profile fetch or profile typeface must not hold this handoff.
  const profileReady = isOnboarding || !profileLoading;
  const fontKey = [...new Set([...(isOnboarding ? [] : [font]), ...blocks.filter(block => block.type === "text").map(block => block.fontStyle ?? "sans")])].sort().join("|");

  useEffect(() => {
    if (!request || !dataReady || !profileReady) return;
    let cancelled = false;
    setFontsReady(false);
    void Promise.all(fontKey.split("|").filter(Boolean).map(id => {
      const face = profileFontInfo(id);
      return document.fonts.load(`${profileFontWeight(id) ?? 400} 24px ${face.family}`).catch(() => []);
    })).then(() => { if (!cancelled) setFontsReady(true); });
    return () => { cancelled = true; };
  }, [request, dataReady, fontKey, profileReady]);

  // Use the reader's real first-screen geometry, including floating stickers.
  // Recheck after decoding/fonts: old drafts may not have saved media heights.
  const viewport = useReaderViewport(dataReady ? `editor:${request}` : "",
    blocks.filter(block => block.type !== "text" || textTexture(block.backgroundTexture)).map(block => block.id).join("|"),
    canvas, media, entrance?.phase === "revealing", fontsReady && profileReady, !isOnboarding);
  const assets = viewport.ids;
  const assetsSettled = viewport.measured && assets.every(id => media[id] !== undefined);
  const percent = dataReady ? Math.min(viewport.measured ? 100 : 99,
    entranceLoadPercent(1 + (fontsReady && profileReady ? 1 : 0)
      + assets.filter(id => media[id] !== undefined).length, assets.length + 2)) : 0;
  useEffect(() => {
    if (!entrance || !entrance.counted || entrance.phase !== "loading" || !dataReady || !fontsReady || !profileReady || !assetsSettled) return;
    let frame = 0;
    // Regular loads retain their intentional entrance. Onboarding is already
    // visible, so begin its handoff as soon as the first screen is painted.
    const timer = window.setTimeout(() => {
      // Give the final decoded layout its own paint beneath the opaque cover.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setEntrance(current => current && current.request === request
          ? { ...current, phase: "revealing" } : current));
      });
    }, isOnboarding ? 0 : Math.max(0, EDITOR_ENTRANCE_MIN_MS - (performance.now() - entrance.startedAt)));
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [entrance, request, dataReady, fontsReady, profileReady, assetsSettled, isOnboarding]);

  return { active: entrance !== null, phase: entrance?.phase, handoffColor, request, percent,
    requiredIds: viewport.ids, completeCount, completeReveal, start, resolve, cancel, isCurrent };
}
