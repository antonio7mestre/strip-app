"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Baseline,
  CaseUpper,
  Check,
  Clapperboard,
  Eye,
  ImagePlus,
  Minus,
  PaintBucket,
  Pencil,
  Pipette,
  Plus,
  Trash2,
  Type,
  Volume2,
  VolumeX,
} from "lucide-react";

type TextBlock = {
  id: string;
  type: "text";
  content: string;
  backgroundColor?: string;
  textColor?: string;
  fontStyle?: FontStyle;
  fontSize?: number;
  editedAt?: number;
};

type ImageBlock = {
  id: string;
  type: "image";
  src: string;
  alt: string;
};

type VideoBlock = {
  id: string;
  type: "video";
  src: string;
  alt: string;
};

type StripBlock = TextBlock | ImageBlock | VideoBlock;
type View = "edit" | "preview" | "published";
type FontStyle = "sans" | "serif" | "mono" | "rounded" | "condensed" | "display" | "hand";
type TextTool = "font" | "background" | "color";

const STORAGE_KEY = "strip-draft-v1";
const DEFAULT_BACKGROUND = "#000000";
const DEFAULT_TEXT = "#FFFFFF";
const DEFAULT_FONT_SIZE = 18;
const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 72;
const FONT_SIZE_STEP = 2;

const FONT_OPTIONS: { label: string; value: FontStyle }[] = [
  { label: "Sans", value: "sans" },
  { label: "Serif", value: "serif" },
  { label: "Mono", value: "mono" },
  { label: "Rounded", value: "rounded" },
  { label: "Condensed", value: "condensed" },
  { label: "Display", value: "display" },
  { label: "Handwritten", value: "hand" },
];

const FONT_STACKS: Record<FontStyle, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
  serif: '"Iowan Old Style", "Baskerville", Georgia, serif',
  mono: '"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace',
  rounded: 'ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont, sans-serif',
  condensed: '"Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif',
  display: 'Didot, "Bodoni 72", "Times New Roman", serif',
  hand: '"Noteworthy", "Bradley Hand", "Comic Sans MS", cursive',
};

const BACKGROUND_COLORS = [
  { label: "Black", value: "#000000" },
  { label: "Graphite", value: "#202020" },
  { label: "Paper", value: "#F2F0EA" },
  { label: "Cobalt", value: "#2147D9" },
  { label: "Cherry", value: "#9E2340" },
  { label: "Forest", value: "#174A36" },
];

const TEXT_COLORS = [
  { label: "White", value: "#FFFFFF" },
  { label: "Black", value: "#050505" },
  { label: "Cream", value: "#FFF1CF" },
  { label: "Sky", value: "#BFD7FF" },
  { label: "Rose", value: "#FFC1D1" },
  { label: "Lime", value: "#D8FF93" },
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nearestTextBlock(blocks: StripBlock[], insertionIndex: number) {
  let above: { block: TextBlock; distance: number } | undefined;
  let below: { block: TextBlock; distance: number } | undefined;

  for (let index = insertionIndex - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.type === "text") {
      above = { block, distance: insertionIndex - index };
      break;
    }
  }

  for (let index = insertionIndex; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type === "text") {
      below = { block, distance: index - insertionIndex + 1 };
      break;
    }
  }

  if (!above) return below?.block;
  if (!below || above.distance <= below.distance) return above.block;
  return below.block;
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment < 1) [red, green, blue] = [chroma, secondary, 0];
  else if (segment < 2) [red, green, blue] = [secondary, chroma, 0];
  else if (segment < 3) [red, green, blue] = [0, chroma, secondary];
  else if (segment < 4) [red, green, blue] = [0, secondary, chroma];
  else if (segment < 5) [red, green, blue] = [secondary, 0, chroma];
  else [red, green, blue] = [chroma, 0, secondary];

  const match = l - chroma / 2;
  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToHsl(hex: string) {
  const [red, green, blue] = hex
    .replace("#", "")
    .match(/.{2}/g)!
    .map((value) => Number.parseInt(value, 16) / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta !== 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  if (hue < 0) hue += 360;
  return { hue, lightness: ((maximum + minimum) / 2) * 100 };
}

type SwatchStyle = CSSProperties & { "--swatch-foreground": string };

function swatchStyle(color: string): SwatchStyle {
  const channels = color
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16) / 255);
  const luminance = channels
    ? channels
        .map((channel) =>
          channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
        )
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
    : 0;
  const foreground = luminance > 0.179 ? "#000000" : "#FFFFFF";
  return {
    backgroundColor: color,
    color: foreground,
    "--swatch-foreground": foreground,
  };
}

