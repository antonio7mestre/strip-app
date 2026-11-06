"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, Check, ImagePlus, Plus, X } from "lucide-react";
import { MediaLoadingTile } from "./MediaLoadingTile";
import { prepareMediaFiles } from "@/app/lib/media-import";
import { STICKER_PACK } from "@/app/lib/sticker-pack";
import { FIRST_STRIP_BLOCK_LIMIT, FIRST_STRIP_FONT_SIZE, colorMatchedStickers, stickerMasonry, type FirstStripInput, type OnboardingMedia } from "@/app/lib/onboarding-strip";
import { installOnboardingKeyboard } from "@/app/lib/onboarding-keyboard";
import type { CreationStep } from "@/app/lib/onboarding-history";
import { profileInk, PROFILE_FONT_CATALOG } from "@/app/lib/profile";
import { normalizedFontSize } from "@/app/lib/font-sizing";
import shared from "./OnboardingBackground.module.css";
import styles from "./OnboardingStrip.module.css";

const ONBOARDING_STICKERS = STICKER_PACK.filter(sticker => sticker.category !== "scrap");

const textStyle: CSSProperties = {
  fontFamily: PROFILE_FONT_CATALOG.find(font => font.id === "sans")?.family,
  fontSize: normalizedFontSize("sans", FIRST_STRIP_FONT_SIZE),
  lineHeight: `${FIRST_STRIP_FONT_SIZE * 1.22}px`,
};

