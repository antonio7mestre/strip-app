"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Baseline,
  CaseUpper,
  Check,
  Clapperboard,
  Eye,
  Files,
  House,
  ImagePlus,
  Minus,
  PaintBucket,
  Pencil,
  Pipette,
  Plus,
  Sticker,
  Trash2,
  TriangleAlert,
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

type StickerBlock = {
  id: string;
  type: "sticker";
  src: string;
  alt: string;
  x: number;
  y: number;
  width: number;
};

type StripBlock = TextBlock | ImageBlock | VideoBlock | StickerBlock;
type View =
  | "library"
  | "drafts"
  | "edit"
  | "preview"
  | "publish-setup"
  | "title-setup"
  | "published";
type FontStyle = "sans" | "serif" | "mono" | "rounded" | "condensed" | "display" | "hand";
type TextTool = "font" | "background" | "color";
type CoverColorShape = "portrait" | "square" | "landscape";
type PublishedCover =
  | { kind: "image"; src: string; alt: string }
  | { kind: "color"; color: string; shape: CoverColorShape };
type PublishedStripSummary = {
  id: string;
  title: string;
  cover: PublishedCover;
  publishedAt: number;
};
type PublishedStripDetail = {
  id: string;
  title: string;
  publishedAt: number;
  blocks: StripBlock[];
};
type DraftStripSummary = {
  id: string;
  title: string;
  cover: PublishedCover;
  createdAt: number;
  updatedAt: number;
};
type DraftStripDetail = {
  id: string;
  title: string;
  blocks: StripBlock[];
  createdAt: number;
  updatedAt: number;
};
type AppRoute =
  | { kind: "library" }
  | { kind: "drafts" }
  | { kind: "edit"; id: string }
  | { kind: "published"; id: string };
type CoverChoice =
  | { key: string; kind: "image"; src: string; alt: string }
  | { key: string; kind: "color"; color: string }
  | { key: string; kind: "add" }
  | { key: string; kind: "pick-color" };
type PageTransitionDirection = "forward" | "backward";
type LegacyPageTransitionSnapshot = {
  id: string;
  markup: string;
  scrollTop: number;
  minHeight: number;
  direction: PageTransitionDirection;
};
type DockTransitionSnapshot = {
  id: string;
  markup: string;
};

const STORAGE_KEY = "strip-draft-v1";
const OWNER_STORAGE_KEY = "strip-owner-v1";
const DEFAULT_BACKGROUND = "#000000";
const DEFAULT_TEXT = "#FFFFFF";
const DEFAULT_FONT_SIZE = 18;
const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 72;
const FONT_SIZE_STEP = 2;
const PAGE_TRANSITION_DURATION_MS = 380;
const STANDARD_PAGE_TRANSITION_DURATION_MS = 180;
const DOCK_TRANSITION_DURATION_MS = 300;

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
  { label: "Acid", value: "#8ACE00" },
  { label: "Hot pink", value: "#FF4FA3" },
  { label: "Chrome", value: "#D9D9D9" },
  { label: "Electric blue", value: "#3155FF" },
  { label: "Laser violet", value: "#7A2CFF" },
  { label: "Safety orange", value: "#FF4D00" },
];

type ColorOption = { label: string; value: string };

const TEXT_COLOR_PALETTES: Record<string, ColorOption[]> = {
  "#000000": [
    { label: "Optic white", value: "#FFFFFF" },
    { label: "Toxic lime", value: "#D7FF00" },
    { label: "Ice", value: "#A9E8FF" },
    { label: "Bubblegum", value: "#FF64C4" },
    { label: "Liquid silver", value: "#C9C9C9" },
    { label: "Lipstick", value: "#FF304F" },
  ],
  "#8ACE00": [
    { label: "Ink", value: "#050505" },
    { label: "Ultraviolet", value: "#5C00FF" },
    { label: "Hot pink", value: "#FF1493" },
    { label: "Bone", value: "#FFF4DE" },
    { label: "Cobalt", value: "#003CFF" },
    { label: "Aubergine", value: "#28002F" },
  ],
  "#FF4FA3": [
    { label: "Patent black", value: "#050505" },
    { label: "Ice", value: "#DDF7FF" },
    { label: "Acid", value: "#D7FF00" },
    { label: "Ox blood", value: "#4A0018" },
    { label: "Powder", value: "#FFD8EA" },
    { label: "Electric blue", value: "#123EFF" },
  ],
  "#D9D9D9": [
    { label: "Ink", value: "#050505" },
    { label: "Cobalt", value: "#1640FF" },
    { label: "Signal red", value: "#F2183D" },
    { label: "Ultraviolet", value: "#6B16FF" },
    { label: "Hot pink", value: "#FF2FA7" },
    { label: "Venom", value: "#3FA600" },
  ],
  "#3155FF": [
    { label: "Optic white", value: "#FFFFFF" },
    { label: "Acid", value: "#D7FF00" },
    { label: "Hot pink", value: "#FF6BC7" },
    { label: "Chrome", value: "#D9D9D9" },
    { label: "Pale violet", value: "#DFC8FF" },
    { label: "Ink", value: "#050505" },
  ],
  "#7A2CFF": [
    { label: "Optic white", value: "#FFFFFF" },
    { label: "Acid", value: "#D7FF00" },
    { label: "Candy", value: "#FF7CCB" },
    { label: "Ice", value: "#BCEBFF" },
    { label: "Safety orange", value: "#FF5A00" },
    { label: "Ink", value: "#050505" },
  ],
  "#FF4D00": [
    { label: "Patent black", value: "#050505" },
    { label: "Vanilla", value: "#FFF0C7" },
    { label: "Cobalt", value: "#123DFF" },
    { label: "Hot pink", value: "#FF63C3" },
    { label: "Acid", value: "#CFFF00" },
    { label: "Wine", value: "#4D001E" },
  ],
};

function colorChannels(color: string) {
  const normalized = color.trim().replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("")
      : normalized;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return [0, 0, 0];
  return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16));
}

function textColorOptionsForBackground(background: string) {
  const normalized = background.trim().toUpperCase();
  if (TEXT_COLOR_PALETTES[normalized]) return TEXT_COLOR_PALETTES[normalized];

  const [red, green, blue] = colorChannels(normalized);
  const nearestBackground = BACKGROUND_COLORS.reduce((nearest, option) => {
    const [optionRed, optionGreen, optionBlue] = colorChannels(option.value);
    const distance =
      (red - optionRed) ** 2 +
      (green - optionGreen) ** 2 +
      (blue - optionBlue) ** 2;
    return distance < nearest.distance ? { value: option.value, distance } : nearest;
  }, { value: DEFAULT_BACKGROUND, distance: Number.POSITIVE_INFINITY });

  return TEXT_COLOR_PALETTES[nearestBackground.value.toUpperCase()];
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function routeFromPathname(pathname: string): AppRoute {
  const editMatch = /^\/edit\/([a-zA-Z0-9_-]{8,128})\/?$/.exec(pathname);
  if (editMatch) return { kind: "edit", id: editMatch[1] };
  const publishedMatch = /^\/strip\/([a-zA-Z0-9_-]{8,128})\/?$/.exec(pathname);
  if (publishedMatch) return { kind: "published", id: publishedMatch[1] };
  if (/^\/drafts\/?$/.test(pathname)) return { kind: "drafts" };
  return { kind: "library" };
}

function draftFallbackTitle(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function setBrowserPath(pathname: string, replace = false) {
  if (window.location.pathname === pathname) return;
  if (replace) {
    window.history.replaceState({}, "", pathname);
  } else {
    window.history.pushState({}, "", pathname);
  }
}

function isPureBlackCoverColor(color: string) {
  return ["#000", DEFAULT_BACKGROUND].includes(color.trim().toUpperCase());
}

function isBlackCoverColor(color: string) {
  return isPureBlackCoverColor(color) || color.trim().toUpperCase() === "#050505";
}

function coverColorDimensions(shape: CoverColorShape, viewportWidth: number) {
  if (shape === "portrait") {
    return {
      width: Math.min(Math.max(0, viewportWidth - 124), 340),
      height: Math.min(Math.max(0, (viewportWidth - 124) * 1.25), 425),
    };
  }
  if (shape === "landscape") {
    return {
      width: Math.min(Math.max(0, viewportWidth - 88), 460),
      height: Math.min(Math.max(0, (viewportWidth - 88) * (2 / 3)), 306.667),
    };
  }
  const size = Math.min(Math.max(0, viewportWidth - 88), 400);
  return { width: size, height: size };
}

function coverImageDimensions(
  aspectRatio: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const maxWidth = Math.min(Math.max(0, viewportWidth - 88), 420);
  const maxHeight = Math.min(Math.max(0, viewportHeight * 0.54), 520);
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return { width: maxWidth, height: maxHeight };
  }
  let width = maxWidth;
  let height = width / aspectRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }
  return { width, height };
}

function randomFallbackCoverColors(seed: string) {
  const colors = BACKGROUND_COLORS.filter(
    (option) => !isBlackCoverColor(option.value),
  ).map((option) => option.value.toUpperCase());
  let state = Array.from(seed).reduce(
    (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619),
    2166136261,
  ) >>> 0;

  const nextRandom = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  for (let index = colors.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    [colors[index], colors[swapIndex]] = [colors[swapIndex], colors[index]];
  }

  return colors.slice(0, 3);
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
  const lightness = (maximum + minimum) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { hue, saturation: saturation * 100, lightness: lightness * 100 };
}

type SwatchStyle = CSSProperties & { "--swatch-foreground": string };
type CoverCardStyle = CSSProperties & {
  "--cover-dim": number;
};
type BlockControlsStyle = CSSProperties & {
  "--block-controls-surface"?: string;
  "--block-controls-foreground"?: string;
};

function contrastColor(color: string) {
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
  return luminance > 0.179 ? "#000000" : "#FFFFFF";
}

