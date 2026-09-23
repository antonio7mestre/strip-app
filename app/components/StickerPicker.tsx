"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Sticker, X } from "lucide-react";
import {
  STICKER_CATEGORIES,
  stickersByCategory,
  type StickerAsset,
  type StickerCategory,
} from "@/app/lib/sticker-pack";
import styles from "./StickerPicker.module.css";
import { installStickerTrayScroll } from "@/app/lib/sticker-tray-scroll";

const labels: Record<StickerCategory, string> = {
  random: "Random",
  animals: "Animals",
  items: "Items",
  nature: "Nature",
  clothing: "Clothing",
};

const stickerSizeClasses = [
  styles.stickerLarge,
  styles.stickerSmall,
  styles.stickerMedium,
  styles.stickerLarge,
  styles.stickerMedium,
  styles.stickerSmall,
  styles.stickerLarge,
] as const;

const stickerSizeClass = (sticker: StickerAsset, index: number) =>
  sticker.id.startsWith("gummy-bear")
    ? styles.stickerMedium
    : stickerSizeClasses[index % stickerSizeClasses.length];

export function StickerPicker({
  open,
  onClose,
  onPhotoVideo,
  onSticker,
  onViewChange,
}: {
  open: boolean;
  onClose: () => void;
  onPhotoVideo: () => void;
  onSticker: (sticker: StickerAsset) => void;
  onViewChange: (view: "source" | "pack") => void;
}) {
  if (!open) return null;
  return (
    <StickerPickerDialog
      onClose={onClose}
      onPhotoVideo={onPhotoVideo}
      onSticker={onSticker}
      onViewChange={onViewChange}
    />
  );
}

function StickerPickerDialog({
  onClose,
  onPhotoVideo,
  onSticker,
  onViewChange,
}: {
  onClose: () => void;
  onPhotoVideo: () => void;
  onSticker: (sticker: StickerAsset) => void;
  onViewChange: (view: "source" | "pack") => void;
}) {
  const [view, setView] = useState<"source" | "pack">("source");
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [category, setCategory] = useState<StickerCategory>("random");
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const pickTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => installStickerTrayScroll(() => scrollRef.current), []);
  useLayoutEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    // Keep keyboard focus useful, but do not summon a focus ring on a touch tap.
    const focusFrame = document.activeElement?.matches(":focus-visible")
      ? requestAnimationFrame(() => firstActionRef.current?.focus({ preventScroll: true }))
      : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      if (pickTimerRef.current !== null) window.clearTimeout(pickTimerRef.current);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const stickers = stickersByCategory(category);
  const showView = (nextView: "source" | "pack") => {
    setView(nextView);
    onViewChange(nextView);
  };
  const chooseSticker = (sticker: StickerAsset) => {
    if (pickingId) return;
    setPickingId(sticker.id);
    pickTimerRef.current = window.setTimeout(() => onSticker(sticker), 140);
  };

  return (
      <section className={`${styles.tray} ${view === "pack" ? styles.packTray : styles.sourceTray}`}
        aria-label={view === "source" ? "Add sticker" : undefined}
        aria-labelledby={view === "pack" ? "sticker-picker-title" : undefined}>
        {view === "source" ? (
            <div className={styles.sourceChoices}>
              <button ref={firstActionRef} className={styles.sourceBackChoice} type="button" onClick={onClose}
                aria-label="Back to editor tools">
                <ArrowLeft aria-hidden="true" />
              </button>
              <button className={styles.sourceChoice} type="button"
                onClick={() => showView("pack")}>
                <Sticker aria-hidden="true" />
                <span>Sticker<br />pack</span>
              </button>
              <button className={styles.sourceChoice} type="button" onClick={onPhotoVideo}>
                <ImagePlus aria-hidden="true" />
                <span>Photo or<br />video</span>
              </button>
            </div>
        ) : (
          <>
            <header className={styles.header}>
              <button ref={firstActionRef} className={styles.iconButton} type="button" onClick={() => showView("source")}
                aria-label="Back to sticker options">
                <ArrowLeft aria-hidden="true" />
              </button>
              <h2 id="sticker-picker-title">Sticker pack</h2>
              <button className={styles.iconButton} type="button" onClick={onClose} aria-label="Close sticker pack">
                <X aria-hidden="true" />
              </button>
            </header>
            <div className={styles.categories} role="tablist" aria-label="Sticker categories">
              {STICKER_CATEGORIES.map(item => (
                <button key={item} className={category === item ? styles.activeCategory : ""}
                  type="button" role="tab" aria-selected={category === item}
                  onClick={() => {
                    setCategory(item);
                    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
                  }}>{labels[item]}</button>
              ))}
            </div>
            <div ref={scrollRef} className={styles.scrollArea} role="tabpanel" tabIndex={0}
              aria-label={`${labels[category]} stickers`}>
              <div className={styles.masonry}>
              {stickers.map((sticker, index) => (
                <button key={sticker.id} type="button"
                  className={`${styles.stickerButton} ${stickerSizeClass(sticker, index)} ${pickingId === sticker.id ? styles.isPicking : ""}`}
                  onClick={() => chooseSticker(sticker)} aria-label={`Add ${sticker.name}`}>
                  <img src={sticker.src} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
              </div>
            </div>
          </>
        )}
      </section>
  );
}
