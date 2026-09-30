"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, ImagePlus, Palette, Pipette, Sticker, X } from "lucide-react";
import {
  STICKER_CATEGORIES,
  stickersByCategory,
  stickerTrayMaxWidth,
  type StickerAsset,
  type StickerCategory,
} from "@/app/lib/sticker-pack";
import styles from "./StickerPicker.module.css";
import { StickerImage } from "./StickerImage";
import { installStickerTrayScroll } from "@/app/lib/sticker-tray-scroll";
import {
  SHAPE_STICKERS, SHAPE_STICKER_COLORS,
  shapeColorFromHsl, shapeColorInk, shapeColorPosition, type ShapeSticker,
} from "@/app/lib/shape-stickers";

type PickerCategory = StickerCategory | "shapes";
type PickerView = "source" | "pack" | "page-color";
const categories: readonly PickerCategory[] = [...STICKER_CATEGORIES, "shapes"];
const labels: Record<PickerCategory, string> = {
  random: "Random",
  animals: "Animals",
  items: "Items",
  nature: "Nature",
  clothing: "Clothing",
  scrap: "Scrap",
  shapes: "Shapes",
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
  onShape,
  shapeColor,
  onShapeColorChange,
  samplePageColor,
  onViewChange,
}: {
  open: boolean;
  onClose: () => void;
  onPhotoVideo: () => void;
  onSticker: (sticker: StickerAsset) => void;
  onShape: (shape: ShapeSticker, color: string) => void;
  shapeColor: string;
  onShapeColorChange: (color: string) => void;
  samplePageColor: (x: number, y: number) => string | null;
  onViewChange: (view: PickerView) => void;
}) {
  if (!open) return null;
  return (
    <StickerPickerDialog
      onClose={onClose}
      onPhotoVideo={onPhotoVideo}
      onSticker={onSticker}
      onShape={onShape}
      shapeColor={shapeColor}
      onShapeColorChange={onShapeColorChange}
      samplePageColor={samplePageColor}
      onViewChange={onViewChange}
    />
  );
}