function swatchStyle(color: string): SwatchStyle {
  const foreground = contrastColor(color);
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
  surfaceColor,
}: {
  index: number;
  count: number;
  onMove?: (direction: -1 | 1) => void;
  onRemove: () => void;
  onTextTool?: (tool: TextTool) => void;
  activeTextTool?: TextTool | null;
  surfaceColor?: string;
}) {
  const style: BlockControlsStyle | undefined = surfaceColor
    ? {
        "--block-controls-surface": surfaceColor,
        "--block-controls-foreground": contrastColor(surfaceColor),
      }
    : undefined;

  return (
    <div
      className={`block-controls ${
        onTextTool ? "is-text-tray" : onMove ? "is-media-tray" : "is-single-action-tray"
      }`}
      style={style}
      aria-label="Block controls"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
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
      {onMove ? (
        <>
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
        </>
      ) : null}
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
  backgroundOptions = BACKGROUND_COLORS,
  doneDisabled = false,
  startInGradientMode = false,
}: {
  block: TextBlock;
  tool: TextTool;
  visible: boolean;
  onChange: (change: Partial<TextBlock>) => void;
  onBack: () => void;
  backgroundOptions?: typeof BACKGROUND_COLORS;
  doneDisabled?: boolean;
  startInGradientMode?: boolean;
}) {
  const background = block.backgroundColor ?? DEFAULT_BACKGROUND;
  const textColor = block.textColor ?? DEFAULT_TEXT;
  const textColorOptions = textColorOptionsForBackground(background);
  const fontStyle = block.fontStyle ?? "sans";
  const fontSize = block.fontSize ?? DEFAULT_FONT_SIZE;
  const selectorScrollRef = useRef<HTMLDivElement>(null);
  const [gradientMode, setGradientMode] = useState<TextTool | null>(null);
  const backgroundIsCustom = !backgroundOptions.some(
    (option) => option.value.toUpperCase() === background.toUpperCase(),
  );
  const textIsCustom = !textColorOptions.some(
    (option) => option.value.toUpperCase() === textColor.toUpperCase(),
  );
  const activeColor = tool === "background" ? background : textColor;
  const decodedGradientPosition = hexToHsl(activeColor);
  const [gradientHue, setGradientHue] = useState(decodedGradientPosition.hue);
  const gradientPosition = {
    ...decodedGradientPosition,
    hue:
      decodedGradientPosition.saturation > 0
        ? decodedGradientPosition.hue
        : gradientHue,
  };

  useEffect(() => {
    setGradientMode(startInGradientMode && tool !== "font" ? tool : null);
  }, [startInGradientMode, tool, visible]);

  useEffect(() => {
    if (!visible) return;
    const frame = window.requestAnimationFrame(() => {
      if (selectorScrollRef.current) selectorScrollRef.current.scrollLeft = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tool, visible]);

  useEffect(() => {
    if (decodedGradientPosition.saturation > 0) {
      setGradientHue(decodedGradientPosition.hue);
    }
  }, [activeColor, decodedGradientPosition.hue, decodedGradientPosition.saturation]);

  const applyGradientPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const vertical = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    const nextHue = horizontal * 360;
    setGradientHue(nextHue);
    const nextColor = hslToHex(nextHue, 100, (1 - vertical) * 100);
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
    setGradientHue(nextHue);
    const nextColor = hslToHex(nextHue, 100, nextLightness);
    onChange(tool === "background" ? { backgroundColor: nextColor } : { textColor: nextColor });
  };

  return (
    <footer
      className={`composer-dock selector-dock ${
        gradientMode === tool ? "is-gradient-picker" : ""
      } ${visible ? "is-visible" : ""}`}
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
        ref={selectorScrollRef}
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
            />
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
          ? backgroundOptions.map((option) => {
              const selected = background.toUpperCase() === option.value.toUpperCase();
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`selector-option color-selector-option ${selected ? "is-selected" : ""}`}
                  style={swatchStyle(option.value)}
                  onClick={() =>
                    onChange({
                      backgroundColor: option.value,
                      ...(block.content.trim().length === 0
                        ? { textColor: contrastColor(option.value) }
                        : {}),
                    })
                  }
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
          ? textColorOptions.map((option) => {
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
        <button
          className="dock-icon-button selector-back-button"
          type="button"
          onClick={onBack}
          disabled={doneDisabled}
          tabIndex={visible ? 0 : -1}
          aria-label="Done choosing styles"
        >
          <Check className="dock-glyph" aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}

function BlockSelectionTab() {
  return <span className="block-selection-tab" aria-hidden="true" />;
}

let safariHapticSwitch: HTMLInputElement | null = null;

function triggerSelectionHaptic() {
  if (navigator.vibrate) {
    navigator.vibrate(10);
    return;
  }

  if (!safariHapticSwitch) {
    safariHapticSwitch = document.createElement("input");
    safariHapticSwitch.type = "checkbox";
    safariHapticSwitch.setAttribute("switch", "");
    safariHapticSwitch.tabIndex = -1;
    safariHapticSwitch.setAttribute("aria-hidden", "true");
    safariHapticSwitch.className = "selection-haptic-proxy";
    document.body.append(safariHapticSwitch);
  }

  safariHapticSwitch.click();
}

function StripVideoBlock({
  block,
  isEditing,
  isSelected,
  onSelect,
  controls,
}: {
  block: VideoBlock;
  isEditing: boolean;
  isSelected: boolean;
  onSelect: () => void;
  controls?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tapGestureRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
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
      onPointerDown={(event) => {
        tapGestureRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: false,
        };
      }}
      onPointerMove={(event) => {
        const gesture = tapGestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) {
          gesture.moved = true;
        }
      }}
      onPointerCancel={() => {
        if (tapGestureRef.current) tapGestureRef.current.moved = true;
      }}
      onClick={() => {
        const gesture = tapGestureRef.current;
        tapGestureRef.current = null;
        if (gesture?.moved) return;
        onSelect();
      }}
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
      {isEditing && isSelected ? <BlockSelectionTab /> : null}
      {controls}
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

function StripStickerBlock({
  block,
  isEditing,
  isSelected,
  isOverlappingSelection,
  onSelect,
  onMove,
  controls,
}: {
  block: StickerBlock;
  isEditing: boolean;
  isSelected: boolean;
  isOverlappingSelection: boolean;
  onSelect: () => void;
  onMove: (position: Pick<StickerBlock, "x" | "y">) => void;
  controls?: ReactNode;
}) {
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    canvasWidth: number;
    canvasHeight: number;
  } | null>(null);

  const stopDragging = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  return (
    <figure
      className={`strip-block sticker-block ${isEditing ? "is-editing" : ""} ${
        isEditing && isSelected ? "is-selected" : ""
      } ${isEditing && isOverlappingSelection ? "is-overlapping-selection" : ""}`}
      data-block-id={block.id}
      style={{
        left: `${block.x}%`,
        top: `${block.y}px`,
        width: `${block.width}%`,
      }}
      onPointerDown={(event) => {
        if (!isEditing) return;
        event.preventDefault();
        event.stopPropagation();
        onSelect();
        const canvas = event.currentTarget.closest<HTMLElement>(".strip-canvas");
        if (!canvas) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          x: block.x,
          y: block.y,
          canvasWidth: Math.max(1, canvas.getBoundingClientRect().width),
          canvasHeight: Math.max(window.innerHeight, canvas.scrollHeight),
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        const halfWidth = block.width / 2;
        onMove({
          x: Math.min(
            100 - halfWidth,
            Math.max(
              halfWidth,
              drag.x + ((event.clientX - drag.clientX) / drag.canvasWidth) * 100,
            ),
          ),
          y: Math.min(
            Math.max(36, drag.canvasHeight - 36),
            Math.max(36, drag.y + event.clientY - drag.clientY),
          ),
        });
      }}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={isEditing ? "Sticker. Drag to reposition." : block.alt || "Sticker"}
    >
      {isEditing && isSelected ? <BlockSelectionTab /> : null}
      <img src={block.src} alt={block.alt} draggable={false} />
      {controls}
    </figure>
  );
}

export default function Home() {
  const [blocks, setBlocks] = useState<StripBlock[]>([]);
  const [publishedStrips, setPublishedStrips] = useState<PublishedStripSummary[]>([]);
  const [draftStrips, setDraftStrips] = useState<DraftStripSummary[]>([]);
  const [libraryOwnerId, setLibraryOwnerId] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [openingStripId, setOpeningStripId] = useState<string | null>(null);
  const [openingDraftId, setOpeningDraftId] = useState<string | null>(null);
  const [openedPublishedStrip, setOpenedPublishedStrip] =
    useState<PublishedStripDetail | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [currentDraftCreatedAt, setCurrentDraftCreatedAt] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [view, setView] = useState<View>("library");
  const [legacyPageTransition, setLegacyPageTransition] =
    useState<LegacyPageTransitionSnapshot | null>(null);
  const [dockTransition, setDockTransition] =
    useState<DockTransitionSnapshot | null>(null);
  const [dockTransitionStarted, setDockTransitionStarted] = useState(false);
  const [editorDockEntering, setEditorDockEntering] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editingTextBlockId, setEditingTextBlockId] = useState<string | null>(null);
  const [activeTextTool, setActiveTextTool] = useState<TextTool | null>(null);
  const [lastTextTool, setLastTextTool] = useState<TextTool>("font");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [stripTitle, setStripTitle] = useState("");
  const [selectedCover, setSelectedCover] = useState("");
  const [activeCoverKey, setActiveCoverKey] = useState("");
  const [coverStackStarted, setCoverStackStarted] = useState(false);
  const [coverDragProgress, setCoverDragProgress] = useState(0);
  const [coverIsDragging, setCoverIsDragging] = useState(false);
  const [coverStageHeight, setCoverStageHeight] = useState(0);
  const [coverStageWidth, setCoverStageWidth] = useState(0);
  const [coverCenterPercent, setCoverCenterPercent] = useState(42);
  const [coverCardHeights, setCoverCardHeights] = useState<Record<string, number>>({});
  const [coverCardWidths, setCoverCardWidths] = useState<Record<string, number>>({});
  const [coverImageAspectRatios, setCoverImageAspectRatios] = useState<
    Record<string, number>
  >({});
  const [customCoverSrc, setCustomCoverSrc] = useState<string | null>(null);
  const [customCoverColors, setCustomCoverColors] = useState<string[]>([]);
  const [coverColorShape, setCoverColorShape] = useState<CoverColorShape>("square");
  const [coverColorPickerOpen, setCoverColorPickerOpen] = useState(false);
  const [pendingCoverColor, setPendingCoverColor] = useState("#2147D9");
  const [blackCoverWarningVisible, setBlackCoverWarningVisible] = useState(false);
  const [publishSetupReturnView, setPublishSetupReturnView] = useState<"edit" | "preview">(
    "edit",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverStageRef = useRef<HTMLDivElement>(null);
  const coverInstructionRef = useRef<HTMLParagraphElement>(null);
  const coverSwipeStartYRef = useRef<number | null>(null);
  const coverDragProgressRef = useRef(0);
  const coverSwipeSuppressClickRef = useRef(false);
  const pageTransitionInFlightRef = useRef(false);
  const leadingImageScrollLockRef = useRef(0);
  const dockTransitionTimerRef = useRef<number | null>(null);
  const dockTransitionFrameRef = useRef<number | null>(null);
  const editorDockEntryTimerRef = useRef<number | null>(null);
  const publishFlowStartScrollRef = useRef(0);
  const legacyDraftBlocksRef = useRef<StripBlock[] | null>(null);
  const initialRouteHandledRef = useRef(false);
  const draftSaveTimerRef = useRef<number | null>(null);
  const draftSaveSequenceRef = useRef(0);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const blockTapGestureRef = useRef<{
    blockId: string;
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);

  const beginBlockTapGesture = (
    event: ReactPointerEvent<HTMLElement>,
    blockId: string,
  ) => {
    blockTapGestureRef.current = {
      blockId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  };

  const trackBlockTapGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = blockTapGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) {
      gesture.moved = true;
    }
  };

  const cancelBlockTapGesture = () => {
    if (blockTapGestureRef.current) blockTapGestureRef.current.moved = true;
  };

  const completeBlockTapGesture = (blockId: string) => {
    const gesture = blockTapGestureRef.current;
    blockTapGestureRef.current = null;
    return !gesture || (gesture.blockId === blockId && !gesture.moved);
  };
  const firstVisibleBlock =
    view === "published" && openedPublishedStrip
      ? openedPublishedStrip.blocks.find((block) => block.type !== "sticker")
      : blocks.find((block) => block.type !== "sticker");
  const topSafeAreaColor =
    view === "library" ||
    view === "drafts" ||
    view === "publish-setup" ||
    view === "title-setup"
      ? DEFAULT_BACKGROUND
      : firstVisibleBlock?.type === "text"
      ? (firstVisibleBlock.backgroundColor ?? DEFAULT_BACKGROUND)
      : DEFAULT_BACKGROUND;
  const hasLeadingImage = firstVisibleBlock?.type === "image";

  useLayoutEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    let followupFrame = 0;
    let releaseFrame = 0;
    let settleTimer = 0;
    let applyingLock = false;
    let touchIsActive = false;
    let lastTouchY = 0;
    let mutationObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const setScrollTop = (top: number, behavior: ScrollBehavior = "auto") => {
      applyingLock = true;
      window.scrollTo({ top, behavior });
      if (behavior === "auto") {
        document.documentElement.scrollTop = top;
        document.body.scrollTop = top;
      }
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        applyingLock = false;
      }, behavior === "smooth" ? 320 : 32);
    };

    const lockFixedControlsDuringPull = () => {
      const pullDistance = Math.max(0, -window.scrollY);
      root.style.setProperty(
        "--fixed-controls-pull-counter",
        `${-pullDistance}px`,
      );
    };

    const settleLockedTop = () => {
      const offset = leadingImageScrollLockRef.current;
      if (!touchIsActive && offset > 0 && window.scrollY < offset) {
        setScrollTop(offset, "smooth");
      }
    };

    const editorBottomLock = () => {
      if (view !== "edit") return null;
      const stripCanvas = document.querySelector<HTMLElement>(
        ".editor-mode .strip-canvas",
      );
      if (!stripCanvas) return null;
      const scrollEnd = Math.max(
        0,
        (document.scrollingElement?.scrollHeight ?? root.scrollHeight) -
          window.innerHeight,
      );
      const paintedBuffer =
        Number.parseFloat(
          window
            .getComputedStyle(stripCanvas)
            .getPropertyValue("--editor-bottom-pull-buffer"),
        ) || 0;
      return Math.max(
        leadingImageScrollLockRef.current,
        scrollEnd - paintedBuffer,
      );
    };

    const settleLockedBottom = () => {
      const offset = editorBottomLock();
      if (!touchIsActive && offset !== null && window.scrollY > offset) {
        setScrollTop(offset, "smooth");
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      touchIsActive = true;
      lastTouchY = event.touches[0]?.clientY ?? 0;
      applyingLock = false;
      window.clearTimeout(settleTimer);
      window.cancelAnimationFrame(releaseFrame);
      lockFixedControlsDuringPull();
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touchY = event.touches[0]?.clientY;
      if (touchY === undefined) return;
      const movingTowardBottom = touchY < lastTouchY;
      lastTouchY = touchY;
      if (!movingTowardBottom || view !== "edit") return;
      const scrollEnd = Math.max(
        0,
        (document.scrollingElement?.scrollHeight ?? root.scrollHeight) -
          window.innerHeight,
      );
      if (window.scrollY >= scrollEnd - 1) event.preventDefault();
    };

    const handleTouchRelease = () => {
      touchIsActive = false;
      lastTouchY = 0;
      lockFixedControlsDuringPull();
      window.cancelAnimationFrame(releaseFrame);
      releaseFrame = window.requestAnimationFrame(() => {
        settleLockedTop();
        settleLockedBottom();
      });
    };

    const handleTouchCancel = () => {
      touchIsActive = false;
      lastTouchY = 0;
      lockFixedControlsDuringPull();
      window.cancelAnimationFrame(releaseFrame);
      releaseFrame = window.requestAnimationFrame(() => {
        settleLockedTop();
        settleLockedBottom();
      });
    };

    const preserveLockedTopAfterLayout = () => {
      const offset = leadingImageScrollLockRef.current;
      if (!touchIsActive && !applyingLock && offset > 0 && window.scrollY < offset) {
        setScrollTop(offset);
      } else if (!touchIsActive && !applyingLock) {
        settleLockedBottom();
      }
    };

    const handleLockedTopScroll = () => {
      lockFixedControlsDuringPull();
      if (touchIsActive) return;
      if (applyingLock) return;
      settleLockedTop();
      settleLockedBottom();
    };

    const calculateLeadingImageLock = () => {
      let offset = 0;
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const stripIsVisible =
        view === "edit" || view === "preview" || view === "published";

      if (
        stripIsVisible &&
        hasLeadingImage &&
        isIOS &&
        window.screen.height / window.screen.width > 2
      ) {
        const probe = document.createElement("div");
        probe.style.cssText =
          "position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top)";
        document.body.appendChild(probe);
        const reportedSafeTop = Number.parseFloat(
          window.getComputedStyle(probe).paddingTop,
        );
        probe.remove();

        if (!Number.isFinite(reportedSafeTop) || reportedSafeTop < 1) {
          offset = Math.round(
            Math.min(62, Math.max(47, window.screen.width * 0.154)),
          );
        }
      }

      return offset;
    };

    const applyLeadingImageLock = () => {
      const previousOffset = leadingImageScrollLockRef.current;
      const offset = calculateLeadingImageLock();
      leadingImageScrollLockRef.current = offset;
      root.style.setProperty("--leading-image-scroll-lock", `${offset}px`);
      root.classList.toggle("leading-image-scroll-locked", offset > 0);

      if (offset > 0 && window.scrollY < offset) {
        setScrollTop(offset);
      } else if (offset === 0 && previousOffset > 0 && window.scrollY <= previousOffset) {
        setScrollTop(0);
      }
    };

    applyLeadingImageLock();
    lockFixedControlsDuringPull();
    frame = window.requestAnimationFrame(() => {
      applyLeadingImageLock();
      followupFrame = window.requestAnimationFrame(applyLeadingImageLock);
    });
    window.addEventListener("scroll", handleLockedTopScroll, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchRelease, { passive: true });
    window.addEventListener("touchcancel", handleTouchCancel, { passive: true });
    window.addEventListener("resize", applyLeadingImageLock);

    const stripCanvas = document.querySelector<HTMLElement>(".strip-canvas");
    if (stripCanvas) {
      mutationObserver = new MutationObserver(preserveLockedTopAfterLayout);
      mutationObserver.observe(stripCanvas, {
        childList: true,
        subtree: true,
      });

      resizeObserver = new ResizeObserver(preserveLockedTopAfterLayout);
      resizeObserver.observe(stripCanvas);
    }

    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(followupFrame);
      window.cancelAnimationFrame(releaseFrame);
      window.clearTimeout(settleTimer);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", handleLockedTopScroll);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchRelease);
      window.removeEventListener("touchcancel", handleTouchCancel);
      window.removeEventListener("resize", applyLeadingImageLock);
      root.classList.remove("leading-image-scroll-locked");
      root.style.removeProperty("--fixed-controls-pull-counter");
    };
  }, [hasLeadingImage, view]);

  useEffect(
    () => () => {
      if (dockTransitionTimerRef.current !== null) {
        window.clearTimeout(dockTransitionTimerRef.current);
      }
      if (dockTransitionFrameRef.current !== null) {
        window.cancelAnimationFrame(dockTransitionFrameRef.current);
      }
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
      if (editorDockEntryTimerRef.current !== null) {
        window.clearTimeout(editorDockEntryTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    document.querySelector<HTMLMetaElement>("#strip-theme-color")?.setAttribute(
      "content",
      topSafeAreaColor,
    );
    document.documentElement.style.setProperty("--top-safe-area-color", topSafeAreaColor);
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
      const textIsFocused =
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement instanceof HTMLInputElement &&
          document.activeElement.type === "text");
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
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          legacyDraftBlocksRef.current = parsed as StripBlock[];
        }
      }
      const savedOwnerId = window.localStorage.getItem(OWNER_STORAGE_KEY);
      const ownerId =
        savedOwnerId && /^[a-zA-Z0-9_-]{8,128}$/.test(savedOwnerId)
          ? savedOwnerId
          : makeId();
      window.localStorage.setItem(OWNER_STORAGE_KEY, ownerId);
      setLibraryOwnerId(ownerId);
    } catch {
      // Broken local data should never block the app.
      setLibraryOwnerId(makeId());
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!libraryOwnerId) return;
    const controller = new AbortController();
    setLibraryLoading(true);
    void fetch(`/api/strips?ownerId=${encodeURIComponent(libraryOwnerId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Library request failed");
        const data = (await response.json()) as {
          strips?: PublishedStripSummary[];
        };
        setPublishedStrips(Array.isArray(data.strips) ? data.strips : []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice("Couldn’t load your Strips. Try refreshing.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLibraryLoading(false);
      });
    return () => controller.abort();
  }, [libraryOwnerId]);

  useEffect(() => {
    if (!libraryOwnerId) return;
    const controller = new AbortController();
    setDraftsLoading(true);
    void fetch(`/api/drafts?ownerId=${encodeURIComponent(libraryOwnerId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Draft library request failed");
        const data = (await response.json()) as { drafts?: DraftStripSummary[] };
        setDraftStrips(Array.isArray(data.drafts) ? data.drafts : []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice("Couldn’t load your drafts. Try refreshing.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setDraftsLoading(false);
      });
    return () => controller.abort();
  }, [libraryOwnerId]);

  useEffect(() => {
    if (!loaded || !libraryOwnerId || !legacyDraftBlocksRef.current) return;
    const legacyBlocks = legacyDraftBlocksRef.current;
    legacyDraftBlocksRef.current = null;
    const id = makeId();
    const createdAt = Date.now();
    void fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerId: libraryOwnerId,
        id,
        title: "",
        blocks: legacyBlocks,
        createdAt,
        updatedAt: createdAt,
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Legacy draft migration failed");
        const data = (await response.json()) as { draft: DraftStripSummary };
        setDraftStrips((current) => [
          data.draft,
          ...current.filter((draft) => draft.id !== data.draft.id),
        ]);
        window.localStorage.removeItem(STORAGE_KEY);
      })
      .catch(() => {
        legacyDraftBlocksRef.current = legacyBlocks;
      });
  }, [libraryOwnerId, loaded]);

  useEffect(() => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    if (
      !loaded ||
      !libraryOwnerId ||
      !currentDraftId ||
      blocks.length === 0
    ) {
      return;
    }

    const sequence = ++draftSaveSequenceRef.current;
    const updatedAt = Date.now();
    const createdAt = currentDraftCreatedAt || updatedAt;
    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;
      void fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: libraryOwnerId,
          id: currentDraftId,
          title: stripTitle,
          blocks,
          createdAt,
          updatedAt,
        }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Draft save failed");
          const data = (await response.json()) as { draft: DraftStripSummary };
          setDraftStrips((current) => [
            data.draft,
            ...current.filter((draft) => draft.id !== data.draft.id),
          ]);
          window.localStorage.removeItem(STORAGE_KEY);
        })
        .catch(() => {
          if (sequence === draftSaveSequenceRef.current) {
            setNotice("Couldn’t save this draft yet.");
          }
        });
    }, 450);

    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [
    blocks,
    currentDraftCreatedAt,
    currentDraftId,
    libraryOwnerId,
    loaded,
    stripTitle,
  ]);

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
      const bounds = element.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const centeredTop =
        window.scrollY + bounds.top - Math.max(0, (viewportHeight - bounds.height) / 2);
      const targetTop = Math.max(leadingImageScrollLockRef.current, centeredTop);
      window.scrollTo({ top: targetTop, behavior: "smooth" });
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
      const backgroundColor = inheritedStyle?.backgroundColor ?? DEFAULT_BACKGROUND;
      const next = [...current];
      next.splice(insertionIndex, 0, {
        id,
        type: "text",
        content: "",
        backgroundColor,
        textColor: inheritedStyle?.textColor ?? contrastColor(backgroundColor),
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

  const addSticker = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const canvas = document.querySelector<HTMLElement>(".editor-mode .strip-canvas");
      const canvasBounds = canvas?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportOffsetTop = viewport?.offsetTop ?? 0;
      const canvasWidth = Math.max(1, canvasBounds?.width ?? window.innerWidth);
      const id = makeId();
      const y = Math.max(
        72,
        viewportOffsetTop + viewportHeight * 0.42 - (canvasBounds?.top ?? 0),
      );
      const width = Math.min(34, Math.max(24, (132 / canvasWidth) * 100));
      setBlocks((current) => [
        ...current,
        {
          id,
          type: "sticker",
          src: reader.result as string,
          alt: file.name.replace(/\.[^/.]+$/, ""),
          x: 50,
          y,
          width,
        },
      ]);
      setSelectedBlockId(id);
      setEditingTextBlockId(null);
      setActiveTextTool(null);
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
    const target = index + direction;
    const nextTopBlock =
      target === 0 ? blocks[index] : index === 0 ? blocks[target] : blocks[0];
    const textWillBecomeTop =
      blocks[0]?.type !== "text" && nextTopBlock?.type === "text";

    setBlocks((current) => {
      const next = [...current];
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

    if (textWillBecomeTop) {
      const root = document.documentElement;
      const releaseOffset = Math.max(
        leadingImageScrollLockRef.current,
        Math.ceil(window.scrollY),
        Math.round(Math.min(62, Math.max(47, window.screen.width * 0.154))),
      );

      root.style.setProperty("--text-first-scroll-release", `${releaseOffset}px`);
      root.classList.add("is-releasing-leading-image-scroll");

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          let attempts = 0;

          const settleAtTop = () => {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            attempts += 1;

            if (window.scrollY > 0.5 && attempts < 8) {
              window.requestAnimationFrame(settleAtTop);
              return;
            }

            window.requestAnimationFrame(() => {
              root.classList.remove("is-releasing-leading-image-scroll");
              root.style.removeProperty("--text-first-scroll-release");
              window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            });
          };

          settleAtTop();
        });
      });
    }
  };

  const hasContent = blocks.length > 0;
  const selectedBlockIndex = blocks.findIndex((block) => block.id === selectedBlockId);
  const selectedBlock = selectedBlockIndex >= 0 ? blocks[selectedBlockIndex] : undefined;
  const [overlappingStickerIds, setOverlappingStickerIds] = useState<string[]>([]);

  useLayoutEffect(() => {
    const selected = blocks.find((block) => block.id === selectedBlockId);
    if (view !== "edit" || !selected || selected.type === "sticker") {
      setOverlappingStickerIds((current) => (current.length === 0 ? current : []));
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;
    const canvas = document.querySelector<HTMLElement>(".editor-mode .strip-canvas");
    if (!canvas) return;

    const updateOverlaps = () => {
      const selectedElement = Array.from(
        canvas.querySelectorAll<HTMLElement>(".strip-block"),
      ).find((element) => element.dataset.blockId === selectedBlockId);
      if (!selectedElement) return;

      const selectedBounds = selectedElement.getBoundingClientRect();
      const nextIds = Array.from(
        canvas.querySelectorAll<HTMLElement>(".sticker-block"),
      )
        .filter((sticker) => {
          const stickerBounds = sticker.getBoundingClientRect();
          return (
            stickerBounds.left < selectedBounds.right &&
            stickerBounds.right > selectedBounds.left &&
            stickerBounds.top < selectedBounds.bottom &&
            stickerBounds.bottom > selectedBounds.top
          );
        })
        .map((sticker) => sticker.dataset.blockId)
        .filter((id): id is string => Boolean(id));

      setOverlappingStickerIds((current) =>
        current.length === nextIds.length &&
        current.every((id, index) => id === nextIds[index])
          ? current
          : nextIds,
      );
    };

    const resizeObserver = new ResizeObserver(updateOverlaps);
    resizeObserver.observe(canvas);
    canvas
      .querySelectorAll<HTMLElement>(".strip-block")
      .forEach((element) => resizeObserver.observe(element));
    window.addEventListener("resize", updateOverlaps);
    firstFrame = window.requestAnimationFrame(() => {
      updateOverlaps();
      secondFrame = window.requestAnimationFrame(updateOverlaps);
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.removeEventListener("resize", updateOverlaps);
      resizeObserver.disconnect();
    };
  }, [blocks, selectedBlockId, view]);
  const pendingDeleteBlock = blocks.find((block) => block.id === pendingDeleteId);
  const imageCoverBlocks = blocks.filter(
    (block): block is ImageBlock => block.type === "image",
  );
  const usedCoverColors = Array.from(
    new Set(
      blocks
        .filter((block): block is TextBlock => block.type === "text")
        .map((block) => (block.backgroundColor ?? DEFAULT_BACKGROUND).toUpperCase()),
    ),
  );
  const nonBlackCoverColors = usedCoverColors.filter(
    (color) => !isBlackCoverColor(color),
  );
  const onlyBackgroundColorIsBlack =
    usedCoverColors.length > 0 && usedCoverColors.every(isBlackCoverColor);
  const selectedFontCoverColors = Array.from(
    new Set(
      blocks
        .filter(
          (block): block is TextBlock => block.type === "text" && Boolean(block.textColor),
        )
        .map((block) => block.textColor!.toUpperCase())
        .filter((color) => !isBlackCoverColor(color)),
    ),
  );
  const hasCoverImages = imageCoverBlocks.length > 0 || Boolean(customCoverSrc);
  const automaticCoverColors =
    nonBlackCoverColors.length > 0
      ? nonBlackCoverColors
      : onlyBackgroundColorIsBlack && selectedFontCoverColors.length > 0
        ? selectedFontCoverColors
      : hasCoverImages
        ? []
        : randomFallbackCoverColors(blocks.map((block) => block.id).join("|"));
  const coverColors = Array.from(
    new Set(
      [...automaticCoverColors, ...customCoverColors]
        .map((color) => color.toUpperCase())
        .filter((color) => !isBlackCoverColor(color)),
    ),
  );
  const coverChoices: CoverChoice[] = [
    ...(customCoverSrc
      ? [{ key: "custom", kind: "image" as const, src: customCoverSrc, alt: "Uploaded cover" }]
      : []),
    ...imageCoverBlocks.map((block, index) => ({
      key: `image:${block.id}`,
      kind: "image" as const,
      src: block.src,
      alt: block.alt || `Cover option ${index + 1}`,
    })),
    ...coverColors.map((color) => ({
      key: `color:${color}`,
      kind: "color" as const,
      color,
    })),
    { key: "add-image", kind: "add" as const },
    { key: "pick-color", kind: "pick-color" as const },
  ];
  const publishSetupHasCover = coverChoices.some(
    (choice) =>
      choice.key === activeCoverKey &&
      (choice.kind === "image" || choice.kind === "color"),
  );

  const captureDockTransition = () => {
    const currentControls = document.querySelector<HTMLElement>(
      ".composer-dock .dock-controls-current",
    );
    return {
      id: makeId(),
      markup: currentControls?.innerHTML ?? "",
    };
  };

  const cancelDockTransitionSchedule = () => {
    if (dockTransitionTimerRef.current !== null) {
      window.clearTimeout(dockTransitionTimerRef.current);
      dockTransitionTimerRef.current = null;
    }
    if (dockTransitionFrameRef.current !== null) {
      window.cancelAnimationFrame(dockTransitionFrameRef.current);
      dockTransitionFrameRef.current = null;
    }
  };

  const scheduleDockTransitionEnd = () => {
    cancelDockTransitionSchedule();
    dockTransitionFrameRef.current = window.requestAnimationFrame(() => {
      dockTransitionFrameRef.current = window.requestAnimationFrame(() => {
        dockTransitionFrameRef.current = null;
        setDockTransitionStarted(true);
        dockTransitionTimerRef.current = window.setTimeout(() => {
          setDockTransition(null);
          setDockTransitionStarted(false);
          dockTransitionTimerRef.current = null;
        }, DOCK_TRANSITION_DURATION_MS);
      });
    });
  };

  const changeViewWithDockTransition = (nextView: View) => {
    const dockSnapshot = captureDockTransition();
    flushSync(() => {
      setDockTransition(dockSnapshot);
      setDockTransitionStarted(false);
      setView(nextView);
    });
    scheduleDockTransitionEnd();
  };

  const setViewInstantly = (
    nextView: View,
    requestedScrollTop = 0,
    animateDock = true,
  ) => {
    const dockSnapshot = animateDock ? captureDockTransition() : null;
    if (!animateDock) cancelDockTransitionSchedule();
    flushSync(() => {
      setDockTransition(dockSnapshot);
      setDockTransitionStarted(false);
      setView(nextView);
    });
    if (animateDock) scheduleDockTransitionEnd();
    const scrollEnd = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    const top = Math.max(0, Math.min(requestedScrollTop, scrollEnd));
    window.scrollTo({ top, behavior: "auto" });
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
  };

  const showEditorDockEntry = () => {
    if (editorDockEntryTimerRef.current !== null) {
      window.clearTimeout(editorDockEntryTimerRef.current);
    }
    setEditorDockEntering(true);
    editorDockEntryTimerRef.current = window.setTimeout(() => {
      setEditorDockEntering(false);
      editorDockEntryTimerRef.current = null;
    }, 360);
  };

  const transitionToViewStandard = async (
    nextView: View,
    nextScroll: "top" | "end" = "top",
  ) => {
    const root = document.documentElement;
    cancelDockTransitionSchedule();
    root.classList.remove("strip-page-transitioning");
    flushSync(() => {
      setLegacyPageTransition(null);
      setDockTransition(null);
      setDockTransitionStarted(false);
      setView(nextView);
    });
    const top =
      nextScroll === "end"
        ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        : 0;
    window.scrollTo({ top, behavior: "auto" });
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
    root.classList.add("strip-standard-page-entering");
    try {
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, STANDARD_PAGE_TRANSITION_DURATION_MS),
      );
    } finally {
      root.classList.remove("strip-standard-page-entering");
    }
  };

  const transitionToView = async (
    nextView: View,
    direction: PageTransitionDirection,
    nextScroll: "top" | "end" = "top",
    animateDock = true,
  ) => {
    const root = document.documentElement;
    const updateView = () => {
      const dockSnapshot = animateDock ? captureDockTransition() : null;
      if (!animateDock) cancelDockTransitionSchedule();
      flushSync(() => {
        setDockTransition(dockSnapshot);
        setDockTransitionStarted(false);
        setView(nextView);
      });
      if (animateDock) scheduleDockTransitionEnd();
      const top =
        nextScroll === "end"
          ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
          : 0;
      window.scrollTo({ top, behavior: "auto" });
      document.documentElement.scrollTop = top;
      document.body.scrollTop = top;
    };

    const currentShell = document.querySelector<HTMLElement>(".app-shell");
    if (!currentShell) {
      updateView();
      return;
    }

    const outgoingShell = currentShell.cloneNode(true) as HTMLElement;
    outgoingShell
      .querySelectorAll(".composer-dock")
      .forEach((element) => element.remove());
    const duration = PAGE_TRANSITION_DURATION_MS;
    const snapshot: LegacyPageTransitionSnapshot = {
      id: makeId(),
      markup: outgoingShell.outerHTML,
      scrollTop: window.scrollY,
      minHeight: currentShell.scrollHeight,
      direction,
    };
    root.style.setProperty("--page-transition-duration", `${duration}ms`);
    root.classList.add("strip-page-transitioning");
    const dockSnapshot = animateDock ? captureDockTransition() : null;
    if (!animateDock) cancelDockTransitionSchedule();
    flushSync(() => {
      setLegacyPageTransition(snapshot);
      setDockTransition(dockSnapshot);
      setDockTransitionStarted(false);
      setView(nextView);
    });
    if (animateDock) scheduleDockTransitionEnd();
    const top =
      nextScroll === "end"
        ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        : 0;
    window.scrollTo({ top, behavior: "auto" });
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, duration));
    } finally {
      flushSync(() => setLegacyPageTransition(null));
      root.classList.remove("strip-page-transitioning");
      root.style.removeProperty("--page-transition-duration");
    }
  };

  useEffect(() => {
    if (view !== "publish-setup") return;
    const stage = coverStageRef.current;
    if (!stage) return;

    const instruction = coverInstructionRef.current;
    const cards = Array.from(stage.querySelectorAll<HTMLElement>("[data-cover-key]"));
    const images = cards.flatMap((card) => Array.from(card.querySelectorAll("img")));
    const updateMeasurements = () => {
      const stageHeight = stage.clientHeight;
      const stageWidth = stage.clientWidth;
      setCoverStageHeight(stageHeight);
      setCoverStageWidth((current) =>
        Math.abs(current - stageWidth) < 0.5 ? current : stageWidth,
      );
      if (instruction && stageHeight > 0) {
        const stageTop = stage.getBoundingClientRect().top;
        const instructionTop = instruction.getBoundingClientRect().top;
        const midpoint = Math.max(0, instructionTop - stageTop) / 2;
        const nextCenterPercent = Math.max(
          0,
          Math.min(100, (midpoint / stageHeight) * 100),
        );
        setCoverCenterPercent((current) =>
          Math.abs(current - nextCenterPercent) < 0.05 ? current : nextCenterPercent,
        );
      }
      const nextHeights = Object.fromEntries(
        cards.map((card) => [card.dataset.coverKey ?? "", card.offsetHeight]),
      );
      const nextWidths = Object.fromEntries(
        cards.map((card) => [card.dataset.coverKey ?? "", card.offsetWidth]),
      );
      const nextImageAspectRatios = Object.fromEntries(
        cards.flatMap((card) => {
          const image = card.querySelector("img");
          return image?.naturalWidth && image.naturalHeight
            ? [[card.dataset.coverKey ?? "", image.naturalWidth / image.naturalHeight]]
            : [];
        }),
      );
      setCoverCardHeights((current) => {
        const keys = Object.keys(nextHeights);
        const unchanged =
          keys.length === Object.keys(current).length &&
          keys.every((key) => current[key] === nextHeights[key]);
        return unchanged ? current : nextHeights;
      });
      setCoverCardWidths((current) => {
        const keys = Object.keys(nextWidths);
        const unchanged =
          keys.length === Object.keys(current).length &&
          keys.every((key) => current[key] === nextWidths[key]);
        return unchanged ? current : nextWidths;
      });
      setCoverImageAspectRatios((current) => {
        const keys = Object.keys(nextImageAspectRatios);
        const unchanged =
          keys.length === Object.keys(current).length &&
          keys.every((key) => current[key] === nextImageAspectRatios[key]);
        return unchanged ? current : nextImageAspectRatios;
      });
    };

    const frame = window.requestAnimationFrame(updateMeasurements);
    const observer = new ResizeObserver(updateMeasurements);
    observer.observe(stage);
    if (instruction) observer.observe(instruction);
    cards.forEach((card) => observer.observe(card));
    images.forEach((image) => image.addEventListener("load", updateMeasurements));
    window.addEventListener("resize", updateMeasurements);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      images.forEach((image) => image.removeEventListener("load", updateMeasurements));
      window.removeEventListener("resize", updateMeasurements);
    };
  }, [view, coverChoices.length, customCoverSrc]);

  const continueToPublish = () => {
    if (!hasContent) {
      setNotice("Add something before you continue.");
      return;
    }
    if (pageTransitionInFlightRef.current) return;
    pageTransitionInFlightRef.current = true;

    const availableCovers = coverChoices
      .filter((choice) => choice.kind === "image" || choice.kind === "color")
      .map((choice) => choice.key);
    const initialCover =
      selectedCover && availableCovers.includes(selectedCover)
        ? selectedCover
        : availableCovers[0];
    setSelectedCover(initialCover);
    setActiveCoverKey(initialCover);
    setCoverStackStarted(false);
    setCoverColorPickerOpen(false);
    setEditingTextBlockId(null);
    setActiveTextTool(null);
    setPublishSetupReturnView(view === "preview" ? "preview" : "edit");
    publishFlowStartScrollRef.current = window.scrollY;
    try {
      setViewInstantly("publish-setup");
    } finally {
      pageTransitionInFlightRef.current = false;
    }
  };

  const returnFromPublishSetup = () => {
    if (pageTransitionInFlightRef.current) return;
    pageTransitionInFlightRef.current = true;
    try {
      setCoverColorPickerOpen(false);
      setViewInstantly(
        publishSetupReturnView,
        publishFlowStartScrollRef.current,
      );
    } finally {
      pageTransitionInFlightRef.current = false;
    }
  };

  const addCustomCover = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      setCustomCoverSrc(reader.result);
      setSelectedCover("custom");
      setActiveCoverKey("custom");
      setCoverStackStarted(false);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const openCoverColorPicker = () => {
    const selectedColor = coverChoices.find(
      (choice) => choice.key === selectedCover && choice.kind === "color",
    );
    const latestCustomColor = customCoverColors[customCoverColors.length - 1];
    setPendingCoverColor(
      selectedColor?.kind === "color"
        ? selectedColor.color
        : latestCustomColor ?? nonBlackCoverColors[0] ?? "#2147D9",
    );
    setBlackCoverWarningVisible(false);
    setCoverColorPickerOpen(true);
  };

  const confirmCoverColor = () => {
    const color = pendingCoverColor.toUpperCase();
    if (isBlackCoverColor(color)) {
      setBlackCoverWarningVisible(true);
      return;
    }
    setBlackCoverWarningVisible(false);
    setCustomCoverColors((current) =>
      current.some((option) => option.toUpperCase() === color)
        ? current
        : [...current, color],
    );
    const key = `color:${color}`;
    setSelectedCover(key);
    setActiveCoverKey(key);
    setCoverStackStarted(true);
    setCoverColorPickerOpen(false);
  };

  const selectCoverAt = (index: number) => {
    const choice = coverChoices[index];
    if (!choice) return;
    if (coverColorPickerOpen && choice.kind !== "pick-color") {
      setCoverColorPickerOpen(false);
      setBlackCoverWarningVisible(false);
    }
    setCoverStackStarted(true);
    setActiveCoverKey(choice.key);
    if (choice.kind === "image" || choice.kind === "color") {
      setSelectedCover(choice.key);
    }
  };

  const moveCover = (direction: -1 | 1) => {
    const currentIndex = Math.max(
      0,
      coverChoices.findIndex((choice) => choice.key === activeCoverKey),
    );
    selectCoverAt(currentIndex + direction);
  };

  const beginCoverSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    const desktopColorCard =
      event.pointerType !== "touch" &&
      event.pointerType !== "pen" &&
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>(
            ".cover-pick-color-option:not(.is-selected)",
          )
        : null;
    if (desktopColorCard) {
      const choiceIndex = coverChoices.findIndex(
        (choice) => choice.key === desktopColorCard.dataset.coverKey,
      );
      if (choiceIndex >= 0) {
        coverSwipeSuppressClickRef.current = true;
        selectCoverAt(choiceIndex);
        openCoverColorPicker();
        window.setTimeout(() => {
          coverSwipeSuppressClickRef.current = false;
        }, 500);
      }
      return;
    }
    coverSwipeStartYRef.current = event.clientY;
    coverDragProgressRef.current = 0;
    setCoverDragProgress(0);
    setCoverIsDragging(true);
    coverSwipeSuppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateCoverSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startY = coverSwipeStartYRef.current;
    if (startY === null) return;
    const activeIndex = Math.max(
      0,
      coverChoices.findIndex((choice) => choice.key === activeCoverKey),
    );
    let progress = (startY - event.clientY) / 150;
    if ((activeIndex === 0 && progress < 0) || (activeIndex === coverChoices.length - 1 && progress > 0)) {
      progress *= 0.2;
    }
    progress = Math.max(-0.95, Math.min(0.95, progress));
    coverDragProgressRef.current = progress;
    coverSwipeSuppressClickRef.current = Math.abs(progress) >= 0.24;
    setCoverDragProgress(progress);
  };

  const finishCoverSwipe = () => {
    const progress = coverDragProgressRef.current;
    coverSwipeStartYRef.current = null;
    if (Math.abs(progress) >= 0.24) moveCover(progress > 0 ? 1 : -1);
    setCoverIsDragging(false);
    setCoverDragProgress(0);
    coverDragProgressRef.current = 0;
    window.setTimeout(() => {
      coverSwipeSuppressClickRef.current = false;
    }, 0);
  };

  const cancelCoverSwipe = () => {
    coverSwipeStartYRef.current = null;
    coverDragProgressRef.current = 0;
    setCoverIsDragging(false);
    setCoverDragProgress(0);
  };

  const continueToTitle = async () => {
    if (!publishSetupHasCover) {
      setNotice("Pick a cover before continuing.");
      return;
    }
    if (pageTransitionInFlightRef.current) return;
    pageTransitionInFlightRef.current = true;
    try {
      await transitionToView("title-setup", "forward", "top", false);
    } finally {
      pageTransitionInFlightRef.current = false;
    }
  };

  const returnToCoverSetup = () => {
    if (pageTransitionInFlightRef.current) return;
    pageTransitionInFlightRef.current = true;
    try {
      setViewInstantly("publish-setup", 0, false);
    } finally {
      pageTransitionInFlightRef.current = false;
    }
  };

  const beginNewStrip = () => {
    const draftId = makeId();
    setCurrentDraftId(draftId);
    setCurrentDraftCreatedAt(Date.now());
    setBlocks([]);
    setStripTitle("");
    setSelectedCover("");
    setActiveCoverKey("");
    setCustomCoverSrc(null);
    setCustomCoverColors([]);
    setCoverColorShape("square");
    setSelectedBlockId(null);
    setEditingTextBlockId(null);
    setActiveTextTool(null);
    setOpenedPublishedStrip(null);
    setBrowserPath(`/edit/${encodeURIComponent(draftId)}`);
    showEditorDockEntry();
    void transitionToViewStandard("edit");
  };

  const openDraft = async (draft: DraftStripSummary) => {
    if (!libraryOwnerId || openingDraftId || pageTransitionInFlightRef.current) return;
    setOpeningDraftId(draft.id);
    pageTransitionInFlightRef.current = true;
    try {
      const response = await fetch(
        `/api/drafts/${encodeURIComponent(draft.id)}?ownerId=${encodeURIComponent(libraryOwnerId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Draft request failed");
      const data = (await response.json()) as { draft: DraftStripDetail };
      setCurrentDraftId(data.draft.id);
      setCurrentDraftCreatedAt(data.draft.createdAt);
      setBlocks(data.draft.blocks);
      setStripTitle(data.draft.title);
      setSelectedBlockId(null);
      setEditingTextBlockId(null);
      setActiveTextTool(null);
      setSelectedCover("");
      setActiveCoverKey("");
      setCustomCoverSrc(null);
      setCustomCoverColors([]);
      setCoverColorShape("square");
      setBrowserPath(`/edit/${encodeURIComponent(data.draft.id)}`);
      showEditorDockEntry();
      await transitionToViewStandard("edit");
    } catch {
      setNotice("Couldn’t open this draft. Try again.");
    } finally {
      setOpeningDraftId(null);
      pageTransitionInFlightRef.current = false;
    }
  };

  const openDraftLibrary = async () => {
    if (pageTransitionInFlightRef.current) return;
    pageTransitionInFlightRef.current = true;
    try {
      setBrowserPath("/drafts");
      setViewInstantly("drafts", 0, false);
    } finally {
      pageTransitionInFlightRef.current = false;
    }
  };

  const returnToLibrary = async () => {
    if (pageTransitionInFlightRef.current) return;
    pageTransitionInFlightRef.current = true;
    try {
      setBrowserPath("/");
      setViewInstantly("library", 0, false);
    } finally {
      pageTransitionInFlightRef.current = false;
    }
  };

  const openPublishedStrip = async (strip: PublishedStripSummary) => {
    if (!libraryOwnerId || openingStripId || pageTransitionInFlightRef.current) return;
    setOpeningStripId(strip.id);
    pageTransitionInFlightRef.current = true;
    try {
      const response = await fetch(
        `/api/strips/${encodeURIComponent(strip.id)}?ownerId=${encodeURIComponent(libraryOwnerId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Strip request failed");
      const data = (await response.json()) as { strip: PublishedStripDetail };
      setOpenedPublishedStrip(data.strip);
      setBrowserPath(`/strip/${encodeURIComponent(data.strip.id)}`);
      await transitionToViewStandard("published");
    } catch {
      setNotice("Couldn’t open this Strip. Try again.");
    } finally {
      setOpeningStripId(null);
      pageTransitionInFlightRef.current = false;
    }
  };

  const returnToLibraryFromPublished = async () => {
    if (pageTransitionInFlightRef.current) return;
    pageTransitionInFlightRef.current = true;
    try {
      setBrowserPath("/");
      await transitionToViewStandard("library");
      setOpenedPublishedStrip(null);
    } finally {
      pageTransitionInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!libraryOwnerId || initialRouteHandledRef.current) return;
    initialRouteHandledRef.current = true;
    let cancelled = false;

    const applyRoute = async () => {
      const route = routeFromPathname(window.location.pathname);
      if (route.kind === "library") {
        setView("library");
        setOpenedPublishedStrip(null);
        window.scrollTo({ top: 0, behavior: "auto" });
        return;
      }
      if (route.kind === "drafts") {
        setView("drafts");
        setOpenedPublishedStrip(null);
        window.scrollTo({ top: 0, behavior: "auto" });
        return;
      }
      if (route.kind === "edit") {
        try {
          const response = await fetch(
            `/api/drafts/${encodeURIComponent(route.id)}?ownerId=${encodeURIComponent(libraryOwnerId)}`,
            { cache: "no-store" },
          );
          if (cancelled) return;
          if (response.status === 404) {
            setCurrentDraftId(route.id);
            setCurrentDraftCreatedAt(Date.now());
            setBlocks([]);
            setStripTitle("");
          } else {
            if (!response.ok) throw new Error("Draft route request failed");
            const data = (await response.json()) as { draft: DraftStripDetail };
            if (cancelled) return;
            setCurrentDraftId(data.draft.id);
            setCurrentDraftCreatedAt(data.draft.createdAt);
            setBlocks(data.draft.blocks);
            setStripTitle(data.draft.title);
          }
          setSelectedBlockId(null);
          setEditingTextBlockId(null);
          setActiveTextTool(null);
          setOpenedPublishedStrip(null);
          showEditorDockEntry();
          setView("edit");
          window.scrollTo({ top: 0, behavior: "auto" });
        } catch {
          if (!cancelled) setNotice("Couldn’t open this draft. Try again.");
        }
        return;
      }

      try {
        const response = await fetch(`/api/strips/${encodeURIComponent(route.id)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Published route request failed");
        const data = (await response.json()) as { strip: PublishedStripDetail };
        if (cancelled) return;
        setOpenedPublishedStrip(data.strip);
        setView("published");
        window.scrollTo({ top: 0, behavior: "auto" });
      } catch {
        if (cancelled) return;
        setBrowserPath("/", true);
        setView("library");
        setNotice("Couldn’t open this Strip.");
      }
    };

    const handlePopState = () => void applyRoute();
    void applyRoute();
    window.addEventListener("popstate", handlePopState);
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", handlePopState);
    };
  }, [libraryOwnerId]);

  const publish = async () => {
    if (!hasContent) {
      setNotice("Add something before you strip.");
      return;
    }
    if ((view === "publish-setup" || view === "title-setup") && !publishSetupHasCover) {
      setNotice("Pick a cover before publishing.");
      return;
    }
    const coverChoice = coverChoices.find(
      (choice) => choice.key === selectedCover,
    );
    if (!coverChoice || (coverChoice.kind !== "image" && coverChoice.kind !== "color")) {
      setNotice("Pick a cover before publishing.");
      return;
    }
    if (!libraryOwnerId || publishing || pageTransitionInFlightRef.current) return;
    const publishedCover: PublishedCover =
      coverChoice.kind === "image"
        ? { kind: "image", src: coverChoice.src, alt: coverChoice.alt }
        : {
            kind: "color",
            color: coverChoice.color,
            shape: coverColorShape,
          };
    const stripId = makeId();
    const publishedAt = Date.now();
    pageTransitionInFlightRef.current = true;
    setPublishing(true);
    try {
      const response = await fetch("/api/strips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: libraryOwnerId,
          id: stripId,
          draftId: currentDraftId,
          title: stripTitle.trim(),
          publishedAt,
          cover: publishedCover,
          blocks,
        }),
      });
      if (!response.ok) throw new Error("Publish request failed");
      const data = (await response.json()) as {
        strip: PublishedStripSummary;
      };
      setPublishedStrips((current) => [data.strip, ...current]);
      setOpenedPublishedStrip({
        id: stripId,
        title: stripTitle.trim(),
        publishedAt,
        blocks,
      });
      if (currentDraftId) {
        try {
          await fetch(
            `/api/drafts/${encodeURIComponent(currentDraftId)}?ownerId=${encodeURIComponent(libraryOwnerId)}`,
            { method: "DELETE" },
          );
        } catch {
          // Publishing succeeds even if draft cleanup has to be retried later.
        }
        setDraftStrips((current) =>
          current.filter((draft) => draft.id !== currentDraftId),
        );
      }
      setCurrentDraftId(null);
      setCurrentDraftCreatedAt(0);
      setEditingTextBlockId(null);
      setActiveTextTool(null);
      setSelectedBlockId(null);
      setBlocks([]);
      setStripTitle("");
      setSelectedCover("");
      setActiveCoverKey("");
      setCustomCoverSrc(null);
      setCustomCoverColors([]);
      setCoverColorShape("square");
      setBrowserPath(`/strip/${encodeURIComponent(stripId)}`);
      await transitionToView("published", "forward", "top", false);
    } catch {
      setNotice("Couldn’t publish this Strip. Try again.");
    } finally {
      setPublishing(false);
      pageTransitionInFlightRef.current = false;
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Link copied.");
    } catch {
      setNotice("Copy the address from your browser.");
    }
  };

  const renderBlockControls = (block: StripBlock, index: number) => {
    if (selectedBlockId !== block.id) return null;

    return (
      <BlockControls
        index={index}
        count={blocks.length}
        onMove={
          block.type === "sticker"
            ? undefined
            : (direction) => moveBlock(index, direction)
        }
        onRemove={() => setPendingDeleteId(block.id)}
        onTextTool={
          block.type === "text"
            ? (tool) => {
                setEditingTextBlockId(null);
                setLastTextTool(tool);
                setActiveTextTool(tool);
              }
            : undefined
        }
        activeTextTool={activeTextTool}
        surfaceColor={
          block.type === "text" ? block.backgroundColor ?? DEFAULT_BACKGROUND : undefined
        }
      />
    );
  };

  const renderStrip = (
    isEditing: boolean,
    sourceBlocks: StripBlock[] = blocks,
  ) => {
    const stickerFloor = sourceBlocks.reduce(
      (floor, block) =>
        block.type === "sticker" ? Math.max(floor, block.y + 180) : floor,
      0,
    );

    return (
      <div
        className="strip-canvas"
        style={stickerFloor > 0 ? { minHeight: `${stickerFloor}px` } : undefined}
      >
        {sourceBlocks.length === 0 && isEditing ? (
          <div className="empty-strip">
            <p>Your Strip starts here.</p>
            <span>Add one block at a time.</span>
          </div>
        ) : null}

        {sourceBlocks.map((block, index) => {
        if (block.type === "text") {
          const textIsBeingEdited = isEditing && editingTextBlockId === block.id;
          const textIsBlank = block.content.trim().length === 0;
          const backgroundColor = block.backgroundColor ?? DEFAULT_BACKGROUND;
          const textColor = block.textColor ?? contrastColor(backgroundColor);
          const usesDarkText = contrastColor(textColor) === "#FFFFFF";
          return (
            <section
              className={`strip-block text-block ${isEditing ? "is-editing" : ""} ${
                isEditing && selectedBlockId === block.id ? "is-selected" : ""
              } ${usesDarkText ? "uses-dark-text" : ""}`}
              data-block-id={block.id}
              key={block.id}
              onPointerDown={(event) => beginBlockTapGesture(event, block.id)}
              onPointerMove={trackBlockTapGesture}
              onPointerCancel={cancelBlockTapGesture}
              onClick={(event) => {
                if (!isEditing || textIsBeingEdited) return;
                if (!completeBlockTapGesture(block.id)) return;
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
                triggerSelectionHaptic();
                setSelectedBlockId(block.id);
                setActiveTextTool(null);
              }}
              style={{
                backgroundColor,
                color: textColor,
                fontFamily: FONT_STACKS[block.fontStyle ?? "sans"],
              }}
            >
              {isEditing && selectedBlockId === block.id ? (
                <BlockSelectionTab />
              ) : null}
              {isEditing ? renderBlockControls(block, index) : null}
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
                  className={
                    isEditing && textIsBlank
                      ? "is-placeholder"
                      : textIsBlank
                        ? "is-blank"
                        : undefined
                  }
                  style={{ fontSize: `${block.fontSize ?? DEFAULT_FONT_SIZE}px` }}
                  aria-hidden={textIsBlank || undefined}
                >
                  {textIsBlank ? (isEditing ? "tap me to write" : "") : block.content}
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
              onPointerDown={(event) => beginBlockTapGesture(event, block.id)}
              onPointerMove={trackBlockTapGesture}
              onPointerCancel={cancelBlockTapGesture}
              onClick={() => {
                if (!isEditing) return;
                if (!completeBlockTapGesture(block.id)) return;
                if (selectedBlockId !== block.id) triggerSelectionHaptic();
                setSelectedBlockId(block.id);
                setEditingTextBlockId(null);
                setActiveTextTool(null);
              }}
            >
              {/* A Strip image is intentionally edge-to-edge. */}
              {isEditing && selectedBlockId === block.id ? (
                <BlockSelectionTab />
              ) : null}
              {isEditing ? renderBlockControls(block, index) : null}
              <img
                src={block.src}
                alt={block.alt}
              />
            </figure>
          );
        }

        if (block.type === "sticker") {
          return (
            <StripStickerBlock
              key={block.id}
              block={block}
              isEditing={isEditing}
              isSelected={selectedBlockId === block.id}
              isOverlappingSelection={overlappingStickerIds.includes(block.id)}
              onSelect={() => {
                if (!isEditing) return;
                if (selectedBlockId !== block.id) triggerSelectionHaptic();
                setSelectedBlockId(block.id);
                setEditingTextBlockId(null);
                setActiveTextTool(null);
              }}
              onMove={(position) => {
                setBlocks((current) =>
                  current.map((currentBlock) =>
                    currentBlock.id === block.id && currentBlock.type === "sticker"
                      ? { ...currentBlock, ...position }
                      : currentBlock,
                  ),
                );
              }}
              controls={isEditing ? renderBlockControls(block, index) : null}
            />
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
              if (selectedBlockId !== block.id) triggerSelectionHaptic();
              setSelectedBlockId(block.id);
              setEditingTextBlockId(null);
              setActiveTextTool(null);
            }}
            controls={isEditing ? renderBlockControls(block, index) : null}
          />
        );
        })}
      </div>
    );
  };

  const legacyTransitionLayer = legacyPageTransition ? (
    <div
      className={`legacy-page-transition-overlay is-${legacyPageTransition.direction}`}
      key={legacyPageTransition.id}
      aria-hidden="true"
    >
      <div
        className="legacy-page-transition-page"
        style={{
          top: `${-legacyPageTransition.scrollTop}px`,
          minHeight: `${legacyPageTransition.minHeight}px`,
        }}
        dangerouslySetInnerHTML={{ __html: legacyPageTransition.markup }}
      />
    </div>
  ) : null;
  const legacyPageEnterClass = legacyPageTransition
    ? `legacy-page-enter is-${legacyPageTransition.direction}`
    : "";
  const dockTransitionLayer = dockTransition?.markup ? (
    <div
      className={`dock-controls dock-controls-outgoing ${
        dockTransitionStarted ? "is-transitioning" : ""
      }`}
      key={dockTransition.id}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: dockTransition.markup }}
    />
  ) : null;
  const currentDockControlsClass = `dock-controls dock-controls-current ${
    dockTransition ? "is-entering" : ""
  } ${dockTransitionStarted ? "is-transitioning" : ""}`;

  if (view === "library" || view === "drafts") {
    const isDraftLibrary = view === "drafts";
    const libraryItems = isDraftLibrary ? draftStrips : publishedStrips;
    const libraryColumns = [
      libraryItems.filter((_, index) => index % 2 === 0),
      libraryItems.filter((_, index) => index % 2 === 1),
    ];

    const renderLibraryCard = (
      strip: PublishedStripSummary | DraftStripSummary,
    ) => {
      const isDraft = "updatedAt" in strip;
      const cardTitle =
        strip.title ||
        (isDraft ? draftFallbackTitle(strip.createdAt) : "Untitled");
      return (
        <button
          className="library-card"
          type="button"
          key={strip.id}
          onClick={() =>
            isDraft
              ? void openDraft(strip)
              : void openPublishedStrip(strip)
          }
          disabled={
            isDraft ? openingDraftId === strip.id : openingStripId === strip.id
          }
          aria-label={`Open ${cardTitle}`}
        >
          <div
            className={`library-cover library-cover-${strip.cover.kind} ${
              strip.cover.kind === "color"
                ? `library-cover-${strip.cover.shape} ${
                    isDraft && isBlackCoverColor(strip.cover.color)
                      ? "is-dark-draft-cover"
                      : ""
                  }`
                : ""
            }`}
            style={
              strip.cover.kind === "color"
                ? { backgroundColor: strip.cover.color }
                : undefined
            }
          >
            {strip.cover.kind === "image" ? (
              <img src={strip.cover.src} alt={strip.cover.alt} />
            ) : null}
          </div>
          <h2>{cardTitle}</h2>
        </button>
      );
    };

    return (
      <>
        {legacyTransitionLayer}
        <main
          className={`app-shell library-mode ${
            isDraftLibrary ? "drafts-library-mode" : ""
          }`}
        >
          <div
            className={`top-safe-area-anchor ${legacyPageEnterClass}`}
            style={{ backgroundColor: DEFAULT_BACKGROUND }}
            aria-hidden="true"
          />

          <section className={`strip-library ${legacyPageEnterClass}`}>
            <header className="library-header">
              <h1>{isDraftLibrary ? "DRAFTS" : "STRIP"}</h1>
              <button
                className="library-header-action"
                type="button"
                onClick={() =>
                  isDraftLibrary
                    ? void returnToLibrary()
                    : void openDraftLibrary()
                }
                aria-label={isDraftLibrary ? "Return to Strips" : "Open drafts"}
              >
                {isDraftLibrary ? (
                  <House aria-hidden="true" />
                ) : (
                  <Files aria-hidden="true" />
                )}
              </button>
            </header>
            <div
              className="library-grid"
              aria-label={isDraftLibrary ? "Your drafts" : "Your Strips"}
              aria-busy={isDraftLibrary ? draftsLoading : libraryLoading}
            >
              {libraryColumns.map((column, columnIndex) => (
                <div
                  className="library-column"
                  key={`${view}-library-column-${columnIndex}`}
                >
                  {column.map(renderLibraryCard)}
                </div>
              ))}
            </div>
          </section>

          <button
            className="library-add-button"
            type="button"
            onClick={beginNewStrip}
            aria-label="Create a new Strip"
          >
            <Plus aria-hidden="true" />
          </button>
          {notice ? <div className="notice">{notice}</div> : null}
        </main>
      </>
    );
  }

  if (view === "title-setup") {
    return (
      <>
        {legacyTransitionLayer}
        <main className="app-shell title-setup-mode">
        <div
          className={`top-safe-area-anchor ${legacyPageEnterClass}`}
          style={{ backgroundColor: topSafeAreaColor }}
          aria-hidden="true"
        />
        <section
          className={`title-setup-shell ${legacyPageEnterClass}`}
          aria-labelledby="title-question-heading"
        >
          <div className="title-question">
            <h1 id="title-question-heading">Give your Strip a title</h1>
            <label className="title-question-field">
              <span className="visually-hidden">Strip title</span>
              <input
                type="text"
                value={stripTitle}
                onChange={(event) => setStripTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  event.currentTarget.blur();
                }}
                placeholder="Type your title here..."
                maxLength={80}
                autoComplete="off"
                aria-label="Strip title"
              />
            </label>
            <p className="title-question-hint">Optional, only if you want!</p>
          </div>
        </section>

        <footer
          key="persistent-composer-dock"
          className="composer-dock title-setup-dock publish-flow-dock"
        >
          {dockTransitionLayer}
          <div className={currentDockControlsClass} key={`dock-controls:${view}`}>
            <button
              className="dock-icon-button publish-flow-button publish-flow-back-button"
              type="button"
              onClick={() => void returnToCoverSetup()}
              aria-label="Back to cover selection"
            >
              Back
            </button>
            <button
              className="dock-icon-button publish-icon-button publish-strip-button publish-flow-button"
              type="button"
              onClick={() => void publish()}
              disabled={publishing}
              aria-label="Publish Strip"
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </footer>
        {notice ? <div className="notice">{notice}</div> : null}
        </main>
      </>
    );
  }

  if (view === "publish-setup") {
    const selectedCoverIndex = Math.max(
      0,
      coverChoices.findIndex((choice) => choice.key === activeCoverKey),
    );
    const activeCoverChoice = coverChoices[selectedCoverIndex];
    const measuredStageHeight = coverStageHeight || 600;
    const measuredStageWidth = coverStageWidth || 390;
    const targetColorDimensions = coverColorDimensions(
      coverColorShape,
      measuredStageWidth,
    );
    const getImageDimensions = (choice: CoverChoice | undefined) =>
      choice?.kind === "image" && coverImageAspectRatios[choice.key]
        ? coverImageDimensions(
            coverImageAspectRatios[choice.key],
            measuredStageWidth,
            measuredStageHeight,
          )
        : null;
    const getCoverHeight = (choice: CoverChoice | undefined, fallback: number) =>
      choice?.kind === "color"
        ? targetColorDimensions.height
        : getImageDimensions(choice)?.height ??
          (choice ? (coverCardHeights[choice.key] ?? fallback) : fallback);
    const getCoverWidth = (choice: CoverChoice | undefined, fallback: number) =>
      choice?.kind === "color"
        ? targetColorDimensions.width
        : getImageDimensions(choice)?.width ??
          (choice ? (coverCardWidths[choice.key] ?? fallback) : fallback);
    const selectedMeasuredHeight = getCoverHeight(activeCoverChoice, 360);
    const selectedMeasuredWidth = getCoverWidth(activeCoverChoice, 420);
    const dragDirection = coverDragProgress === 0 ? 0 : coverDragProgress > 0 ? 1 : -1;
    const dragTarget = coverChoices[selectedCoverIndex + dragDirection];
    const dragAmount = Math.abs(coverDragProgress);
    const isCoverChoice = (choice: CoverChoice | undefined) =>
      choice?.kind === "image" || choice?.kind === "color";
    const activeSelectionWeight = isCoverChoice(activeCoverChoice)
      ? 1 - dragAmount
      : 0;
    const incomingSelectionWeight = isCoverChoice(dragTarget) ? dragAmount : 0;
    const selectionCornersOpacity = Math.max(
      activeSelectionWeight,
      incomingSelectionWeight,
    );
    const activeShapeControlWeight =
      activeCoverChoice?.kind === "color" ? 1 - dragAmount : 0;
    const incomingShapeControlWeight =
      dragTarget?.kind === "color" ? dragAmount : 0;
    const shapeSelectorOpacity = Math.max(
      activeShapeControlWeight,
      incomingShapeControlWeight,
    );
    const hasColorCoverChoice = coverChoices.some(
      (choice) => choice.kind === "color",
    );
    const dragTargetHeight = getCoverHeight(dragTarget, selectedMeasuredHeight);
    const dragTargetWidth = getCoverWidth(dragTarget, selectedMeasuredWidth);
    const effectiveSelectedHeight =
      selectedMeasuredHeight +
      (dragTargetHeight - selectedMeasuredHeight) * Math.abs(coverDragProgress);
    const effectiveSelectedWidth =
      selectedMeasuredWidth +
      (dragTargetWidth - selectedMeasuredWidth) * Math.abs(coverDragProgress);
    const shapeSelectorTopPercent = Math.min(
      82,
      coverCenterPercent +
        ((targetColorDimensions.height / 2 + 76) / measuredStageHeight) *
          100,
    );
    const coverCardStyle = (index: number): CoverCardStyle => {
      let relativePosition = index - selectedCoverIndex;
      if (!coverStackStarted && relativePosition < 0) relativePosition = -2;
      const position = Math.max(-2, Math.min(2, relativePosition - coverDragProgress));
      const cardChoice = coverChoices[index];
      const cardHeight = getCoverHeight(cardChoice, effectiveSelectedHeight);
      const cardWidth = getCoverWidth(cardChoice, 420);
      const neighborScale = Math.min(0.62, 220 / cardWidth);
      const renderedNeighborHeight = cardHeight * neighborScale;
      const neighborOffset = Math.max(
        24,
        effectiveSelectedHeight / 2 + 44 - renderedNeighborHeight / 2,
      );
      const neighborOffsetPercent = (neighborOffset / measuredStageHeight) * 100;
      const hiddenTravelPercent = Math.min(
        8,
        Math.max(5.5, neighborOffsetPercent * 0.36),
      );
      const hiddenScale = Math.max(0.36, neighborScale * 0.82);
      const cardKeyframes = [
        {
          top: coverCenterPercent - neighborOffsetPercent - hiddenTravelPercent,
          scale: hiddenScale,
          opacity: 0,
        },
        {
          top: coverCenterPercent - neighborOffsetPercent,
          scale: neighborScale,
          opacity: 0.62,
        },
        { top: coverCenterPercent, scale: 1, opacity: 1 },
        {
          top: coverCenterPercent + neighborOffsetPercent,
          scale: neighborScale,
          opacity: 0.62,
        },
        {
          top: coverCenterPercent + neighborOffsetPercent + hiddenTravelPercent,
          scale: hiddenScale,
          opacity: 0,
        },
      ];
      const lowerPosition = Math.floor(position);
      const upperPosition = Math.ceil(position);
      const progress = position - lowerPosition;
      const lower = cardKeyframes[lowerPosition + 2];
      const upper = cardKeyframes[upperPosition + 2];
      const mix = (start: number, end: number) => start + (end - start) * progress;
      const scale = mix(lower.scale, upper.scale);
      return {
        top: `${mix(lower.top, upper.top)}%`,
        opacity: mix(lower.opacity, upper.opacity),
        transform: `translate(-50%, -50%) scale(${scale})`,
        zIndex: Math.max(0, Math.round(3 - Math.abs(position))),
        "--cover-dim": Math.min(0.54, Math.abs(position) * 0.54),
      };
    };
    return (
      <>
        {legacyTransitionLayer}
        <main className="app-shell publish-setup-mode">
        <div
          className={`top-safe-area-anchor ${legacyPageEnterClass}`}
          style={{ backgroundColor: topSafeAreaColor }}
          aria-hidden="true"
        />
        <section
          className={`publish-setup-shell ${legacyPageEnterClass}`}
          aria-label="Pick a cover"
        >
          <section className="cover-picker" aria-label="Choose a cover">
            <div className="cover-selector-frame">
              <div
                ref={coverStageRef}
                className={`cover-card-stage ${coverIsDragging ? "is-dragging" : ""}`}
                role="listbox"
                aria-label="Cover options"
                tabIndex={0}
                onPointerDown={beginCoverSwipe}
                onPointerMove={updateCoverSwipe}
                onPointerUp={finishCoverSwipe}
                onPointerCancel={cancelCoverSwipe}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveCover(-1);
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveCover(1);
                  }
                }}
              >
                {coverChoices.map((choice, index) => {
                  const isSelected = activeCoverKey === choice.key;
                  let positionClass = "is-hidden-below";
                  if (isSelected) positionClass = "is-selected";
                  else if (index === selectedCoverIndex - 1 && coverStackStarted) {
                    positionClass = "is-previous";
                  } else if (index === selectedCoverIndex + 1) {
                    positionClass = "is-next";
                  } else if (index < selectedCoverIndex) {
                    positionClass = "is-hidden-above";
                  }
                  return (
                    <button
                      className={`cover-option cover-${choice.kind}-option ${
                        choice.kind === "color" ? `cover-color-${coverColorShape}` : ""
                      } ${
                        choice.kind === "pick-color" && coverColorPickerOpen
                          ? "is-color-preview"
                          : ""
                      } ${positionClass}`}
                      data-cover-key={choice.key}
                      type="button"
                      key={choice.key}
                      onClick={() => {
                        if (coverSwipeSuppressClickRef.current) {
                          coverSwipeSuppressClickRef.current = false;
                          return;
                        }
                        if (!isSelected && choice.kind === "pick-color") {
                          const isDesktopPointer = window.matchMedia(
                            "(hover: hover) and (pointer: fine)",
                          ).matches;
                          if (!isDesktopPointer) return;
                          selectCoverAt(index);
                          openCoverColorPicker();
                          return;
                        }
                        if (isSelected && choice.kind === "add") {
                          coverInputRef.current?.click();
                          return;
                        }
                        if (isSelected && choice.kind === "pick-color") {
                          if (coverColorPickerOpen) confirmCoverColor();
                          else openCoverColorPicker();
                          return;
                        }
                      }}
                      style={
                        choice.kind === "color"
                          ? {
                              ...coverCardStyle(index),
                              backgroundColor: choice.color,
                            }
                          : choice.kind === "image"
                            ? {
                                ...coverCardStyle(index),
                                width: getCoverWidth(choice, 420),
                                height: getCoverHeight(choice, 360),
                              }
                          : choice.kind === "pick-color" && coverColorPickerOpen
                            ? {
                                ...coverCardStyle(index),
                                ...swatchStyle(pendingCoverColor),
                                background: pendingCoverColor,
                              }
                            : coverCardStyle(index)
                      }
                      aria-label={
                        choice.kind === "add"
                          ? "Add a cover image"
                          : choice.kind === "pick-color"
                            ? "Add a cover color"
                          : `Use cover option ${index + 1}`
                      }
                      aria-pressed={
                        choice.kind === "image" || choice.kind === "color"
                          ? selectedCover === choice.key
                          : undefined
                      }
                      aria-hidden={!isSelected}
                      tabIndex={isSelected ? 0 : -1}
                    >
                      {choice.kind === "image" ? (
                        <img src={choice.src} alt={choice.alt} />
                      ) : null}
                      {choice.kind === "add" ? (
                        <span className="cover-action-content cover-add-content">
                          <ImagePlus aria-hidden="true" />
                          <span>Add photo</span>
                        </span>
                      ) : null}
                      {choice.kind === "pick-color" ? (
                        <span className="cover-action-content cover-pick-color-content">
                          <PaintBucket aria-hidden="true" />
                          <span>Add color</span>
                        </span>
                      ) : null}
                    </button>
                  );
                })}

              </div>
              <div
                className={`cover-selection-corners ${
                  coverIsDragging ? "is-dragging" : ""
                }`}
                style={{
                  top: `${coverCenterPercent}%`,
                  width: effectiveSelectedWidth,
                  height: effectiveSelectedHeight,
                  opacity: selectionCornersOpacity,
                }}
                aria-hidden="true"
              >
                <span className="is-top-left" />
                <span className="is-top-right" />
                <span className="is-bottom-right" />
                <span className="is-bottom-left" />
              </div>
              {hasColorCoverChoice ? (
                <nav
                  className={`cover-shape-selector ${
                    coverIsDragging ? "is-dragging" : ""
                  }`}
                  style={{
                    top: `${shapeSelectorTopPercent}%`,
                    opacity: shapeSelectorOpacity,
                    pointerEvents:
                      activeCoverChoice?.kind === "color" && !coverIsDragging
                        ? "auto"
                        : "none",
                  }}
                  aria-label="Color cover shape"
                  aria-hidden={shapeSelectorOpacity === 0}
                >
                  {(["portrait", "square", "landscape"] as CoverColorShape[]).map(
                    (shape) => (
                      <button
                        className={coverColorShape === shape ? "is-current" : ""}
                        type="button"
                        key={shape}
                        onClick={() => setCoverColorShape(shape)}
                        aria-label={`Use ${shape} color cover`}
                        aria-pressed={coverColorShape === shape}
                      >
                        <span className={`cover-shape-glyph is-${shape}`} aria-hidden="true" />
                      </button>
                    ),
                  )}
                </nav>
              ) : null}
              <nav
                className="cover-pagination"
                style={{ top: `${coverCenterPercent}%` }}
                aria-label="Cover options"
              >
                {coverChoices.map((choice, index) => (
                  <button
                    className={activeCoverKey === choice.key ? "is-current" : ""}
                    type="button"
                    key={choice.key}
                    onClick={() => selectCoverAt(index)}
                    aria-label={`Show cover ${index + 1} of ${coverChoices.length}`}
                    aria-current={activeCoverKey === choice.key ? "true" : undefined}
                  />
                ))}
              </nav>
            </div>
          </section>
        </section>

        <p
          ref={coverInstructionRef}
          className={`cover-instruction ${legacyPageEnterClass}`}
        >
          Swipe up to pick a cover
        </p>

        <input
          ref={coverInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={addCustomCover}
          aria-label="Choose a cover image"
        />

        <footer
          key="persistent-composer-dock"
          className={`composer-dock publish-setup-dock publish-flow-dock ${
            coverColorPickerOpen ? "is-shifted" : ""
          }`}
        >
          {dockTransitionLayer}
          <div className={currentDockControlsClass} key={`dock-controls:${view}`}>
            <button
              className="dock-icon-button publish-flow-button publish-flow-back-button"
              type="button"
              onClick={() => void returnFromPublishSetup()}
              aria-label="Back"
            >
              Back
            </button>
            <button
              className="dock-icon-button publish-icon-button publish-strip-button publish-flow-button"
              type="button"
              onClick={continueToTitle}
              aria-label="Continue to title"
              disabled={!publishSetupHasCover}
            >
              Continue
            </button>
          </div>
        </footer>
        <TextStyleSelector
          block={{
            id: "cover-color-picker",
            type: "text",
            content: "",
            backgroundColor: pendingCoverColor,
          }}
          tool="background"
          visible={coverColorPickerOpen}
          onChange={(change) => {
            if (!change.backgroundColor) return;
            setPendingCoverColor(change.backgroundColor);
            if (!isBlackCoverColor(change.backgroundColor)) {
              setBlackCoverWarningVisible(false);
            }
          }}
          onBack={confirmCoverColor}
          backgroundOptions={BACKGROUND_COLORS.filter(
            (option) => !isBlackCoverColor(option.value),
          )}
          startInGradientMode
        />
        {coverColorPickerOpen && blackCoverWarningVisible ? (
          <div className="cover-color-warning" role="alert">
            <TriangleAlert aria-hidden="true" />
            <span>Our system can&apos;t handle pure black covers</span>
          </div>
        ) : null}
        {notice ? <div className="notice">{notice}</div> : null}
        </main>
      </>
    );
  }

  if (view === "preview" || view === "published") {
    const isPublished = view === "published";
    const publishedBlocks =
      isPublished && openedPublishedStrip
        ? openedPublishedStrip.blocks
        : blocks;
    if (isPublished) {
      return (
        <>
          {legacyTransitionLayer}
          <main
            className={`app-shell reader-mode published-mode ${
              hasLeadingImage ? "has-leading-image" : ""
            }`}
          >
            <div
              className={`top-safe-area-anchor ${legacyPageEnterClass}`}
              style={{ backgroundColor: topSafeAreaColor }}
              aria-hidden="true"
            />

            <article className={`published-strip ${legacyPageEnterClass}`}>
              {renderStrip(false, publishedBlocks)}
            </article>
            {notice ? <div className="notice">{notice}</div> : null}
          </main>
        </>
      );
    }
    return (
      <>
        {legacyTransitionLayer}
        <main
          className={`app-shell reader-mode ${
            isPublished ? "published-mode" : "preview-mode"
          } ${hasLeadingImage ? "has-leading-image" : ""}`}
        >
        <div
          className={`top-safe-area-anchor ${legacyPageEnterClass}`}
          style={{ backgroundColor: topSafeAreaColor }}
          aria-hidden="true"
        />
        {isPublished ? (
          <header className="topbar reader-topbar">
            <button
              className="text-action"
              type="button"
              onClick={() => {
                if (openedPublishedStrip) {
                  void returnToLibraryFromPublished();
                  return;
                }
                changeViewWithDockTransition("edit");
              }}
            >
              {openedPublishedStrip ? "Back" : "Edit"}
            </button>
            <span className="wordmark">STRIP</span>
            <button className="text-action" type="button" onClick={copyLink}>
              Share
            </button>
          </header>
        ) : null}

        <article className={`published-strip ${legacyPageEnterClass}`}>
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
          {renderStrip(false, publishedBlocks)}
          {isPublished ? (
            <footer className="reader-footer">
              <p>Get Antonio&apos;s next Strip.</p>
              <button type="button">Subscribe</button>
              <span>Make your own Strip</span>
            </footer>
          ) : null}
        </article>
        {!isPublished || dockTransition ? (
          <footer
            key="persistent-composer-dock"
            className="composer-dock preview-dock"
          >
            {dockTransitionLayer}
            {!isPublished ? (
              <div className={currentDockControlsClass} key={`dock-controls:${view}`}>
                <button
                  className="dock-icon-button"
                  type="button"
                  onClick={() => changeViewWithDockTransition("edit")}
                  aria-label="Return to editing"
                >
                  <Pencil className="dock-glyph" aria-hidden="true" />
                </button>
                <span className="dock-divider" aria-hidden="true" />
                <button
                  className="dock-icon-button publish-icon-button publish-strip-button"
                  type="button"
                  onClick={continueToPublish}
                  aria-label="Continue to cover"
                >
                  Continue
                </button>
              </div>
            ) : null}
          </footer>
        ) : null}
        {notice ? <div className="notice">{notice}</div> : null}
        </main>
      </>
    );
  }

  return (
    <>
      {legacyTransitionLayer}
      <main
        className={`app-shell editor-mode ${selectedBlockIndex >= 0 ? "has-block-toolbar" : ""} ${
          editingTextBlockId ? "is-typing" : ""
        } ${hasLeadingImage ? "has-leading-image" : ""}`}
      >
      <div
        className={`top-safe-area-anchor ${legacyPageEnterClass}`}
        style={{ backgroundColor: topSafeAreaColor }}
        aria-hidden="true"
      />
      <div className={`editor-canvas ${legacyPageEnterClass}`}>{renderStrip(true)}</div>

      {selectedBlock?.type === "text" ? (
        <TextStyleSelector
          block={selectedBlock}
          tool={activeTextTool ?? lastTextTool}
          visible={activeTextTool !== null}
          onChange={(change) => updateTextStyle(selectedBlock.id, change)}
          onBack={() => setActiveTextTool(null)}
        />
      ) : null}

      <footer
        key="persistent-composer-dock"
        className={`composer-dock main-composer-dock ${
          editorDockEntering ? "is-entering-editor" : ""
        } ${
          activeTextTool ? "is-shifted" : ""
        }`}
      >
        {dockTransitionLayer}
        <div className={currentDockControlsClass} key={`dock-controls:${view}`}>
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
          <button
            className="dock-icon-button"
            type="button"
            onClick={() => stickerInputRef.current?.click()}
            aria-label="Add sticker"
          >
            <Sticker className="dock-glyph" aria-hidden="true" />
          </button>
          <input
            ref={stickerInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={addSticker}
            aria-label="Choose a sticker image"
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
              changeViewWithDockTransition("preview");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <Eye className="dock-glyph" aria-hidden="true" />
          </button>
          <button
            className="dock-icon-button publish-icon-button publish-strip-button"
            type="button"
            onClick={continueToPublish}
            disabled={!hasContent}
            aria-label="Continue to cover"
          >
            Continue
          </button>
        </div>
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
                  : pendingDeleteBlock.type === "video"
                    ? "video"
                    : "sticker"} block?
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
    </>
  );
}