function keepFocusedTextBlockVisible(behavior: ScrollBehavior = "auto") {
  const viewport = window.visualViewport;
  const textarea =
    document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null;
  if (!viewport || !textarea) return;

  const keyboardInset = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--keyboard-inset"),
  );
  if (!keyboardInset) return;

  const block = textarea.closest<HTMLElement>(".strip-block");
  if (!block) return;
  const availableBottom = viewport.offsetTop + viewport.height - 16;
  const overflow = block.getBoundingClientRect().bottom - availableBottom;
  if (overflow > 0) {
    window.scrollBy({ top: overflow + 12, left: 0, behavior });
  }
}

function caretOffsetAtPoint(
  container: HTMLElement,
  clientX: number,
  clientY: number,
  textLength: number,
) {
  const caretDocument = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = caretDocument.caretPositionFromPoint?.(clientX, clientY);
  if (position && container.contains(position.offsetNode)) {
    return Math.min(position.offset, textLength);
  }

  const range = caretDocument.caretRangeFromPoint?.(clientX, clientY);
  if (range && container.contains(range.startContainer)) {
    return Math.min(range.startOffset, textLength);
  }

  const bounds = container.getBoundingClientRect();
  return clientY < bounds.top + bounds.height / 2 && clientX < bounds.left + bounds.width / 2
    ? 0
    : textLength;
}

function BlockControls({
  index,
  count,
  onMove,
  onRemove,
  onTextTool,
  activeTextTool,
}: {
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onTextTool?: (tool: TextTool) => void;
  activeTextTool?: TextTool | null;
}) {
  return (
    <div className="block-controls" aria-label="Block controls">
      {onTextTool ? (
        <>
          <button
            type="button"
            className={activeTextTool === "font" ? "is-active" : ""}
            onClick={() => onTextTool("font")}
            aria-label="Choose typeface"
            aria-pressed={activeTextTool === "font"}
          >
            <CaseUpper className="block-glyph" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={activeTextTool === "background" ? "is-active" : ""}
            onClick={() => onTextTool("background")}
            aria-label="Choose background color"
            aria-pressed={activeTextTool === "background"}
          >
            <PaintBucket className="block-glyph" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={activeTextTool === "color" ? "is-active" : ""}
            onClick={() => onTextTool("color")}
            aria-label="Choose text color"
            aria-pressed={activeTextTool === "color"}
          >
            <Baseline className="block-glyph" aria-hidden="true" />
          </button>
          <span className="block-controls-divider" aria-hidden="true" />
        </>
      ) : null}
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        aria-label="Move block up"
      >
        <ArrowUp className="block-glyph" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === count - 1}
        aria-label="Move block down"
      >
        <ArrowDown className="block-glyph" aria-hidden="true" />
      </button>
      <button type="button" onClick={onRemove} aria-label="Delete block">
        <Trash2 className="block-glyph" aria-hidden="true" />
      </button>
    </div>
  );
}