function StickerPickerDialog({
  onClose,
  onPhotoVideo,
  onSticker,
  onShape,
  shapeColor,
  onShapeColorChange,
  samplePageColor,
  onViewChange,
}: {
  onClose: () => void;
  onPhotoVideo: () => void;
  onSticker: (sticker: StickerAsset) => void;
  onShape: (shape: ShapeSticker, color: string) => void;
  shapeColor: string;
  onShapeColorChange: (color: string) => void;
  samplePageColor: (x: number, y: number) => string | null;
  onViewChange: (view: PickerView) => void;
}) {
  const [view, setView] = useState<"source" | "pack">("source");
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [category, setCategory] = useState<PickerCategory>("random");
  const [shapePaletteOpen, setShapePaletteOpen] = useState(false);
  const [shapeWheelOpen, setShapeWheelOpen] = useState(false);
  const [samplingPage, setSamplingPage] = useState(false);
  const [samplePoint, setSamplePoint] = useState<{ x: number; y: number; color: string } | null>(null);
  const samplePointerRef = useRef<number | null>(null);
  const pageTapRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const [wheelHue, setWheelHue] = useState(() => shapeColorPosition(shapeColor).hue);
  const firstActionRef = useRef<HTMLButtonElement>(null);
  const pickTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const paletteScrollRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const samplePageColorRef = useRef(samplePageColor);
  const onShapeColorChangeRef = useRef(onShapeColorChange);
  const sampleAt = useCallback((clientX: number, clientY: number) => {
    const color = samplePageColorRef.current(clientX, clientY);
    if (!color) return;
    setSamplePoint({ x: clientX + window.scrollX, y: clientY + window.scrollY, color });
    onShapeColorChangeRef.current(color);
  }, []);

  useLayoutEffect(() => samplingPage ? undefined : installStickerTrayScroll(
    () => scrollRef.current,
    () => [categoriesRef.current, paletteScrollRef.current],
  ), [samplingPage]);
  useLayoutEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useLayoutEffect(() => {
    samplePageColorRef.current = samplePageColor;
    onShapeColorChangeRef.current = onShapeColorChange;
  }, [samplePageColor, onShapeColorChange]);

  useEffect(() => {
    // Keep keyboard focus useful, but do not summon a focus ring on a touch tap.
    const focusFrame = document.activeElement?.matches(":focus-visible")
      ? requestAnimationFrame(() => firstActionRef.current?.focus({ preventScroll: true }))
      : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (samplingPage) { setSamplingPage(false); onViewChange("pack"); }
      else if (shapePaletteOpen) { setShapePaletteOpen(false); setShapeWheelOpen(false); }
      else onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      if (focusFrame !== null) cancelAnimationFrame(focusFrame);
      if (pickTimerRef.current !== null) window.clearTimeout(pickTimerRef.current);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [samplingPage, shapePaletteOpen, onViewChange]);

  useEffect(() => {
    if (!samplingPage) return;
    const root = document.documentElement;
    root.classList.add("page-color-picking");
    let suppressNextClick: ((event: MouseEvent) => void) | null = null;
    let suppressClickTimer: number | null = null;
    const clearClickSuppression = () => {
      if (suppressNextClick) document.removeEventListener("click", suppressNextClick, true);
      if (suppressClickTimer !== null) window.clearTimeout(suppressClickTimer);
      suppressNextClick = null;
      suppressClickTimer = null;
    };
    const pointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.button !== 0 ||
        event.target.closest(".page-color-picker-indicator, .shape-page-color-done")) return;
      pageTapRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      event.preventDefault();
      event.stopPropagation();
    };
    const pointerMove = (event: PointerEvent) => {
      const tap = pageTapRef.current;
      if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) tap.moved = true;
    };
    const pointerUp = (event: PointerEvent) => {
      const tap = pageTapRef.current;
      if (tap?.id !== event.pointerId) return;
      pageTapRef.current = null;
      if (tap.moved) return;
      event.preventDefault();
      event.stopPropagation();
      sampleAt(event.clientX, event.clientY);
      clearClickSuppression();
      suppressNextClick = (click) => {
        click.preventDefault();
        click.stopImmediatePropagation();
        clearClickSuppression();
      };
      document.addEventListener("click", suppressNextClick, true);
      suppressClickTimer = window.setTimeout(clearClickSuppression, 450);
      setSamplingPage(false);
      onViewChange("pack");
    };
    const pointerCancel = (event: PointerEvent) => {
      if (pageTapRef.current?.id === event.pointerId) pageTapRef.current = null;
      if (samplePointerRef.current === event.pointerId) samplePointerRef.current = null;
    };
    const preventPickerTouchScroll = (event: TouchEvent) => {
      if (samplePointerRef.current !== null && event.cancelable) event.preventDefault();
    };
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointermove", pointerMove, true);
    document.addEventListener("pointerup", pointerUp, true);
    document.addEventListener("pointercancel", pointerCancel, true);
    document.addEventListener("touchmove", preventPickerTouchScroll, { capture: true, passive: false });
    return () => {
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointermove", pointerMove, true);
      document.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("pointercancel", pointerCancel, true);
      document.removeEventListener("touchmove", preventPickerTouchScroll, true);
      samplePointerRef.current = null;
      pageTapRef.current = null;
      root.classList.remove("page-color-picking");
    };
  }, [samplingPage, onViewChange, sampleAt]);

  const stickers = category === "shapes" ? [] : stickersByCategory(category);
  const colorPosition = shapeColorPosition(shapeColor);
  const position = { ...colorPosition, hue: colorPosition.saturation > 0 ? colorPosition.hue : wheelHue };
  const customColor = SHAPE_STICKER_COLORS.some((color) => color.value === shapeColor)
    ? [] : [{ name: "Current", value: shapeColor }];
  const chooseShapeColor = (color: string) => {
    const next = shapeColorPosition(color);
    if (next.saturation > 0) setWheelHue(next.hue);
    onShapeColorChange(color);
  };
  const showView = (nextView: "source" | "pack") => {
    setView(nextView);
    setShapePaletteOpen(false);
    setShapeWheelOpen(false);
    onViewChange(nextView);
  };
  const chooseSticker = (sticker: StickerAsset) => {
    if (pickingId) return;
    setPickingId(sticker.id);
    pickTimerRef.current = window.setTimeout(() => onSticker(sticker), 140);
  };
  const chooseShape = (shape: ShapeSticker) => {
    if (pickingId) return;
    setPickingId(shape.id);
    pickTimerRef.current = window.setTimeout(() => onShape(shape, shapeColor), 140);
  };
  const setWheelPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const hue = Math.max(0, Math.min(359.99, (event.clientX - bounds.left) / bounds.width * 360));
    const lightness = Math.max(0, Math.min(100, (1 - (event.clientY - bounds.top) / bounds.height) * 100));
    chooseShapeColor(shapeColorFromHsl(hue, lightness));
  };
  const startPageSampling = () => {
    const dockTop = document.querySelector<HTMLElement>(".main-composer-dock")?.getBoundingClientRect().top ?? window.innerHeight;
    const x = window.innerWidth / 2, y = Math.max(72, dockTop) / 2;
    setSamplePoint({ x: x + window.scrollX, y: y + window.scrollY,
      color: samplePageColorRef.current(x, y) ?? shapeColor });
    setShapeWheelOpen(false);
    setSamplingPage(true);
    onViewChange("page-color");
  };

  return (
    <>
      <section className={`${styles.tray} ${view === "pack" ? styles.packTray : styles.sourceTray} ${shapePaletteOpen ? styles.hasPalette : ""}`}
        inert={samplingPage}
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
            <div ref={categoriesRef} className={styles.categories} role="tablist" aria-label="Sticker categories">
              {categories.map(item => (
                <button key={item} className={category === item ? styles.activeCategory : ""}
                  type="button" role="tab" aria-selected={category === item}
                  onClick={() => {
                    setCategory(item);
                    setShapePaletteOpen(false);
                    setShapeWheelOpen(false);
                    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
                  }}>{labels[item]}</button>
              ))}
            </div>
            {category === "shapes" ? <div className={styles.shapeHeading}>
              <button type="button" className={styles.shapeColorButton} onClick={() => setShapePaletteOpen(true)}
                aria-label="Choose shape color" aria-expanded={shapePaletteOpen}>
                <span style={{ backgroundColor: shapeColor }} aria-hidden="true" />Select a color
              </button>
            </div> : null}
            <div ref={scrollRef} className={styles.scrollArea} role="tabpanel" tabIndex={0}
              aria-label={category === "shapes" ? "Shapes" : `${labels[category]} stickers`}>
              {category === "shapes" ? <div className={styles.masonry}>
                {SHAPE_STICKERS.map((shape, index) => <button key={shape.id} type="button"
                  className={`${styles.stickerButton} ${styles.shapeButton} ${stickerSizeClasses[index % stickerSizeClasses.length]} ${pickingId === shape.id ? styles.isPicking : ""}`}
                  onClick={() => chooseShape(shape)} aria-label={`Add ${shape.name} shape`}>
                  <svg viewBox="0 0 256 256" aria-hidden="true"><path d={shape.path} fill={shapeColor}
                    fillRule={"fillRule" in shape ? shape.fillRule : undefined} /></svg>
                </button>)}
              </div> :
              <div className={styles.masonry}>
              {stickers.map((sticker, index) => (
                <button key={sticker.id} type="button"
                  className={`${styles.stickerButton} ${stickerSizeClass(sticker, index)} ${pickingId === sticker.id ? styles.isPicking : ""}`}
                  style={{ maxWidth: `${stickerTrayMaxWidth(sticker)}%` }}
                  onClick={() => chooseSticker(sticker)} aria-label={`Add ${sticker.name}`}>
                  <StickerImage src={sticker.src} alt="" width={sticker.width} height={sticker.height}
                    loading="lazy" decoding="async" draggable={false} />
                </button>
              ))}
              </div>}
            </div>
          </>
        )}
      </section>
      {view === "pack" && category === "shapes" && typeof document !== "undefined" ? createPortal(
        <footer className={`composer-dock selector-dock shape-selector-dock ${shapeWheelOpen ? "is-gradient-picker" : ""} ${samplingPage ? "is-sampling-page" : shapePaletteOpen ? "is-visible" : ""}`}
          aria-label="Shape color selector" aria-hidden={!shapePaletteOpen || samplingPage} inert={!shapePaletteOpen || samplingPage}>
          <div ref={paletteScrollRef} className={`selector-scroll ${shapeWheelOpen ? "is-gradient-mode" : ""}`}
            role="group" aria-label="Shape color choices">
              {shapeWheelOpen ? <div className="full-gradient-picker" role="slider" tabIndex={0}
                aria-label="Choose any shape color" aria-valuenow={Math.round(position.lightness)}
                aria-valuemin={0} aria-valuemax={100} aria-valuetext={shapeColor}
                onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setWheelPoint(event); }}
                onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setWheelPoint(event); }}
                onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
                onPointerCancel={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
                onKeyDown={(event) => {
                  const hue = position.hue + (event.key === "ArrowLeft" ? -5 : event.key === "ArrowRight" ? 5 : 0);
                  const lightness = position.lightness + (event.key === "ArrowUp" ? 5 : event.key === "ArrowDown" ? -5 : 0);
                  if (hue === position.hue && lightness === position.lightness) return;
                  event.preventDefault(); chooseShapeColor(shapeColorFromHsl(hue, lightness));
                }}>
                <span className="gradient-picker-value" style={{ left: `${Math.min(94, Math.max(6, position.hue / 360 * 100))}%`,
                  top: `${Math.min(72, Math.max(28, 100 - position.lightness))}%`, backgroundColor: shapeColor }} aria-hidden="true" />
              </div> : <>
                {[...SHAPE_STICKER_COLORS, ...customColor].map((color) => {
                  const selected = color.value === shapeColor;
                  const ink = shapeColorInk(color.value);
                  return <button key={color.value} type="button"
                    className={`selector-option color-selector-option color-swatch-option ${selected ? "is-selected" : ""}`}
                    style={{ backgroundColor: color.value, color: ink,
                      "--swatch-foreground": ink } as CSSProperties}
                    aria-label={`${color.name} shape color`} aria-pressed={selected}
                    onClick={() => chooseShapeColor(color.value)}>{selected ? <Check className="swatch-check" aria-hidden="true" /> : null}</button>;
                })}
                <button type="button" className="selector-option color-selector-option gradient-trigger"
                  aria-label="Open the shape color wheel" onClick={() => setShapeWheelOpen(true)}><Palette aria-hidden="true" /></button>
                <button type="button" className="selector-option color-selector-option page-color-trigger"
                  style={{ backgroundColor: shapeColor, color: shapeColorInk(shapeColor) }}
                  aria-label="Match a shape color from the page" onClick={startPageSampling}><Pipette aria-hidden="true" /></button>
              </>}
          </div>
          <div className="selector-leading">
              <button type="button" className="dock-icon-button selector-back-button"
                aria-label="Done choosing shape color" onClick={() => { setShapePaletteOpen(false); setShapeWheelOpen(false); }}>
                <Check className="dock-glyph" aria-hidden="true" />
              </button>
          </div>
        </footer>, document.body) : null}
      {samplingPage && samplePoint && typeof document !== "undefined" ? createPortal(<>
        <button type="button" className="page-color-picker-indicator" aria-label="Drag to sample a shape color"
          style={{ left: samplePoint.x, top: samplePoint.y, color: samplePoint.color }}
          onPointerDown={(event) => {
            event.preventDefault(); event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            samplePointerRef.current = event.pointerId;
            sampleAt(event.clientX, event.clientY);
          }}
          onPointerMove={(event) => {
            if (samplePointerRef.current !== event.pointerId) return;
            event.preventDefault(); event.stopPropagation(); sampleAt(event.clientX, event.clientY);
          }}
          onPointerUp={(event) => {
            if (samplePointerRef.current !== event.pointerId) return;
            event.preventDefault(); event.stopPropagation(); sampleAt(event.clientX, event.clientY);
            samplePointerRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            setSamplingPage(false); onViewChange("pack");
          }}
          onPointerCancel={(event) => { if (samplePointerRef.current === event.pointerId) samplePointerRef.current = null; }}>
          <span className="page-color-picker-indicator-core" />
        </button>
        <button type="button" className="shape-page-color-done" onClick={() => { setSamplingPage(false); onViewChange("pack"); }}>
          Done
        </button>
      </>, document.body) : null}
    </>
  );
}
