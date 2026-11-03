"use client";

// Local-only comparison of real production content, with the unmodified renderer.
import { useEffect, useState } from "react";
import { preparePosterAssets, disposePosterAssets } from "@/app/lib/share-poster-assets";
import { drawPoster, POSTER_DESIGNS, type PosterStrip } from "@/app/lib/share-posters";

type Entry = { id: string; title: string; ready?: boolean; error?: string; preview?: string; saved?: string; thumbnail?: string };
const endpoint = "/api/poster-proof";
const publicSource = (src: string) => {
  const url = new URL(src, "https://striiip.com");
  return url.hostname.endsWith("striiip.com") ? `${endpoint}?path=${encodeURIComponent(url.pathname)}` : src;
};
const blob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(value => value ? resolve(value) : reject(new Error("Export unavailable")), type, quality);
});
const dataUrl = (value: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(value);
});

export default function AllMasonryPosters() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [completed, setCompleted] = useState(0);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController(), signal = controller.signal;
    async function run() {
      const response = await fetch(`${endpoint}?path=${encodeURIComponent("/api/profiles/antonio")}`, { signal });
      if (!response.ok) throw new Error("Production profile unavailable");
      const profile = await response.json();
      const list: Entry[] = profile.strips.map((item: Entry) => ({ id: item.id, title: item.title }));
      setEntries(list);
      const masonry = POSTER_DESIGNS.findIndex(item => item.id === "masonry-wall");
      for (const [index, entry] of list.entries()) {
        if (signal.aborted) return;
        try {
          const detail = await fetch(`${endpoint}?path=${encodeURIComponent(`/api/strips/${entry.id}`)}`, { signal });
          if (!detail.ok) throw new Error("Production Strip unavailable");
          const { strip: original } = await detail.json() as { strip: PosterStrip };
          const strip: PosterStrip = { ...original,
            cover: { ...original.cover, src: original.cover.src ? publicSource(original.cover.src) : undefined },
            blocks: original.blocks.map(block => block.src ? { ...block, src: publicSource(block.src) } : block),
          };
          const assets = await preparePosterAssets(strip, signal);
          try {
            const images: Partial<Entry> = {};
            for (const kind of ["preview", "saved", "thumbnail"] as const) {
              if (signal.aborted) return;
              const canvas = document.createElement("canvas");
              canvas.width = kind === "saved" ? 1080 : kind === "preview" ? 540 : 270;
              canvas.height = canvas.width * 1920 / 1080;
              const context = canvas.getContext("2d");
              if (!context) throw new Error("Canvas unavailable");
              drawPoster(context, assets, masonry, kind === "saved");
              const file = await blob(canvas, kind === "saved" ? "image/png" : "image/jpeg", kind === "thumbnail" ? .72 : .9);
              canvas.width = 0; canvas.height = 0;
              images[kind] = await dataUrl(file);
            }
            setEntries(current => current.map(item => item.id === entry.id ? { ...item, ...images, ready: true } : item));
          } finally { disposePosterAssets(assets); }
        } catch (failure) {
          if (signal.aborted) return;
          const message = failure instanceof Error ? failure.message : "Could not render";
          setEntries(current => current.map(item => item.id === entry.id ? { ...item, error: message } : item));
        }
        setCompleted(index + 1);
      }
    }
    run().catch(failure => { if (!signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, []);
  const selectedEntry = entries.find(item => item.id === selected);
  return <main className="masonry-production-proof">
    <style>{`
      html, body { overflow:auto!important; background:#f0eee8!important; }
      .masonry-production-proof { min-height:100dvh; padding:28px; background:#f0eee8; color:#171717; }
      .masonry-production-proof header { display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between; margin-bottom:24px; }
      .masonry-production-proof h1 { font:500 24px Arial,sans-serif; margin:0 0 6px; }
      .masonry-production-proof p { font:400 14px Arial,sans-serif; margin:0; }
      .masonry-production-proof .switch { display:flex; gap:8px; }
      .masonry-production-proof button { font:400 14px Arial,sans-serif; border:1px solid #a7a7a7; border-radius:22px; padding:9px 16px; background:transparent; color:inherit; }
      .masonry-production-proof button[aria-pressed=true] { background:#171717; color:white; }
      .masonry-production-proof .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:22px; }
      .masonry-production-proof .poster { display:block; padding:0; border:0; border-radius:0; width:100%; text-align:left; }
      .masonry-production-proof img { width:100%; height:auto; display:block; }
      .masonry-production-proof .caption { margin:8px 0 0; overflow-wrap:anywhere; }
      .masonry-production-proof .placeholder { aspect-ratio:9/16; background:#dedbd2; display:grid; place-items:center; }
      .masonry-production-proof .detail { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.85); display:flex; padding:24px; align-items:center; justify-content:center; }
      .masonry-production-proof .detail img { height:calc(100dvh - 48px); width:auto; max-width:90vw; object-fit:contain; }
      .masonry-production-proof .detail button { position:absolute; right:24px; top:24px; color:white; background:#171717; }
      @media(max-width:900px) { .masonry-production-proof .grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
      @media(max-width:600px) { .masonry-production-proof { padding:18px; } .masonry-production-proof .grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; } }
    `}</style>
    <header><div><h1>Antonio / Masonry</h1><p role="status">{error || `${completed} of ${entries.length} production Strips rendered`}</p></div>
      <div className="switch"><button aria-pressed={!saved} onClick={() => setSaved(false)}>Production preview</button><button aria-pressed={saved} onClick={() => setSaved(true)}>Saved PNG</button></div></header>
    <section className="grid" aria-label="All production Masonry posters">
      {entries.map((entry, index) => <article key={entry.id}>
        {entry.ready ? <button className="poster" onClick={() => setSelected(entry.id)} aria-label={`Enlarge ${entry.title || "Untitled"} ${index + 1}`}>
          <img data-strip-id={entry.id} data-thumbnail={entry.thumbnail} src={saved ? entry.saved : entry.preview} alt={`${entry.title || "Untitled"}, production Masonry ${saved ? "saved poster" : "preview"}`} />
        </button> : <div className="placeholder">{entry.error || "Rendering…"}</div>}
        <p className="caption">{index + 1}. {entry.title || "Untitled"}</p>
      </article>)}
    </section>
    {selectedEntry ? <div className="detail" role="dialog" aria-modal="true" aria-label={selectedEntry.title || "Untitled poster"}>
      <button onClick={() => setSelected(null)}>Close</button><img src={saved ? selectedEntry.saved : selectedEntry.preview} alt={selectedEntry.title || "Untitled poster"} />
    </div> : null}
  </main>;
}