export function OnboardingStrip({ active, color, step, onStepChange, onBack, onComplete }: {
  active: boolean; color: string; step: CreationStep; onStepChange: (step: CreationStep) => void;
  onBack: () => void; onComplete: (input: FirstStripInput, transferMedia: () => void) => Promise<void>;
}) {
  const [media, setMedia] = useState<OnboardingMedia[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [identity] = useState(() => ({ id: crypto.randomUUID(), createdAt: Date.now(), seed: Math.floor(Math.random() * 0xffffffff) }));
  const [cycles, setCycles] = useState(1);
  const [viewport, setViewport] = useState({ width: 330, height: 600, top: 0 });
  const [progress, setProgress] = useState("");
  const [pendingMedia, setPendingMedia] = useState<Array<{ id: string; src: string; type: "image" | "video"; alt: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const screen = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const words = useRef<HTMLTextAreaElement>(null);
  const measurement = useRef<HTMLParagraphElement>(null);
  const controller = useRef<AbortController | null>(null);
  const ownedBlobs = useRef(new Set<string>());
  const warmedStickers = useRef(new Map<string, HTMLImageElement>());
  const busy = Boolean(progress) || saving;
  const ink = profileInk(color);
  const palette = useMemo(() => media.flatMap(item => item.palette ? [item.palette] : []), [media]);
  const assets = useMemo(() => Array.from({ length: cycles }, (_, cycle) => colorMatchedStickers(ONBOARDING_STICKERS, identity.seed + cycle, palette)).flat(), [cycles, identity.seed, palette]);
  const masonry = useMemo(() => stickerMasonry(assets, viewport.width), [assets, viewport.width]);
  const visible = masonry.items.filter(item => item.top + item.height >= viewport.top - 500 && item.top <= viewport.top + viewport.height + 500);

  useEffect(() => {
    // The picker shows small thumbnails. Prepare the selected originals while
    // the user writes, instead of starting those downloads after Continue.
    selected.forEach(id => {
      const asset = STICKER_PACK.find(sticker => sticker.id === id);
      if (!asset || warmedStickers.current.has(id)) return;
      const image = new Image();
      image.src = asset.src;
      warmedStickers.current.set(id, image);
      void image.decode().catch(() => {});
    });
  }, [selected]);

  useLayoutEffect(() => {
    if (!active) return;
    document.documentElement.style.setProperty("--onboarding-background", color);
  }, [active, color]);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!active || !element) return;
    const update = () => {
      const edge = Math.max(0, Math.min(1, element.scrollTop / 20));
      element.style.setProperty("--scroll-top-opacity", `${1 - edge * edge * (3 - 2 * edge)}`);
      setViewport({ width: Math.max(1, element.clientWidth - 32), height: element.clientHeight, top: element.scrollTop });
      if (step === "stickers" && element.scrollHeight - element.scrollTop - element.clientHeight < 700) setCycles(count => count + 1);
    };
    let frame = 0;
    const scroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(update);
    resize.observe(element); update();
    element.addEventListener("scroll", scroll, { passive: true });
    return () => { resize.disconnect(); cancelAnimationFrame(frame); element.removeEventListener("scroll", scroll); };
  }, [active, step]);
  useLayoutEffect(() => {
    if (!active || step !== "message" || !screen.current) return;
    return installOnboardingKeyboard(screen.current);
  }, [active, step]);
  useLayoutEffect(() => {
    const input = words.current;
    if (!active || step !== "message" || !input) return;
    input.style.height = "0px";
    input.style.height = `${input.scrollHeight}px`;
  }, [active, step, message]);
  useEffect(() => () => {
    controller.current?.abort();
    ownedBlobs.current.forEach(src => URL.revokeObjectURL(src));
  }, []);

  const importFiles = async (files: File[]) => {
    if (!files.length || controller.current || saving) return;
    const room = FIRST_STRIP_BLOCK_LIMIT - 1 - media.length - selected.length;
    if (files.length > room) { setError(`You can add ${room} more items to this Strip.`); return; }
    const request = new AbortController(); controller.current = request;
    const kind = files.every(file => file.type.startsWith("image/")) ? "images" : "media";
    setError(""); setProgress(`Loading ${kind} 1 of ${files.length}`);
    const queued = files.map(file => ({ id: crypto.randomUUID(), src: URL.createObjectURL(file), type: file.type.startsWith("video/") ? "video" as const : "image" as const, alt: file.name }));
    queued.forEach(item => ownedBlobs.current.add(item.src));
    setPendingMedia(queued);
    try {
      const result = await prepareMediaFiles(files, { signal: request.signal, previews: true,
        onPrepared: (item, index) => {
          if (request.signal.aborted) return;
          if (item.src.startsWith("blob:")) ownedBlobs.current.add(item.src);
          setMedia(previous => [...previous, { ...item, id: queued[index].id }]);
          setPendingMedia(previous => previous.filter(pending => queued.findIndex(entry => entry.id === pending.id) > index));
        },
        onProgress: ({ completed, total }) => setProgress(`Loading ${kind} ${Math.min(completed + 1, total)} of ${total}`),
      });
      if (request.signal.aborted) return;
      if (result.failed) setError(`${result.failed} item${result.failed === 1 ? "" : "s"} couldn’t be opened. Try choosing those again.`);
    } catch { if (!request.signal.aborted) setError("Couldn’t open those files. Please try again."); }
    finally {
      queued.forEach(item => { ownedBlobs.current.delete(item.src); URL.revokeObjectURL(item.src); });
      controller.current = null;
      if (!request.signal.aborted) { setProgress(""); setPendingMedia([]); }
    }
  };
  const go = (next: typeof step) => {
    // Mount and focus in the same tap, while Safari still has user activation.
    flushSync(() => { setError(""); onStepChange(next); });
    scroller.current?.scrollTo({ top: 0 });
    if (next === "message") {
      words.current?.focus({ preventScroll: true });
      words.current?.setSelectionRange(message.length, message.length);
    }
  };
  const complete = async () => {
    if (busy) return;
    setSaving(true); setError("");
    try {
      await onComplete({ ...identity, media, stickers: selected.map(id => STICKER_PACK.find(asset => asset.id === id)!), message,
        width: screen.current?.clientWidth ?? window.innerWidth, textHeight: (measurement.current?.getBoundingClientRect().height ?? 30) + 32 }, () => {
        // The regular editor now owns these URLs, including videos still saving.
        ownedBlobs.current.clear();
        setLeaving(true);
        words.current?.blur();
      });
    } catch (cause) { setLeaving(false); setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "Couldn’t save your Strip. Keep this page open and try again."); setSaving(false); }
  };
  if (!active) return null;
  return <section ref={screen} data-onboarding-strip className={`${shared.screen} ${styles.screen}${step === "message" ? ` ${styles.writing}` : ""}${leaving ? ` ${styles.leaving}` : ""}`} aria-labelledby="first-strip-heading"
    style={{ backgroundColor: color, color: ink, "--onboarding-ink": ink, "--onboarding-background": color } as CSSProperties}>
    <header className={`auth-flow-header ${shared.navigation} ${styles.navigation}`}>
      <button className={`auth-back-button ${shared.back}`} type="button" aria-label={step === "media" ? "Back to background" : step === "stickers" ? "Back to media" : "Back to stickers"}
        disabled={busy} onClick={() => step === "media" ? onBack() : go(step === "stickers" ? "media" : "stickers")}><ArrowLeft strokeWidth={2.8} /></button>
    </header>
    <div className={`auth-flow-copy ${shared.heading} ${styles.heading}`}>
      <h1 id="first-strip-heading">{step === "media" ? "Let’s make your Strip" : step === "stickers" ? "Make it yours" : "What you want to say?"}</h1>
      <p>{step === "media" ? "Start with some photos or videos." : step === "stickers" ? "Pick some stickers. Or keep it simple." : "What's the story here?"}</p>
    </div>
    <div className={styles.scroll} data-edge-fade={step !== "message" || undefined} ref={scroller} key={step}>
      {step === "media" ? <div className={styles.media}>
        <input ref={file} hidden type="file" accept="image/*,video/*" multiple onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void importFiles(files); }} />
        <div className={styles.mediaGrid}>{media.map(item => <div className={styles.mediaItem} key={item.id}>
          <MediaLoadingTile src={item.src} previewSrc={item.previewSrc} type={item.type} alt={item.alt} ready />
          <button type="button" disabled={busy} aria-label={`Remove ${item.alt}`} onClick={() => {
            setMedia(items => items.filter(media => media.id !== item.id));
            if (ownedBlobs.current.delete(item.src)) URL.revokeObjectURL(item.src);
          }}><X size={16} /></button>
        </div>)}
        {progress ? <div className={`${styles.mediaItem} ${styles.pendingMedia}`} key={pendingMedia[0]?.id ?? "finishing"} role="status" aria-label={progress}>
          <MediaLoadingTile src={pendingMedia[0]?.src} type={pendingMedia[0]?.type} />
        </div> : <button type="button" className={styles.addMedia} disabled={saving} aria-label={media.length ? "Add more" : "Choose photos & videos"} onClick={() => file.current?.click()}>
          {media.length ? <Plus /> : <ImagePlus size={44} strokeWidth={1.7} />}<span>{media.length ? "Add more" : "Choose photos & videos"}</span>
        </button>}
        </div>
      </div> : step === "stickers" ? <div className={styles.masonry} role="group" aria-label="Choose stickers" style={{ height: masonry.height }}>
        {visible.map(item => <button type="button" key={item.index} aria-label={item.asset.name} aria-pressed={selected.includes(item.asset.id)}
          className={styles.sticker} style={{ left: item.left, top: item.top, width: item.width, height: item.height, "--tilt": `${item.rotation}deg`, "--selected-tilt": `${item.selectedRotation}deg` } as CSSProperties}
          onClick={() => {
            if (!selected.includes(item.asset.id) && media.length + selected.length >= FIRST_STRIP_BLOCK_LIMIT - 1) { setError("This Strip is full. Deselect a sticker to pick another."); return; }
            setSelected(ids => ids.includes(item.asset.id) ? ids.filter(id => id !== item.asset.id) : [...ids, item.asset.id]); setError("");
          }}>
          <img src={item.asset.thumbnailSrc} alt="" draggable={false} loading="lazy" decoding="async" style={{ width: item.imageWidth, height: item.imageHeight }} />
          {selected.includes(item.asset.id) ? <span className={styles.selected}><Check size={16} strokeWidth={3} /></span> : null}
        </button>)}
      </div> : <div className={styles.words}>
        <textarea ref={words} aria-label="What you want to say?" placeholder="Type something" rows={1} style={textStyle} value={message} maxLength={10000} disabled={saving} onChange={event => setMessage(event.target.value)} />
      </div>}
    </div>
    <p ref={measurement} aria-hidden="true" className={styles.measure} style={textStyle}>{message.trim() + "\u200B"}</p>
    <footer className={styles.footer}>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.footerRow}>
        <button type="button" className={shared.continue} disabled={busy || (step === "media" && !media.length)}
          onClick={() => step === "message" ? void complete() : go(step === "media" ? "stickers" : "message")}>
          {saving ? "Making your Strip…" : step === "message" ? message.trim() ? "Continue" : "Skip" : step === "stickers" && !selected.length ? "Skip" : "Continue"}
        </button>
      </div>
    </footer>
  </section>;
}