function TextStyleSelector({
  block,
  tool,
  visible,
  onChange,
  onBack,
}: {
  block: TextBlock;
  tool: TextTool;
  visible: boolean;
  onChange: (change: Partial<TextBlock>) => void;
  onBack: () => void;
}) {
  const background = block.backgroundColor ?? DEFAULT_BACKGROUND;
  const textColor = block.textColor ?? DEFAULT_TEXT;
  const fontStyle = block.fontStyle ?? "sans";
  const fontSize = block.fontSize ?? DEFAULT_FONT_SIZE;
  const [gradientMode, setGradientMode] = useState<TextTool | null>(null);
  const backgroundIsCustom = !BACKGROUND_COLORS.some(
    (option) => option.value.toUpperCase() === background.toUpperCase(),
  );
  const textIsCustom = !TEXT_COLORS.some(
    (option) => option.value.toUpperCase() === textColor.toUpperCase(),
  );
  const activeColor = tool === "background" ? background : textColor;
  const gradientPosition = hexToHsl(activeColor);

  useEffect(() => {
    setGradientMode(null);
  }, [tool, visible]);

  const applyGradientPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const vertical = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    const nextColor = hslToHex(horizontal * 360, 100, (1 - vertical) * 100);
    onChange(tool === "background" ? { backgroundColor: nextColor } : { textColor: nextColor });
  };

  const handleGradientKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let nextHue = gradientPosition.hue;
    let nextLightness = gradientPosition.lightness;
    if (event.key === "ArrowLeft") nextHue -= 5;
    else if (event.key === "ArrowRight") nextHue += 5;
    else if (event.key === "ArrowUp") nextLightness += 5;
    else if (event.key === "ArrowDown") nextLightness -= 5;
    else return;
    event.preventDefault();
    nextHue = (nextHue + 360) % 360;
    nextLightness = Math.min(100, Math.max(0, nextLightness));
    const nextColor = hslToHex(nextHue, 100, nextLightness);
    onChange(tool === "background" ? { backgroundColor: nextColor } : { textColor: nextColor });
  };

  return (
    <footer
      className={`composer-dock selector-dock ${visible ? "is-visible" : ""}`}
      aria-label={
        tool === "font"
          ? "Typeface selector"
          : tool === "background"
            ? "Background color selector"
            : "Text color selector"
      }
      aria-hidden={!visible}
    >
      <div
        className={`selector-scroll ${gradientMode === tool ? "is-gradient-mode" : ""}`}
        role="group"
        aria-label={
          tool === "font"
            ? "Typeface choices"
            : tool === "background"
              ? "Background color choices"
              : "Text color choices"
        }
      >
        {gradientMode === tool && tool !== "font" ? (
          <div
            className="full-gradient-picker"
            role="slider"
            tabIndex={visible ? 0 : -1}
            aria-label={tool === "background" ? "Choose any background color" : "Choose any text color"}
            aria-valuetext={activeColor}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              applyGradientPoint(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) applyGradientPoint(event);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onKeyDown={handleGradientKey}
          >
            <span
              className="gradient-picker-value"
              style={{
                left: `${Math.min(94, Math.max(6, (gradientPosition.hue / 360) * 100))}%`,
                top: `${Math.min(72, Math.max(28, 100 - gradientPosition.lightness))}%`,
                backgroundColor: activeColor,
              }}
              aria-hidden="true"
            >
              <Pipette />
            </span>
          </div>
        ) : null}

        {gradientMode !== tool && tool === "font"
          ? [
              <div className="font-size-stepper" role="group" aria-label="Font size" key="font-size">
                <button
                  type="button"
                  onClick={() => onChange({ fontSize: Math.max(MIN_FONT_SIZE, fontSize - FONT_SIZE_STEP) })}
                  disabled={fontSize <= MIN_FONT_SIZE}
                  tabIndex={visible ? 0 : -1}
                  aria-label="Decrease font size"
                >
                  <Minus aria-hidden="true" />
                </button>
                <output aria-label={`${fontSize} pixels`}>{fontSize}</output>
                <button
                  type="button"
                  onClick={() => onChange({ fontSize: Math.min(MAX_FONT_SIZE, fontSize + FONT_SIZE_STEP) })}
                  disabled={fontSize >= MAX_FONT_SIZE}
                  tabIndex={visible ? 0 : -1}
                  aria-label="Increase font size"
                >
                  <Plus aria-hidden="true" />
                </button>
              </div>,
              ...FONT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  data-font={option.value}
                  className={`selector-option font-selector-option ${
                    fontStyle === option.value ? "is-selected" : ""
                  }`}
                  onClick={() => onChange({ fontStyle: option.value })}
                  tabIndex={visible ? 0 : -1}
                  aria-label={`${option.label} typeface`}
                  aria-pressed={fontStyle === option.value}
                >
                  Aa
                </button>
              )),
            ]
          : null}

        {gradientMode !== tool && tool === "background"
          ? BACKGROUND_COLORS.map((option) => {
              const selected = background.toUpperCase() === option.value.toUpperCase();
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`selector-option color-selector-option ${selected ? "is-selected" : ""}`}
                  style={swatchStyle(option.value)}
                  onClick={() => onChange({ backgroundColor: option.value })}
                  tabIndex={visible ? 0 : -1}
                  aria-label={`${option.label} background`}
                  aria-pressed={selected}
                >
                  {selected ? <Check className="swatch-check" aria-hidden="true" /> : null}
                </button>
              );
            })
          : null}

        {gradientMode !== tool && tool === "background" ? (
          <button
            type="button"
            className={`selector-option color-selector-option gradient-trigger ${
              backgroundIsCustom ? "is-selected" : ""
            }`}
            style={swatchStyle(background)}
            onClick={() => setGradientMode("background")}
            tabIndex={visible ? 0 : -1}
            aria-label="Choose any background color"
            aria-pressed={backgroundIsCustom}
          >
            <Pipette aria-hidden="true" />
          </button>
        ) : null}

        {gradientMode !== tool && tool === "color"
          ? TEXT_COLORS.map((option) => {
              const selected = textColor.toUpperCase() === option.value.toUpperCase();
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`selector-option color-selector-option ${selected ? "is-selected" : ""}`}
                  style={swatchStyle(option.value)}
                  onClick={() => onChange({ textColor: option.value })}
                  tabIndex={visible ? 0 : -1}
                  aria-label={`${option.label} text`}
                  aria-pressed={selected}
                >
                  {selected ? <Check className="swatch-check" aria-hidden="true" /> : null}
                </button>
              );
            })
          : null}

        {gradientMode !== tool && tool === "color" ? (
          <button
            type="button"
            className={`selector-option color-selector-option gradient-trigger ${
              textIsCustom ? "is-selected" : ""
            }`}
            style={swatchStyle(textColor)}
            onClick={() => setGradientMode("color")}
            tabIndex={visible ? 0 : -1}
            aria-label="Choose any text color"
            aria-pressed={textIsCustom}
          >
            <Pipette aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="selector-leading">
        <span className="dock-divider" aria-hidden="true" />
        <button
          className="dock-icon-button selector-back-button"
          type="button"
          onClick={onBack}
          tabIndex={visible ? 0 : -1}
          aria-label="Done choosing styles"
        >
          <Check className="dock-glyph" aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}

function StripVideoBlock({
  block,
  isEditing,
  isSelected,
  onSelect,
}: {
  block: VideoBlock;
  isEditing: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updatePlayback = (isVisible: boolean) => {
      if (isVisible) {
        void video.play().catch(() => {
          // Muted inline playback is allowed on supported mobile browsers.
        });
      } else {
        video.pause();
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => updatePlayback(entry.isIntersecting),
      { threshold: 0 },
    );

    observer.observe(video);
    const bounds = video.getBoundingClientRect();
    updatePlayback(bounds.bottom > 0 && bounds.top < window.innerHeight);
    return () => observer.disconnect();
  }, [block.src]);

  const toggleAudio = () => {
    const nextMuted = !muted;
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
      if (!nextMuted) void videoRef.current.play().catch(() => {});
    }
    setMuted(nextMuted);
  };

  return (
    <figure
      className={`strip-block video-block ${isEditing ? "is-editing" : ""} ${
        isEditing && isSelected ? "is-selected" : ""
      }`}
      data-block-id={block.id}
      onClick={onSelect}
      onContextMenu={(event) => event.preventDefault()}
    >
      <video
        ref={videoRef}
        src={block.src}
        aria-label={block.alt ? `Video: ${block.alt}` : "Strip video"}
        autoPlay
        muted={muted}
        loop
        playsInline
        controls={false}
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
        preload="metadata"
        draggable={false}
      />
      <button
        className="video-audio-toggle"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toggleAudio();
        }}
        aria-label={muted ? "Turn video sound on" : "Turn video sound off"}
        aria-pressed={!muted}
      >
        {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
      </button>
    </figure>
  );
}

