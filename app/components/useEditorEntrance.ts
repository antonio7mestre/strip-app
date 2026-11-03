"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { profileFontInfo, profileFontWeight, type ProfileFont } from "@/app/lib/profile";
import { entranceLoadPercent } from "@/app/lib/strip-entrance";
import { useReaderViewport } from "./useReaderViewport";
import { textTexture } from "@/app/lib/text-textures";

export const EDITOR_ENTRANCE_FADE_MS = 600;
export const EDITOR_ENTRANCE_MIN_MS = 280;
type LoadableBlock = { id: string; type: string; fontStyle?: ProfileFont; backgroundTexture?: string };
type Entrance = { request: number; startedAt: number; dataReady: boolean; counted: boolean; phase: "loading" | "revealing"; handoffColor?: string };

/** Keep the real canvas mounted and decoded behind one entrance. Never seed it
 * with the published copy: the saved draft may contain unpublished changes. */
export function useEditorEntrance(blocks: LoadableBlock[], media: Record<string, "loaded" | "error">,
  font: ProfileFont, profileLoading: boolean, canvas: RefObject<HTMLElement | null>) {
  const [entrance, setEntrance] = useState<Entrance | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [viewportReady, setViewportReady] = useState(true);
  const requestRef = useRef(0);
  const start = useCallback((options?: { handoffColor: string }) => {
    const request = ++requestRef.current;
    setFontsReady(false);
    setEntrance({ request, startedAt: performance.now(), dataReady: false, counted: Boolean(options?.handoffColor), phase: "loading", handoffColor: options?.handoffColor });
    setViewportReady(!options?.handoffColor);
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
  const handoffColor = entrance?.handoffColor;
  const fontKey = [...new Set([font, ...blocks.filter(block => block.type === "text").map(block => block.fontStyle ?? "sans")])].sort().join("|");

  useEffect(() => {
    if (!request || !handoffColor) return;
    // Keep the editor covered while the outgoing typing keyboard collapses.
    // A quiet viewport beat avoids exposing the dock in its keyboard position.
    const viewport = window.visualViewport;
    let settle = 0;
    const sync = () => {
      clearTimeout(settle);
      if (viewport && window.innerHeight - viewport.height > 120) return;
      settle = window.setTimeout(() => setViewportReady(true), 100);
    };
    const fallback = window.setTimeout(() => setViewportReady(true), 1000);
    sync();
    viewport?.addEventListener("resize", sync);
    return () => { clearTimeout(settle); clearTimeout(fallback); viewport?.removeEventListener("resize", sync); };
  }, [request, handoffColor]);

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

  // Use the reader's real first-screen geometry, including floating stickers.
  // Recheck after decoding/fonts: old drafts may not have saved media heights.
  const viewport = useReaderViewport(dataReady ? `editor:${request}` : "",
    blocks.filter(block => block.type !== "text" || textTexture(block.backgroundTexture)).map(block => block.id).join("|"),
    canvas, media, entrance?.phase === "revealing", fontsReady && !profileLoading);
  const assets = viewport.ids;
  const assetsSettled = viewport.measured && assets.every(id => media[id] !== undefined);
  const percent = dataReady ? Math.min(viewport.measured ? 100 : 99,
    entranceLoadPercent(1 + (fontsReady && !profileLoading ? 1 : 0)
      + assets.filter(id => media[id] !== undefined).length, assets.length + 2)) : 0;
  useEffect(() => {
    if (!entrance || !entrance.counted || entrance.phase !== "loading" || !dataReady || !fontsReady || profileLoading || !assetsSettled || !viewportReady) return;
    let frame = 0;
    // Give a cached load a single intentional entrance, not a one-frame flash.
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(() => setEntrance(current => current && current.request === request
        ? { ...current, phase: "revealing" } : current));
    }, Math.max(0, EDITOR_ENTRANCE_MIN_MS - (performance.now() - entrance.startedAt)));
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [entrance, request, dataReady, fontsReady, profileLoading, assetsSettled, viewportReady]);

  useEffect(() => {
    if (entrance?.phase !== "revealing") return;
    const timer = window.setTimeout(() => setEntrance(current => current?.request === request ? null : current),
      EDITOR_ENTRANCE_FADE_MS);
    return () => clearTimeout(timer);
  }, [entrance?.phase, request]);

  return { active: entrance !== null, phase: entrance?.phase, handoffColor, request, percent,
    requiredIds: viewport.ids, completeCount, start, resolve, cancel, isCurrent };
}
