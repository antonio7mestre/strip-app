"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUpRight, ImagePlus, Pencil, Plus, Sparkles, X } from "lucide-react";
import { buildGeneratedStrip, MAX_GENERATION_PHOTOS, validateGenerationPlan, type GeneratedBlock, type GenerationPhoto } from "@/app/lib/generated-strip";
import { prepareGenerationPhotos } from "@/app/lib/generation-photos";
import { STICKER_PACK } from "@/app/lib/sticker-pack";
import styles from "./NewStripStarter.module.css";

const loaderStickers = ["digital-camera", "red-cherries", "pearl-star", "gummy-bear-blue", "pink-butterfly"]
  .map((id) => STICKER_PACK.find((sticker) => sticker.id === id)!);

export function NewStripStarter({ onScratch, onGenerated }: {
  onScratch: () => void;
  onGenerated: (blocks: GeneratedBlock[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [expanded]);
  return <>
    <div ref={rootRef} data-new-strip-starter className={`${styles.starter} ${expanded ? styles.expanded : ""}`}>
      <div className={styles.choices} inert={!expanded} aria-hidden={!expanded}>
        <button type="button" onClick={() => { setExpanded(false); onScratch(); }}><Pencil aria-hidden="true" /><span>From scratch</span></button>
        <button type="button" onClick={() => { setExpanded(false); setGenerating(true); }}><Sparkles aria-hidden="true" /><span>Generate</span></button>
      </div>
      <button className={styles.toggle} type="button" aria-label={expanded ? "Close create options" : "Create a new Strip"}
        aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Plus aria-hidden="true" /></button>
    </div>
    {generating && createPortal(<GenerationFlow onClose={() => setGenerating(false)} onGenerated={onGenerated}
      onScratch={onScratch} />, document.body)}
  </>;
}

function GenerationFlow({ onClose, onScratch, onGenerated }: {
  onClose: () => void; onScratch: () => void; onGenerated: (blocks: GeneratedBlock[]) => void;
}) {
  const [phase, setPhase] = useState<"pick" | "prepare" | "arrange" | "finish" | "error">("pick");
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [canRetry, setCanRetry] = useState(false);
  const photosRef = useRef<GenerationPhoto[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);
  const busy = phase === "prepare" || phase === "arrange" || phase === "finish";
  useEffect(() => {
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const background = document.querySelector<HTMLElement>(".app-shell");
    const wasInert = background?.inert ?? false;
    if (background) background.inert = true;
    const previousFocus = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not([hidden])") ?? []);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      abortRef.current?.abort();
      root.style.overflow = overflow;
      if (background) background.inert = wasInert;
      document.removeEventListener("keydown", onKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const arrange = async (photos: GenerationPhoto[], controller: AbortController) => {
    setPhase("arrange");
    const response = await fetch("/api/generate-strip", {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(70_000)]),
      body: JSON.stringify({ photos: photos.map(({ preview, width, height }) => ({ preview, width, height })) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Couldn’t make your Strip. Try again.");
    const plan = validateGenerationPlan(data.plan, photos.length);
    setPhase("finish");
    const ratios: Record<string, number> = {};
    const stickerIds = new Set(plan.sections.flatMap((s) => s.overlays.flatMap((o) => o.stickerId ? [o.stickerId] : [])));
    await Promise.all([...stickerIds].map(async (id) => {
      const image = new Image();
      image.src = STICKER_PACK.find((sticker) => sticker.id === id)!.src;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([image.decode(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Sticker load timed out")), 10_000); })]);
        ratios[id] = image.naturalWidth / image.naturalHeight;
      }
      catch { throw new Error("A sticker couldn’t load. Try again."); }
      finally { clearTimeout(timeout); }
    }));
    controller.signal.throwIfAborted();
    const blocks = buildGeneratedStrip(plan, photos, document.documentElement.clientWidth, ratios);
    onGenerated(blocks);
  };
  const run = async (files?: File[]) => {
    if (abortRef.current && !abortRef.current.signal.aborted) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setError("");
    try {
      if (files) {
        setPhase("prepare"); setPrepared(0); setFileCount(files.length);
        photosRef.current = [];
        setCanRetry(false);
        photosRef.current = await prepareGenerationPhotos(files, controller.signal, setPrepared);
        setCanRetry(true);
      }
      await arrange(photosRef.current, controller);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "Couldn’t make your Strip. Try again.");
      setPhase("error");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };
  return <div ref={panelRef} tabIndex={-1} className={styles.flow} role="dialog" aria-modal="true" aria-labelledby="generation-heading">
    <header className={styles.header}>
      <button type="button" aria-label={busy ? "Cancel generation" : "Back to your Strips"} onClick={onClose}>{busy ? <X /> : <ArrowLeft />}</button>
      <span>Make a Strip</span>
    </header>
    <input ref={pickerRef} hidden type="file" accept="image/*" multiple onChange={(event) => {
      const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = "";
      if (files.length) void run(files);
    }} />
    {busy ? <div className={styles.loading} aria-busy="true">
      <div className={styles.stickerDance} aria-hidden="true">
        {loaderStickers.map((sticker, index) => <img key={sticker.id} src={sticker.src} alt=""
          style={{ "--i": index } as CSSProperties} />)}
      </div>
      <h1 id="generation-heading">Putting it<br />all together.</h1>
      <p role="status" aria-live="polite">{phase === "prepare" ? `Getting your photos ready ${prepared}/${fileCount}` : phase === "finish" ? "A few finishing touches…" : "Finding colors. Making room. Adding stickers."}</p>
      <div className={styles.loadingSquares} aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>
    </div> : <div className={styles.pick}>
      <div className={styles.pickArtwork} aria-hidden="true"><ImagePlus /><img src={loaderStickers[0].src} alt="" /><img src={loaderStickers[1].src} alt="" /></div>
      <h1 id="generation-heading">{phase === "error" ? "Let’s try that again." : "Your photos.\nA little remix."}</h1>
      <p>{phase === "error" ? error : `Pick up to ${MAX_GENERATION_PHOTOS} photos. We’ll arrange them into a Strip you can make your own.`}</p>
      {phase === "error" && canRetry && <button className={styles.primary} type="button" onClick={() => void run()}>Try again <ArrowUpRight /></button>}
      <button className={phase === "error" && canRetry ? styles.secondary : styles.primary} type="button" onClick={() => pickerRef.current?.click()}>
        {phase === "error" ? "Choose other photos" : "Choose photos"} <ImagePlus aria-hidden="true" />
      </button>
      {phase === "error" && <button type="button" className={styles.secondary} onClick={onScratch}>Start from scratch</button>}
      <small>Photos are sent to OpenAI to arrange your Strip.<br />Nothing is published until you say so.</small>
    </div>}
  </div>;
}
