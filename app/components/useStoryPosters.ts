"use client";

import { useEffect, useState } from "react";
import { drawPoster, POSTER_DESIGNS, STORY_HEIGHT, STORY_WIDTH, type PosterAssets, type PosterStrip } from "@/app/lib/share-posters";
import { disposePosterAssets, preparePosterAssets } from "@/app/lib/share-poster-assets";

function renderBlob(assets: PosterAssets, index: number, preview = false) {
  const canvas = document.createElement("canvas");
  canvas.width = preview ? STORY_WIDTH / 2 : STORY_WIDTH;
  canvas.height = preview ? STORY_HEIGHT / 2 : STORY_HEIGHT;
  return new Promise<Blob>((resolve, reject) => {
    try {
      const c = canvas.getContext("2d");
      if (!c) throw new Error("Canvas unavailable");
      drawPoster(c, assets, index, !preview);
      canvas.toBlob(blob => {
        canvas.width = 0; canvas.height = 0;
        if (blob) resolve(blob); else reject(new Error("Poster export failed"));
      }, preview ? "image/jpeg" : "image/png", .9);
    } catch (error) { canvas.width = 0; canvas.height = 0; reject(error); }
  });
}

export function useStoryPosters(strip: PosterStrip | null) {
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [prepared, setPrepared] = useState<{ strip: PosterStrip; assets: PosterAssets; previews: string[] } | null>(null);
  const [exported, setExported] = useState<{ assets: PosterAssets; index: number; file: File; url: string } | null>(null);
  const [error, setError] = useState("");
  const [source, setSource] = useState(strip);
  if (source !== strip) {
    // Reset before paint, so navigation never exposes the previous strip's poster.
    setSource(strip); setPrepared(null); setIndex(0); setError("");
  }

  useEffect(() => {
    const controller = new AbortController();
    let assets: PosterAssets | null = null;
    const urls: string[] = [];
    if (!strip) return;
    void (async () => {
      assets = await preparePosterAssets(strip, controller.signal);
      if (controller.signal.aborted) { disposePosterAssets(assets); return; }
      setPrepared({ strip, assets, previews: [] });
      for (let i = 0; i < POSTER_DESIGNS.length; i++) {
        if (controller.signal.aborted) return;
        const blob = await renderBlob(assets, i, true);
        if (controller.signal.aborted) return;
        urls.push(URL.createObjectURL(blob));
        setPrepared({ strip, assets, previews: [...urls] });
        // Let swipes and the dock paint between preview renders on phones.
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    })().catch(() => { if (!controller.signal.aborted) setError("Couldn’t make your posters. Retry?"); });
    return () => {
      controller.abort(); urls.forEach(url => URL.revokeObjectURL(url));
      if (assets) disposePosterAssets(assets);
    };
  }, [strip, attempt]);

  const assets = prepared?.strip === strip ? prepared?.assets : null;
  useEffect(() => {
    let cancelled = false, url = "";
    if (!assets || !strip) return;
    void renderBlob(assets, index).then(blob => {
      if (cancelled) return;
      const name = (strip.title.trim() || "strip").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "strip";
      const file = new File([blob], `${name}-${POSTER_DESIGNS[index].id}-story.png`, { type: "image/png" });
      url = URL.createObjectURL(blob);
      setExported({ assets, index, file, url });
    }).catch(() => { if (!cancelled) setError("Couldn’t save this poster. Retry?"); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [assets, index, strip]);

  // A quick swipe can never share the previous option while its replacement renders.
  const current = exported?.assets === assets && exported?.index === index ? exported : null;
  return {
    index, select: (next: number) => setIndex(Math.max(0, Math.min(POSTER_DESIGNS.length - 1, next))),
    previews: prepared?.strip === strip ? prepared.previews : [],
    file: current?.file ?? null, url: current?.url ?? "", loading: !!strip && !current,
    error, retry: () => { setPrepared(null); setError(""); setIndex(0); setAttempt(value => value + 1); },
  };
}
