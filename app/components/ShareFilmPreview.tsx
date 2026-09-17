"use client";

import { useEffect, useRef } from "react";
import { renderShareFilm, SHARE_FILM, type ShareFilmAssets } from "@/app/lib/share-film";

export function ShareFilmPreview({ assets, url, title, progress, error, onRetry }: {
  assets: ShareFilmAssets | null; url: string; title: string; progress: number; error: string; onRetry: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!assets || url) return;
    const canvas = canvasRef.current, c = canvas?.getContext("2d", { alpha: false });
    if (!c) return;
    let frame = 0;
    const start = performance.now();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = () => {
      renderShareFilm(c, assets, reduced ? 0 : ((performance.now() - start) / 1000) % SHARE_FILM.duration);
      if (!reduced) frame = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(frame);
  }, [assets, url]);

  return <div className="story-film">
    {url ? <video key={url} className="story-asset-preview" src={url} autoPlay muted playsInline loop controls preload="auto" aria-label={`Share video for ${title || "Untitled"}`} />
      : assets ? <canvas ref={canvasRef} className="story-asset-preview" width={SHARE_FILM.width} height={SHARE_FILM.height} aria-label={`Preparing share video for ${title || "Untitled"}`} />
      : <div className="story-asset-loading" aria-busy={!error}><span />Gathering your Strip…</div>}
    <div className="story-film-status" role="status" aria-live="polite">
      {error ? <><span>{error}</span><button type="button" onClick={onRetry}>Retry</button></>
        : !url ? <><span>Making your video</span><span aria-label={`${progress}% complete`}>{progress}%</span></>
        : <span>33 sec · Ready to share</span>}
    </div>
  </div>;
}
