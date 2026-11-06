"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import { useReaderViewport } from "./useReaderViewport";
import { textTexture } from "@/app/lib/text-textures";

export const EDITOR_ENTRANCE_FADE_MS = 480;
export const EDITOR_ENTRANCE_MIN_MS = 0;
type LoadableBlock = { id: string; type: string; backgroundTexture?: string };

/** Only the draft request is gated. Its ordered layout renders as soon as the
 * data arrives; fonts, textures, photos and videos never hold the whole Strip. */
export function useEditorEntrance(blocks: LoadableBlock[], media: Record<string, "loaded" | "error">,
  canvas: RefObject<HTMLElement | null>) {
  const [entrance, setEntrance] = useState<{ request: number; handoffColor?: string } | null>(null);
  const requestRef = useRef(0);
  const start = useCallback((options?: { handoffColor: string }) => {
    const request = ++requestRef.current;
    setEntrance({ request, handoffColor: options?.handoffColor });
    return request;
  }, []);
  const resolve = useCallback((request: number) => {
    setEntrance(current => current?.request === request ? null : current);
  }, []);
  const cancel = useCallback(() => { ++requestRef.current; setEntrance(null); }, []);
  const isCurrent = useCallback((request: number) => requestRef.current === request, []);
  const viewport = useReaderViewport(blocks.length ? `editor:${blocks[0].id}` : "",
    blocks.filter(block => block.type !== "text" || textTexture(block.backgroundTexture)).map(block => block.id).join("|"),
    canvas, media, false, true, false);
  return { active: entrance !== null, phase: entrance ? "loading" as const : undefined,
    handoffColor: entrance?.handoffColor, request: entrance?.request,
    requiredIds: viewport.ids, start, resolve, cancel, isCurrent };
}