export default function Home() {
  const [blocks, setBlocks] = useState<StripBlock[]>([]);
  const [view, setView] = useState<View>("edit");
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editingTextBlockId, setEditingTextBlockId] = useState<string | null>(null);
  const [activeTextTool, setActiveTextTool] = useState<TextTool | null>(null);
  const [lastTextTool, setLastTextTool] = useState<TextTool>("font");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const firstVisibleBlock =
    view === "edit"
      ? blocks[0]
      : blocks.find(
          (block) => block.type !== "text" || block.content.trim().length > 0,
        );
  const topSafeAreaColor =
    view !== "published" && firstVisibleBlock?.type === "text"
      ? (firstVisibleBlock.backgroundColor ?? DEFAULT_BACKGROUND)
      : DEFAULT_BACKGROUND;

  useEffect(() => {
    document.querySelector<HTMLMetaElement>("#strip-theme-color")?.setAttribute(
      "content",
      topSafeAreaColor,
    );
    document.documentElement.style.backgroundColor = topSafeAreaColor;
  }, [topSafeAreaColor]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    let layoutHeight = window.innerHeight;
    let visibilityFrame: number | null = null;

    const queueFocusedTextBlockVisibility = () => {
      if (visibilityFrame !== null) {
        window.cancelAnimationFrame(visibilityFrame);
      }
      visibilityFrame = window.requestAnimationFrame(() => {
        visibilityFrame = null;
        keepFocusedTextBlockVisible("auto");
      });
    };

    const updateKeyboardInset = () => {
      const textIsFocused = document.activeElement instanceof HTMLTextAreaElement;
      if (!textIsFocused) layoutHeight = window.innerHeight;
      if (!viewport) {
        root.style.setProperty("--keyboard-inset", "0px");
        root.classList.remove("keyboard-open");
        return;
      }
      const obscuredHeight = Math.max(
        0,
        layoutHeight - (viewport.height + viewport.offsetTop),
      );
      const keyboardInset = textIsFocused && obscuredHeight > 80 ? obscuredHeight : 0;
      root.style.setProperty("--keyboard-inset", `${keyboardInset}px`);
      root.classList.toggle("keyboard-open", keyboardInset > 0);
      if (keyboardInset > 0) {
        queueFocusedTextBlockVisibility();
      }
    };
    const handleFocusChange = () => window.requestAnimationFrame(updateKeyboardInset);

    updateKeyboardInset();
    viewport?.addEventListener("resize", updateKeyboardInset);
    viewport?.addEventListener("scroll", updateKeyboardInset);
    window.addEventListener("focusin", handleFocusChange);
    window.addEventListener("focusout", handleFocusChange);

    return () => {
      viewport?.removeEventListener("resize", updateKeyboardInset);
      viewport?.removeEventListener("scroll", updateKeyboardInset);
      window.removeEventListener("focusin", handleFocusChange);
      window.removeEventListener("focusout", handleFocusChange);
      if (visibilityFrame !== null) {
        window.cancelAnimationFrame(visibilityFrame);
      }
      root.style.removeProperty("--keyboard-inset");
      root.classList.remove("keyboard-open");
    };
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setBlocks(JSON.parse(saved) as StripBlock[]);
    } catch {
      // A broken or oversized local draft should never block the editor.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
    } catch {
      setNotice("This draft is too large to save on this device.");
    }
  }, [blocks, loaded]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!pendingDeleteId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelDeleteButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingDeleteId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pendingDeleteId]);

  const revealAddedBlock = (id: string, focusText = false) => {
    window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(
        `.strip-block[data-block-id="${id}"]`,
      );
      if (!element) return;
      if (focusText) {
        element.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
      }
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const enterTextEditing = (id: string, caretOffset?: number) => {
    flushSync(() => {
      setSelectedBlockId(id);
      setActiveTextTool(null);
      setEditingTextBlockId(id);
    });

    const element = document.querySelector<HTMLElement>(
      `.strip-block[data-block-id="${id}"]`,
    );
    const textarea = element?.querySelector<HTMLTextAreaElement>("textarea");
    textarea?.focus({ preventScroll: true });
    if (textarea && caretOffset !== undefined) {
      textarea.setSelectionRange(caretOffset, caretOffset);
    }
  };

  const addText = () => {
    const id = makeId();
    setBlocks((current) => {
      const selectedIndex = current.findIndex((block) => block.id === selectedBlockId);
      const insertionIndex = selectedIndex >= 0 ? selectedIndex + 1 : current.length;
      const inheritedStyle = nearestTextBlock(current, insertionIndex);
      const next = [...current];
      next.splice(insertionIndex, 0, {
        id,
        type: "text",
        content: "",
        backgroundColor: inheritedStyle?.backgroundColor ?? DEFAULT_BACKGROUND,
        textColor: inheritedStyle?.textColor ?? DEFAULT_TEXT,
        fontStyle: inheritedStyle?.fontStyle ?? "sans",
        fontSize: inheritedStyle?.fontSize ?? DEFAULT_FONT_SIZE,
        editedAt: Date.now(),
      });
      return next;
    });
    setSelectedBlockId(id);
    setEditingTextBlockId(null);
    setActiveTextTool(null);
    revealAddedBlock(id);
  };

  const addImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const id = makeId();
      setBlocks((current) => {
        const next = [...current];
        const selectedIndex = current.findIndex((block) => block.id === selectedBlockId);
        next.splice(selectedIndex >= 0 ? selectedIndex + 1 : next.length, 0, {
          id,
          type: "image",
          src: reader.result as string,
          alt: file.name.replace(/\.[^/.]+$/, ""),
        });
        return next;
      });
      setSelectedBlockId(id);
      setEditingTextBlockId(null);
      setActiveTextTool(null);
      revealAddedBlock(id);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const addVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const id = makeId();
      setBlocks((current) => {
        const next = [...current];
        const selectedIndex = current.findIndex((block) => block.id === selectedBlockId);
        next.splice(selectedIndex >= 0 ? selectedIndex + 1 : next.length, 0, {
          id,
          type: "video",
          src: reader.result as string,
          alt: file.name.replace(/\.[^/.]+$/, ""),
        });
        return next;
      });
      setSelectedBlockId(id);
      setEditingTextBlockId(null);
      setActiveTextTool(null);
      revealAddedBlock(id);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const updateText = (id: string, content: string) => {
    setBlocks((current) =>
      current.map((block) =>
        block.id === id && block.type === "text"
          ? { ...block, content, editedAt: Date.now() }
          : block,
      ),
    );
  };

  const updateTextStyle = (id: string, change: Partial<TextBlock>) => {
    setBlocks((current) =>
      current.map((block) =>
        block.id === id && block.type === "text"
          ? { ...block, ...change, editedAt: Date.now() }
          : block,
      ),
    );
  };

  const removeBlock = (id: string) => {
    setBlocks((current) => current.filter((block) => block.id !== id));
    setSelectedBlockId((current) => (current === id ? null : current));
    setEditingTextBlockId((current) => (current === id ? null : current));
    setActiveTextTool(null);
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    setBlocks((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const hasContent = blocks.some(
    (block) => block.type !== "text" || block.content.trim().length > 0,
  );
  const selectedBlockIndex = blocks.findIndex((block) => block.id === selectedBlockId);
  const selectedBlock = selectedBlockIndex >= 0 ? blocks[selectedBlockIndex] : undefined;
  const pendingDeleteBlock = blocks.find((block) => block.id === pendingDeleteId);

  const publish = () => {
    if (!hasContent) {
      setNotice("Add something before you strip.");
      return;
    }
    setView("published");
    setEditingTextBlockId(null);
    setActiveTextTool(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Link copied.");
    } catch {
      setNotice("Copy the address from your browser.");
    }
  };

  const renderStrip = (isEditing: boolean) => (
    <div className="strip-canvas">
      {blocks.length === 0 && isEditing ? (
        <div className="empty-strip">
          <p>Your Strip starts here.</p>
          <span>Add one block at a time.</span>
        </div>
      ) : null}

      {blocks.map((block, index) => {
        if (block.type === "text") {
          if (!isEditing && !block.content.trim()) return null;
          const textIsBeingEdited = isEditing && editingTextBlockId === block.id;
          return (
            <section
              className={`strip-block text-block ${isEditing ? "is-editing" : ""} ${
                isEditing && selectedBlockId === block.id ? "is-selected" : ""
              }`}
              data-block-id={block.id}
              key={block.id}
              onClick={(event) => {
                if (!isEditing || textIsBeingEdited) return;
                if (selectedBlockId === block.id) {
                  const caretOffset = caretOffsetAtPoint(
                    event.currentTarget,
                    event.clientX,
                    event.clientY,
                    block.content.length,
                  );
                  enterTextEditing(block.id, caretOffset);
                  return;
                }
                setSelectedBlockId(block.id);
                setActiveTextTool(null);
              }}
              style={{
                backgroundColor: block.backgroundColor ?? DEFAULT_BACKGROUND,
                color: block.textColor ?? DEFAULT_TEXT,
                fontFamily: FONT_STACKS[block.fontStyle ?? "sans"],
              }}
            >
              {textIsBeingEdited ? (
                <textarea
                  data-block-id={block.id}
                  ref={(element) => {
                    if (!element) return;
                    element.style.height = "0px";
                    element.style.height = `${element.scrollHeight}px`;
                  }}
                  value={block.content}
                  style={{ fontSize: `${block.fontSize ?? DEFAULT_FONT_SIZE}px` }}
                  onChange={(event) => updateText(block.id, event.target.value)}
                  onFocus={() => {
                    setSelectedBlockId(block.id);
                    window.requestAnimationFrame(() => keepFocusedTextBlockVisible("auto"));
                  }}
                  onBlur={() => {
                    window.setTimeout(() => {
                      setEditingTextBlockId((current) =>
                        current === block.id ? null : current,
                      );
                    }, 180);
                  }}
                  onInput={(event) => {
                    const target = event.currentTarget;
                    target.style.height = "0px";
                    target.style.height = `${target.scrollHeight}px`;
                    window.requestAnimationFrame(() => keepFocusedTextBlockVisible("auto"));
                  }}
                  placeholder="tap me to write"
                  aria-label={`Text block ${index + 1}`}
                  rows={1}
                />
              ) : (
                <p
                  className={isEditing && !block.content ? "is-placeholder" : undefined}
                  style={{ fontSize: `${block.fontSize ?? DEFAULT_FONT_SIZE}px` }}
                >
                  {block.content || (isEditing ? "tap me to write" : "")}
                </p>
              )}
            </section>
          );
        }

        if (block.type === "image") {
          return (
            <figure
              className={`strip-block image-block ${isEditing ? "is-editing" : ""} ${
                isEditing && selectedBlockId === block.id ? "is-selected" : ""
              }`}
              data-block-id={block.id}
              key={block.id}
              onClick={() => {
                if (!isEditing) return;
                setSelectedBlockId(block.id);
                setEditingTextBlockId(null);
                setActiveTextTool(null);
              }}
            >
              {/* A Strip image is intentionally edge-to-edge. */}
              <img src={block.src} alt={block.alt} />
            </figure>
          );
        }

        return (
          <StripVideoBlock
            key={block.id}
            block={block}
            isEditing={isEditing}
            isSelected={selectedBlockId === block.id}
            onSelect={() => {
              if (!isEditing) return;
              setSelectedBlockId(block.id);
              setEditingTextBlockId(null);
              setActiveTextTool(null);
            }}
          />
        );
      })}
    </div>
  );

  if (view === "preview" || view === "published") {
    const isPublished = view === "published";
    return (
      <main className={`app-shell reader-mode ${isPublished ? "published-mode" : "preview-mode"}`}>
        <div
          className="top-safe-area-anchor"
          style={{ backgroundColor: topSafeAreaColor }}
          aria-hidden="true"
        />
        <div className="bottom-safe-area-anchor" aria-hidden="true" />
        {isPublished ? (
          <header className="topbar reader-topbar">
            <button className="text-action" type="button" onClick={() => setView("edit")}>
              Edit
            </button>
            <span className="wordmark">STRIP</span>
            <button className="text-action" type="button" onClick={copyLink}>
              Share
            </button>
          </header>
        ) : null}

        <article className="published-strip">
          {isPublished ? (
            <header className="strip-byline">
              <div className="avatar" aria-hidden="true">
                A
              </div>
              <div>
                <strong>Antonio</strong>
                <span>just stripped</span>
              </div>
            </header>
          ) : null}
          {renderStrip(false)}
          {isPublished ? (
            <footer className="reader-footer">
              <p>Get Antonio&apos;s next Strip.</p>
              <button type="button">Subscribe</button>
              <span>Make your own Strip</span>
            </footer>
          ) : null}
        </article>
        {!isPublished ? (
          <footer className="composer-dock preview-dock">
            <button
              className="dock-icon-button"
              type="button"
              onClick={() => setView("edit")}
              aria-label="Return to editing"
            >
              <Pencil className="dock-glyph" aria-hidden="true" />
            </button>
            <span className="dock-divider" aria-hidden="true" />
            <button
              className="dock-icon-button publish-icon-button publish-strip-button"
              type="button"
              onClick={publish}
              aria-label="Publish Strip"
            >
              Publish
            </button>
          </footer>
        ) : null}
        {notice ? <div className="notice">{notice}</div> : null}
      </main>
    );
  }

  return (
    <main
      className={`app-shell editor-mode ${selectedBlockIndex >= 0 ? "has-block-toolbar" : ""} ${
        editingTextBlockId ? "is-typing" : ""
      }`}
    >
      <div
        className="top-safe-area-anchor"
        style={{ backgroundColor: topSafeAreaColor }}
        aria-hidden="true"
      />
      <div className="bottom-safe-area-anchor" aria-hidden="true" />
      <div className="editor-canvas">{renderStrip(true)}</div>

      {selectedBlockIndex >= 0 ? (
        <BlockControls
          index={selectedBlockIndex}
          count={blocks.length}
          onMove={(direction) => moveBlock(selectedBlockIndex, direction)}
          onRemove={() => setPendingDeleteId(blocks[selectedBlockIndex].id)}
          onTextTool={
            selectedBlock?.type === "text"
              ? (tool) => {
                  setEditingTextBlockId(null);
                  setLastTextTool(tool);
                  setActiveTextTool(tool);
                }
              : undefined
          }
          activeTextTool={activeTextTool}
        />
      ) : null}

      {selectedBlock?.type === "text" ? (
        <TextStyleSelector
          block={selectedBlock}
          tool={activeTextTool ?? lastTextTool}
          visible={activeTextTool !== null}
          onChange={(change) => updateTextStyle(selectedBlock.id, change)}
          onBack={() => setActiveTextTool(null)}
        />
      ) : null}

      <footer className={`composer-dock main-composer-dock ${activeTextTool ? "is-shifted" : ""}`}>
        <button className="dock-icon-button" type="button" onClick={addText} aria-label="Add text">
          <Type className="dock-glyph" aria-hidden="true" />
        </button>
        <button
          className="dock-icon-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Add photo"
        >
          <ImagePlus className="dock-glyph" aria-hidden="true" />
        </button>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={addImage}
          aria-label="Choose a photo"
        />
        <button
          className="dock-icon-button"
          type="button"
          onClick={() => videoInputRef.current?.click()}
          aria-label="Add video"
        >
          <Clapperboard className="dock-glyph" aria-hidden="true" />
        </button>
        <input
          ref={videoInputRef}
          className="visually-hidden"
          type="file"
          accept="video/*"
          onChange={addVideo}
          aria-label="Choose a video"
        />
        <span className="dock-divider" aria-hidden="true" />
        <button
          className="dock-icon-button"
          type="button"
          aria-label="Preview Strip"
          onClick={() => {
            if (!hasContent) {
              setNotice("Add something to preview.");
              return;
            }
            setActiveTextTool(null);
            setEditingTextBlockId(null);
            setView("preview");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <Eye className="dock-glyph" aria-hidden="true" />
        </button>
        <button
          className="dock-icon-button publish-icon-button publish-strip-button"
          type="button"
          onClick={publish}
          disabled={!hasContent}
          aria-label="Publish Strip"
        >
          Publish
        </button>
      </footer>
      {pendingDeleteBlock ? (
        <div className="modal-backdrop" onClick={() => setPendingDeleteId(null)}>
          <section
            className="delete-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            aria-describedby="delete-modal-description"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-modal-title">
              Delete this {pendingDeleteBlock.type === "text"
                ? "text"
                : pendingDeleteBlock.type === "image"
                  ? "photo"
                  : "video"} block?
            </h2>
            <p id="delete-modal-description">This can&apos;t be undone.</p>
            <div className="delete-modal-actions">
              <button
                ref={cancelDeleteButtonRef}
                className="cancel-delete-button"
                type="button"
                onClick={() => setPendingDeleteId(null)}
              >
                Cancel
              </button>
              <button
                className="confirm-delete-button"
                type="button"
                onClick={() => {
                  removeBlock(pendingDeleteBlock.id);
                  setPendingDeleteId(null);
                }}
              >
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {notice ? <div className="notice">{notice}</div> : null}
    </main>
  );
}
