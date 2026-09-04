"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Baseline,
  CaseUpper,
  Check,
  Crop,
  Eye,
  EyeOff,
  Files,
  GripHorizontal,
  House,
  History,
  ImagePlus,
  Link2,
  LogOut,
  Minus,
  Palette,
  PaintBucket,
  Pencil,
  Pipette,
  Plus,
  Send,
  Settings,
  Sticker,
  Trash2,
  Type,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  PUBLIC_DOMAIN,
  usernameFromHostname,
} from "@/app/lib/username";
import {
  DEFAULT_STRIP_ENDING_STYLE,
  type StripEndingStyle,
} from "@/app/lib/strip-ending";

type TextBlock = {
  id: string;
  type: "text";
  content: string;
  height?: number;
  cropTop?: number;
  cropBottom?: number;
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
  height?: number;
  cropTop?: number;
  cropBottom?: number;
};

type VideoBlock = {
  id: string;
  type: "video";
  src: string;
  alt: string;
  height?: number;
  cropTop?: number;
  cropBottom?: number;
  audioEnabled?: boolean;
  hasAudio?: boolean;
};

type StickerBlock = {
  id: string;
  type: "sticker";
  src: string;
  alt: string;
  mediaType?: "image" | "video";
  x: number;
  y: number;
  width: number;
  rotation?: number;
};

type StripBlock = TextBlock | ImageBlock | VideoBlock | StickerBlock;
type View =
  | "library"
  | "drafts"
  | "history"
  | "settings"
  | "edit"
  | "preview"
  | "publish-setup"
  | "title-setup"
  | "share"
  | "published";
type FontStyle = "sans" | "serif" | "mono" | "rounded" | "condensed" | "display" | "hand";
type TextTool = "font" | "background" | "color";
type EndingTool = "background" | "button";
type CoverColorShape = "portrait" | "square" | "landscape";
type PublishedCover =
  | { kind: "image"; src: string; alt: string; aspectRatio?: number }
  | { kind: "color"; color: string; shape: CoverColorShape };
type PublishedStripSummary = {
  id: string;
  username: string | null;
  title: string;
  cover: PublishedCover;
  publishedAt: number;
};
type ViewedStripSummary = PublishedStripSummary & {
  viewedAt: number;
};
type PublishedStripDetail = {
  id: string;
  username: string | null;
  title: string;
  cover: PublishedCover;
  publishedAt: number;
  blocks: StripBlock[];
  endingStyle: StripEndingStyle;
  viewerIsOwner: boolean;
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
  endingStyle: StripEndingStyle;
  publishedStripId: string | null;
  createdAt: number;
  updatedAt: number;
};
type AppRoute =
  | { kind: "library" }
  | { kind: "drafts" }
  | { kind: "history" }
  | { kind: "settings" }
  | { kind: "edit"; id: string }
  | { kind: "share"; id: string }
  | { kind: "published"; id: string; username?: string };
type AuthUser = { id: string; phoneLabel: string; username: string | null };
type AuthStatus = "loading" | "signed-out" | "signed-in";
type AuthStep = "landing" | "phone" | "code";
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
  layoutClass: string;
};
type HeightCropSession = {
  blockId: string;
  sourceHeight: number;
  initialTop: number;
  initialBottom: number;
  top: number;
  bottom: number;
};

const STORAGE_KEY = "strip-draft-v1";
const OWNER_STORAGE_KEY = "strip-owner-v1";
const DEFAULT_BACKGROUND = "#000000";
const DEFAULT_BLOCK_BACKGROUND = "#3155FF";
const DEFAULT_TEXT = "#FFFFFF";
const DEFAULT_FONT_SIZE = 18;
const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 72;
const FONT_SIZE_STEP = 2;
const PAGE_TRANSITION_DURATION_MS = 380;
const STANDARD_PAGE_TRANSITION_DURATION_MS = 240;
const DOCK_TRANSITION_DURATION_MS = 300;
const PUBLISHED_LOADING_MINIMUM_MS = 3000;
const PUBLISHED_MEDIA_LOAD_TIMEOUT_MS = 15000;
const PUBLISHED_LOADING_RELEASE_MS = 1200;
const KEYBOARD_SCROLL_SETTLE_MS = 90;
const KEYBOARD_SCROLL_RELEASE_MS = 420;
const STICKER_MIN_VISIBLE_PX = 44;
const STICKER_ENDING_BUTTON_BUFFER_PX = 18;
const MIN_CROPPED_BLOCK_HEIGHT = 44;
const STRIP_ENDING_BLOCK_ID = "strip-ending";
const INLINE_PREVIEW_HISTORY_KEY = "stripInlinePreview";
const AUTH_CODE_LENGTH = 6;

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
  { label: "Electric blue", value: DEFAULT_BLOCK_BACKGROUND },
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

function routeFromLocation(pathname: string, hostname: string): AppRoute {
  const editMatch = /^\/edit\/([a-zA-Z0-9_-]{8,128})\/?$/.exec(pathname);
  if (editMatch) return { kind: "edit", id: editMatch[1] };
  const shareMatch = /^\/share\/([a-zA-Z0-9_-]{8,128})\/?$/.exec(pathname);
  if (shareMatch) return { kind: "share", id: shareMatch[1] };
  const publishedMatch = /^\/strip\/([a-zA-Z0-9_-]{8,128})\/?$/.exec(pathname);
  if (publishedMatch) return { kind: "published", id: publishedMatch[1] };
  if (/^\/drafts\/?$/.test(pathname)) return { kind: "drafts" };
  if (/^\/history\/?$/.test(pathname)) return { kind: "history" };
  if (/^\/settings\/?$/.test(pathname)) return { kind: "settings" };
  const username = usernameFromHostname(hostname);
  const rootPublishedMatch = /^\/([a-zA-Z0-9_-]{8,128})\/?$/.exec(pathname);
  if (username && rootPublishedMatch) {
    return { kind: "published", id: rootPublishedMatch[1], username };
  }
  return { kind: "library" };
}

function publicStripUrl(strip: Pick<PublishedStripSummary, "id" | "username">) {
  const id = encodeURIComponent(strip.id);
  if (!strip.username) return `${window.location.origin}/strip/${id}`;
  const hostname = window.location.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${window.location.origin}/strip/${id}`;
  }
  return `https://${strip.username}.${PUBLIC_DOMAIN}/${id}`;
}

function mainAppOrigin() {
  const hostname = window.location.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".workers.dev") ||
    hostname.endsWith(".chatgpt.site")
  ) {
    return window.location.origin;
  }
  return `https://${PUBLIC_DOMAIN}`;
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

function pixelToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function cssColorToHex(color: string) {
  const match = color.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;
  const channels = match[1]
    .replace("/", " ")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (channels.length < 3 || channels.slice(0, 3).some(Number.isNaN)) return null;
  if (channels.length > 3 && channels[3] <= 0.01) return null;
  return pixelToHex(channels[0], channels[1], channels[2]);
}

const pageColorVideoFrames = new WeakMap<HTMLVideoElement, HTMLCanvasElement>();

function cachePageColorVideoFrame(video: HTMLVideoElement) {
  if (
    pageColorVideoFrames.has(video) ||
    video.readyState < 2 ||
    !video.videoWidth ||
    !video.videoHeight
  ) {
    return;
  }

  const maximumDimension = 1024;
  const scale = Math.min(
    1,
    maximumDimension / Math.max(video.videoWidth, video.videoHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    pageColorVideoFrames.set(video, canvas);
  } catch {
    pageColorVideoFrames.delete(video);
  }
}

function sampleMediaColorAtPoint(
  media: HTMLImageElement | HTMLVideoElement,
  clientX: number,
  clientY: number,
) {
  const bounds = media.getBoundingClientRect();
  const frozenFrame =
    media instanceof HTMLVideoElement ? pageColorVideoFrames.get(media) : null;
  const source = frozenFrame ?? media;
  const sourceWidth = frozenFrame
    ? frozenFrame.width
    : media instanceof HTMLImageElement
      ? media.naturalWidth
      : media.videoWidth;
  const sourceHeight = frozenFrame
    ? frozenFrame.height
    : media instanceof HTMLImageElement
      ? media.naturalHeight
      : media.videoHeight;
  if (!sourceWidth || !sourceHeight || !bounds.width || !bounds.height) return null;

  const sourceX = Math.min(
    sourceWidth - 1,
    Math.max(0, ((clientX - bounds.left) / bounds.width) * sourceWidth),
  );
  const sourceY = Math.min(
    sourceHeight - 1,
    Math.max(0, ((clientY - bounds.top) / bounds.height) * sourceHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  try {
    context.drawImage(source, sourceX, sourceY, 1, 1, 0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    return alpha > 8 ? pixelToHex(red, green, blue) : null;
  } catch {
    return null;
  }
}

function samplePageColorAtPoint(clientX: number, clientY: number) {
  const elements = document.elementsFromPoint(clientX, clientY).filter(
    (element) =>
      !element.closest(".selector-dock") &&
      !element.closest(".page-color-picker-indicator"),
  );
  const sampledMedia = new Set<HTMLImageElement | HTMLVideoElement>();

  for (const element of elements) {
    const media =
      element instanceof HTMLImageElement || element instanceof HTMLVideoElement
        ? element
        : element.closest(".video-block")?.querySelector<HTMLVideoElement>("video") ??
          element.closest(".image-block")?.querySelector<HTMLImageElement>("img");
    if (media && !sampledMedia.has(media)) {
      sampledMedia.add(media);
      const sampledColor = sampleMediaColorAtPoint(media, clientX, clientY);
      if (sampledColor) return sampledColor;
    }
  }

  for (const element of elements) {
    const backgroundColor = cssColorToHex(getComputedStyle(element).backgroundColor);
    if (backgroundColor) return backgroundColor;
  }

  return null;
}

type SwatchStyle = CSSProperties & { "--swatch-foreground": string };
type CoverCardStyle = CSSProperties & {
  "--cover-dim": number;
};
type BlockControlsStyle = CSSProperties & {
  "--block-controls-surface"?: string;
  "--block-controls-foreground"?: string;
  "--block-controls-image"?: string;
};
type StickerBlockStyle = CSSProperties & {
  "--sticker-rotation": string;
  "--sticker-counter-rotation": string;
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

function StripEndActions({
  primaryAction,
  primaryLabel,
  onPrimary,
  onShare,
}: {
  primaryAction: "edit" | "create";
  primaryLabel: string;
  onPrimary: () => void;
  onShare: () => void;
}) {
  return (
    <div className="strip-end-sheet-controls">
      <button
        className="strip-end-sheet-primary"
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onPrimary();
        }}
      >
        {primaryAction === "edit" ? (
          <Pencil aria-hidden="true" />
        ) : (
          <Plus aria-hidden="true" />
        )}
        <span>{primaryLabel}</span>
      </button>
      <button
        className="strip-end-sheet-share"
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onShare();
        }}
        aria-label="Share this Strip"
      >
        <Send aria-hidden="true" />
      </button>
    </div>
  );
}

function normalizeStoryColor(color: string, fallback = DEFAULT_BACKGROUND) {
  const compact = color.trim().replace("#", "");
  const expanded =
    compact.length === 3
      ? compact
          .split("")
          .map((channel) => `${channel}${channel}`)
          .join("")
      : compact;
  return /^[0-9a-f]{6}$/i.test(expanded) ? `#${expanded.toUpperCase()}` : fallback;
}

function colorWithAlpha(color: string, alpha: number) {
  const [red, green, blue] = colorChannels(normalizeStoryColor(color));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mixStoryColors(color: string, target: string, amount: number) {
  const sourceChannels = colorChannels(normalizeStoryColor(color));
  const targetChannels = colorChannels(normalizeStoryColor(target));
  const mixed = sourceChannels.map((channel, index) =>
    Math.round(channel + (targetChannels[index] - channel) * amount),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function storyPalette(strip: PublishedStripDetail) {
  const colors = strip.blocks.flatMap((block) =>
    block.type === "text" && block.backgroundColor
      ? [normalizeStoryColor(block.backgroundColor)]
      : [],
  );
  if (strip.cover.kind === "color") {
    colors.unshift(normalizeStoryColor(strip.cover.color));
  }
  return Array.from(new Set(colors)).slice(0, 4);
}

function loadStoryImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Story cover could not load"));
    image.src = src;
  });
}

function loadLibraryCoverAspectRatio(src: string) {
  return new Promise<number | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    let settled = false;
    const finish = (ratio: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(ratio);
    };
    const readRatio = () => {
      const ratio = image.naturalWidth / image.naturalHeight;
      finish(Number.isFinite(ratio) && ratio > 0 ? ratio : null);
    };
    const timeout = window.setTimeout(() => finish(null), 5000);
    image.onload = readRatio;
    image.onerror = () => finish(null);
    image.src = src;
    if (image.complete) readRatio();
  });
}

async function prepareLibrarySummaries<
  T extends PublishedStripSummary | DraftStripSummary | ViewedStripSummary,
>(items: T[]) {
  const preparedItems = [...items];
  await Promise.all(
    items.slice(0, 6).map(async (item, index) => {
      if (item.cover.kind !== "image") return;
      const aspectRatio = await loadLibraryCoverAspectRatio(item.cover.src);
      if (!aspectRatio) return;
      preparedItems[index] = {
        ...item,
        cover: { ...item.cover, aspectRatio },
      } as T;
    }),
  );
  return preparedItems;
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  const sourceWidth = imageRatio > targetRatio
    ? image.naturalHeight * targetRatio
    : image.naturalWidth;
  const sourceHeight = imageRatio > targetRatio
    ? image.naturalHeight
    : image.naturalWidth / targetRatio;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function drawCenteredStoryTitle(
  context: CanvasRenderingContext2D,
  title: string,
  centerX: number,
  top: number,
  maxWidth: number,
) {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !currentLine) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length === 2) break;
    }
  }
  if (currentLine && lines.length < 2) lines.push(currentLine);
  if (lines.length === 2 && words.join(" ") !== lines.join(" ")) {
    let lastLine = lines[1];
    while (lastLine.length > 1 && context.measureText(`${lastLine}…`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }
    lines[1] = `${lastLine.trimEnd()}…`;
  }
  lines.forEach((line, index) => context.fillText(line, centerX, top + index * 72));
}

async function createInstagramStoryAsset(strip: PublishedStripDetail) {
  const storyWidth = 1080;
  const storyHeight = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = storyWidth;
  canvas.height = storyHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Story canvas is unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const palette = storyPalette(strip);
  let coverImage: HTMLImageElement | null = null;
  if (strip.cover.kind === "image") {
    coverImage = await loadStoryImage(strip.cover.src);
  }

  const coverColor =
    strip.cover.kind === "color"
      ? normalizeStoryColor(strip.cover.color)
      : palette[0] ?? "#3155FF";
  const alternateColor = palette.find((color) => color !== coverColor);
  const backgroundColor =
    strip.cover.kind === "color"
      ? alternateColor ??
        mixStoryColors(
          coverColor,
          contrastColor(coverColor) === "#FFFFFF" ? "#FFFFFF" : "#000000",
          0.22,
        )
      : DEFAULT_BACKGROUND;

  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (coverImage) {
    context.save();
    context.filter = "blur(78px) saturate(0.92)";
    drawImageCover(context, coverImage, -110, -110, 1300, 2140);
    context.restore();
    context.fillStyle = "rgba(0, 0, 0, 0.44)";
    context.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    const wash = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    wash.addColorStop(0, colorWithAlpha(coverColor, 0.12));
    wash.addColorStop(0.62, "rgba(0, 0, 0, 0)");
    wash.addColorStop(1, colorWithAlpha(contrastColor(backgroundColor), 0.08));
    context.fillStyle = wash;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const foreground = coverImage ? "#FFFFFF" : contrastColor(backgroundColor);
  context.fillStyle = foreground;
  context.textBaseline = "top";
  context.textAlign = "left";
  context.font = '700 38px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
  context.letterSpacing = "5px";
  context.fillText("STRIP", 72, 64);
  context.letterSpacing = "0px";

  const maxCoverWidth = 820;
  const maxCoverHeight = 760;
  let coverWidth = maxCoverWidth;
  let coverHeight = 730;
  if (coverImage) {
    const ratio = coverImage.naturalWidth / coverImage.naturalHeight;
    coverWidth = Math.min(maxCoverWidth, maxCoverHeight * ratio);
    coverHeight = coverWidth / ratio;
    if (coverHeight > maxCoverHeight) {
      coverHeight = maxCoverHeight;
      coverWidth = coverHeight * ratio;
    }
  } else if (strip.cover.kind === "color") {
    if (strip.cover.shape === "portrait") {
      coverWidth = 570;
      coverHeight = 760;
    } else if (strip.cover.shape === "landscape") {
      coverWidth = 820;
      coverHeight = 590;
    } else {
      coverWidth = 730;
      coverHeight = 730;
    }
  }
  const coverX = (canvas.width - coverWidth) / 2;
  const coverY = 150;
  if (coverImage) {
    context.drawImage(coverImage, coverX, coverY, coverWidth, coverHeight);
  } else {
    context.fillStyle = coverColor;
    context.fillRect(coverX, coverY, coverWidth, coverHeight);
  }

  const titleTop = Math.min(storyHeight - 205, coverY + coverHeight + 52);
  context.fillStyle = foreground;
  context.textAlign = "center";
  context.font = '600 56px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
  drawCenteredStoryTitle(
    context,
    strip.title.trim() || "Untitled",
    canvas.width / 2,
    titleTop,
    870,
  );

  const accentColors = palette.length > 0 ? palette : [coverColor];
  const accentWidth = canvas.width / accentColors.length;
  accentColors.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect(index * accentWidth, storyHeight - 14, accentWidth + 1, 14);
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Story image failed"))),
      "image/png",
    );
  });
  return blob;
}

function sampleVisualBottomColor(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
) {
  if (!sourceWidth || !sourceHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 8;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  const sampledHeight = Math.max(1, Math.round(sourceHeight * 0.06));
  try {
    context.drawImage(
      source,
      0,
      sourceHeight - sampledHeight,
      sourceWidth,
      sampledHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let weight = 0;

    for (let offset = 0; offset < pixels.length; offset += 4) {
      const alpha = pixels[offset + 3] / 255;
      if (alpha < 0.1) continue;
      red += pixels[offset] * alpha;
      green += pixels[offset + 1] * alpha;
      blue += pixels[offset + 2] * alpha;
      weight += alpha;
    }

    if (!weight) return null;
    const toHex = (channel: number) =>
      Math.round(channel / weight)
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
  } catch {
    return null;
  }
}

function sampleImageBottomColor(image: HTMLImageElement) {
  return sampleVisualBottomColor(image, image.naturalWidth, image.naturalHeight);
}

function sampleVideoBottomColor(video: HTMLVideoElement) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  return sampleVisualBottomColor(video, video.videoWidth, video.videoHeight);
}

type VideoAudioProbe = HTMLVideoElement & {
  audioTracks?: { length: number };
  mozHasAudio?: boolean;
  webkitAudioDecodedByteCount?: number;
};

function detectVideoAudio(video: HTMLVideoElement) {
  const probe = video as VideoAudioProbe;
  if (probe.audioTracks && typeof probe.audioTracks.length === "number") {
    return probe.audioTracks.length > 0;
  }
  if (typeof probe.mozHasAudio === "boolean") return probe.mozHasAudio;
  if (
    typeof probe.webkitAudioDecodedByteCount === "number" &&
    probe.webkitAudioDecodedByteCount > 0
  ) {
    return true;
  }
  return null;
}

function swatchStyle(color: string): SwatchStyle {
  const foreground = contrastColor(color);
  return {
    backgroundColor: color,
    color: foreground,
    "--swatch-foreground": foreground,
  };
}

function keepFocusedTextBlockVisible(behavior: ScrollBehavior = "smooth") {
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
  const visibleSelectionBottom = Array.from(
    block.querySelectorAll<HTMLElement>(
      ".block-controls, .block-controls-under-edge",
    ),
  ).reduce(
    (bottom, element) => Math.max(bottom, element.getBoundingClientRect().bottom),
    block.getBoundingClientRect().bottom,
  );
  const availableBottom = viewport.offsetTop + viewport.height - 16;
  const overflow = visibleSelectionBottom - availableBottom;
  if (overflow > 0) {
    window.scrollBy({ top: overflow + 12, left: 0, behavior });
  }
}

function resolveBlockHeightCrop(
  block: ImageBlock | VideoBlock,
  session: HeightCropSession | null,
) {
  const activeSession = session?.blockId === block.id ? session : null;
  const sourceHeight = Math.max(0, activeSession?.sourceHeight ?? block.height ?? 0);
  const maxCrop = Math.max(0, sourceHeight - MIN_CROPPED_BLOCK_HEIGHT);
  const top = Math.min(
    maxCrop,
    Math.max(0, activeSession?.top ?? block.cropTop ?? 0),
  );
  const bottom = Math.min(
    Math.max(0, maxCrop - top),
    Math.max(0, activeSession?.bottom ?? block.cropBottom ?? 0),
  );
  const isActive = Boolean(activeSession) || top > 0 || bottom > 0;

  return {
    top,
    bottom,
    sourceHeight,
    height: isActive && sourceHeight > 0 ? sourceHeight - top - bottom : undefined,
    isActive,
    isEditing: Boolean(activeSession),
  };
}

function focusSelectedBlockWithToolbar(
  blockId: string,
  behavior: ScrollBehavior = "smooth",
) {
  const element = document.querySelector<HTMLElement>(
    `.editor-mode .strip-block[data-block-id="${blockId}"]`,
  );
  if (
    !element ||
    element.matches(".is-height-cropping") ||
    element.querySelector("textarea:focus")
  ) {
    return;
  }

  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const viewportBottom = viewportTop + viewportHeight;
  const bounds = element.getBoundingClientRect();
  const toolbarReveal = element.querySelector<HTMLElement>(
    ".block-controls-reveal",
  );
  const stickerControl = element.querySelector<HTMLElement>(
    ".sticker-delete-control",
  );
  const stickerControlBounds = stickerControl?.getBoundingClientRect();
  const toolbarTop = toolbarReveal
    ? bounds.top + toolbarReveal.offsetTop
    : stickerControlBounds?.top ?? bounds.bottom;
  const toolbarBottom = toolbarReveal
    ? bounds.top + toolbarReveal.offsetTop + toolbarReveal.offsetHeight
    : stickerControlBounds?.bottom ?? bounds.bottom;

  const dock = document.querySelector<HTMLElement>(".main-composer-dock");
  const dockBounds = dock?.getBoundingClientRect();
  const dockIsVisible = Boolean(
    dockBounds && dockBounds.top < viewportBottom && dockBounds.bottom > viewportTop,
  );
  const availableBottom = Math.min(
    viewportBottom - 20,
    dockIsVisible && dockBounds ? dockBounds.top - 16 : viewportBottom - 20,
  );
  const toolbarIsFullyVisible =
    toolbarTop >= viewportTop + 12 && toolbarBottom <= availableBottom;
  if (toolbarIsFullyVisible) return;

  const centeredDelta =
    bounds.top + bounds.height / 2 - (viewportTop + viewportHeight / 2);
  const centeredToolbarBottom = toolbarBottom - centeredDelta;
  const scrollDelta =
    centeredToolbarBottom <= availableBottom
      ? centeredDelta
      : toolbarBottom - availableBottom;

  if (Math.abs(scrollDelta) < 1) return;
  window.scrollTo({
    top: Math.max(0, window.scrollY + scrollDelta),
    left: 0,
    behavior,
  });
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
  onHeightCrop,
  onEndingTool,
  activeEndingTool,
  onVideoAudio,
  videoMuted,
  surfaceColor,
  imageSrc,
  stickerRotation,
  showTopEdge = true,
  closing = false,
}: {
  index: number;
  count: number;
  onMove?: (direction: -1 | 1) => void;
  onRemove?: () => void;
  onTextTool?: (tool: TextTool) => void;
  activeTextTool?: TextTool | null;
  onHeightCrop?: () => void;
  onEndingTool?: (tool: EndingTool) => void;
  activeEndingTool?: EndingTool | null;
  onVideoAudio?: () => void;
  videoMuted?: boolean;
  surfaceColor?: string;
  imageSrc?: string;
  stickerRotation?: number;
  showTopEdge?: boolean;
  closing?: boolean;
}) {
  const trayClass = onEndingTool
    ? "is-ending-tray"
    : onTextTool
    ? "is-text-tray"
    : onVideoAudio
      ? "is-video-tray"
      : onMove
        ? "is-media-tray"
        : "is-single-action-tray";
  const edgeRef = useRef<SVGSVGElement>(null);
  const [edgeWidth, setEdgeWidth] = useState(0);
  const trayWidth = onEndingTool
    ? 160
    : onTextTool
      ? 336
      : onVideoAudio
        ? 264
        : onMove
          ? 220
          : 80;
  const edgeStart = Math.max(0, (edgeWidth - trayWidth) / 2);
  const edgeEnd = edgeStart + trayWidth;
  const edgePath = edgeWidth
    ? [
        `M 0 0 H ${edgeStart}`,
        `C ${edgeStart + 7} 0 ${edgeStart + 12} 5 ${edgeStart + 12} 12`,
        `V 30 C ${edgeStart + 12} 44 ${edgeStart + 24} 56 ${edgeStart + 38} 56`,
        `H ${edgeEnd - 38}`,
        `C ${edgeEnd - 24} 56 ${edgeEnd - 12} 44 ${edgeEnd - 12} 30`,
        `V 12 C ${edgeEnd - 12} 5 ${edgeEnd - 7} 0 ${edgeEnd} 0`,
        `H ${edgeWidth}`,
      ].join(" ")
    : "";
  const style: BlockControlsStyle | undefined =
    surfaceColor || imageSrc
      ? {
          "--block-controls-surface": surfaceColor ?? "#ffffff",
          "--block-controls-foreground": contrastColor(surfaceColor ?? "#ffffff"),
          ...(imageSrc
            ? { "--block-controls-image": `url(${JSON.stringify(imageSrc)})` }
            : {}),
        }
      : undefined;

  useLayoutEffect(() => {
    const edge = edgeRef.current;
    if (!edge || stickerRotation !== undefined) return;

    const measure = () => setEdgeWidth(edge.getBoundingClientRect().width);
    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(edge);
    return () => observer.disconnect();
  }, [stickerRotation]);

  if (stickerRotation !== undefined) {
    return (
      <div
        className="sticker-delete-orbit"
        aria-label="Sticker controls"
      >
        <div className="sticker-delete-anchor">
          <button
            className="sticker-delete-control"
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onRemove?.();
            }}
            aria-label="Delete sticker"
          >
            <Trash2 className="block-glyph" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {showTopEdge ? (
        <span
          className="block-controls-top-edge"
          style={style}
          aria-hidden="true"
        />
      ) : null}
      <div
        className={`block-controls-reveal ${closing ? "is-closing" : ""}`}
        style={style}
      >
        <div
          className={`block-controls ${trayClass} ${imageSrc ? "has-image-surface" : ""}`}
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
          </>
        ) : null}
        {onEndingTool ? (
          <>
            <button
              type="button"
              className={activeEndingTool === "background" ? "is-active" : ""}
              onClick={() => onEndingTool("background")}
              aria-label="Choose ending background color"
              aria-pressed={activeEndingTool === "background"}
            >
              <PaintBucket className="block-glyph" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={activeEndingTool === "button" ? "is-active" : ""}
              onClick={() => onEndingTool("button")}
              aria-label="Choose ending button color"
              aria-pressed={activeEndingTool === "button"}
            >
              <Link2 className="block-glyph" aria-hidden="true" />
            </button>
          </>
        ) : null}
        {onVideoAudio ? (
          <button
            type="button"
            onClick={onVideoAudio}
            aria-label={videoMuted ? "Turn video sound on" : "Turn video sound off"}
            aria-pressed={!videoMuted}
          >
            {videoMuted ? (
              <VolumeX className="block-glyph" aria-hidden="true" />
            ) : (
              <Volume2 className="block-glyph" aria-hidden="true" />
            )}
          </button>
        ) : null}
        {onHeightCrop ? (
          <button
            type="button"
            onClick={onHeightCrop}
            aria-label="Crop block height"
          >
            <Crop className="block-glyph" aria-hidden="true" />
          </button>
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
          {onRemove ? (
            <button type="button" onClick={onRemove} aria-label="Delete block">
              <Trash2 className="block-glyph" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <svg
          ref={edgeRef}
          className={`block-controls-under-edge ${trayClass}`}
          viewBox={`0 0 ${edgeWidth || 1} 58`}
          preserveAspectRatio="none"
          shapeRendering="geometricPrecision"
          aria-hidden="true"
        >
          <path
            d={edgePath}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </>
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
  const fontSizeRef = useRef(fontSize);
  const fontSizeRepeatDelayRef = useRef<number | null>(null);
  const fontSizeRepeatIntervalRef = useRef<number | null>(null);
  const fontSizeDidRepeatRef = useRef(false);
  const pageColorPointerIdRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const [gradientMode, setGradientMode] = useState<TextTool | null>(null);
  const [pageColorMode, setPageColorMode] = useState<TextTool | null>(null);
  const [pageColorDragging, setPageColorDragging] = useState(false);
  const [pageColorPoint, setPageColorPoint] = useState<{
    x: number;
    y: number;
    color: string;
  } | null>(null);
  const pageColorPointRef = useRef<typeof pageColorPoint>(pageColorPoint);
  pageColorPointRef.current = pageColorPoint;
  fontSizeRef.current = fontSize;
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

  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setGradientMode(startInGradientMode && tool !== "font" ? tool : null);
    setPageColorMode(null);
    setPageColorDragging(false);
    setPageColorPoint(null);
  }, [startInGradientMode, tool, visible]);

  useEffect(() => {
    if (!visible || pageColorMode !== tool || tool === "font") return;
    const root = document.documentElement;
    const pausedVideos = Array.from(document.querySelectorAll<HTMLVideoElement>("video")).map(
      (video) => ({ video, wasPlaying: !video.paused }),
    );
    pausedVideos.forEach(({ video }) => {
      cachePageColorVideoFrame(video);
      video.pause();
    });
    root.classList.add("page-color-picking");
    const focusedTextField = document.activeElement;
    if (
      (focusedTextField instanceof HTMLInputElement ||
        focusedTextField instanceof HTMLTextAreaElement) &&
      focusedTextField.selectionEnd !== null
    ) {
      focusedTextField.setSelectionRange(
        focusedTextField.selectionEnd,
        focusedTextField.selectionEnd,
      );
    }
    window.getSelection()?.removeAllRanges();

    const targetIsPickerControl = (event: Event) =>
      event.target instanceof Element &&
      Boolean(event.target.closest(".selector-dock, .block-controls"));
    const preventTextSelection = (event: Event) => event.preventDefault();
    const pickerIndicatorForEvent = (event: Event) =>
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(".page-color-picker-indicator")
        : null;
    const sampleAtPoint = (clientX: number, clientY: number) => {
      const color = samplePageColorAtPoint(clientX, clientY);
      if (!color) return;
      const x = clientX + window.scrollX;
      const y = clientY + window.scrollY;
      const currentPoint = pageColorPointRef.current;
      if (
        currentPoint?.x === x &&
        currentPoint.y === y &&
        currentPoint.color === color
      ) {
        return;
      }
      const nextPoint = { x, y, color };
      pageColorPointRef.current = nextPoint;
      setPageColorPoint(nextPoint);
      onChangeRef.current(
        tool === "background" ? { backgroundColor: color } : { textColor: color },
      );
    };
    const sampleAtPointer = (event: PointerEvent) => {
      sampleAtPoint(event.clientX, event.clientY);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (targetIsPickerControl(event)) return;
      const pickerIndicator = pickerIndicatorForEvent(event);
      if (!pickerIndicator) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      pickerIndicator.setPointerCapture(event.pointerId);
      pageColorPointerIdRef.current = event.pointerId;
      setPageColorDragging(true);
      sampleAtPointer(event);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (pageColorPointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      sampleAtPointer(event);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (pageColorPointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      sampleAtPointer(event);
      pageColorPointerIdRef.current = null;
      setPageColorDragging(false);
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (pageColorPointerIdRef.current === event.pointerId) {
        pageColorPointerIdRef.current = null;
        setPageColorDragging(false);
      }
    };
    const handleLostPointerCapture = (event: PointerEvent) => {
      if (pageColorPointerIdRef.current === event.pointerId) {
        pageColorPointerIdRef.current = null;
        setPageColorDragging(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, {
      capture: true,
      passive: false,
    });
    document.addEventListener("pointermove", handlePointerMove, {
      capture: true,
      passive: false,
    });
    document.addEventListener("pointerup", handlePointerUp, {
      capture: true,
      passive: false,
    });
    document.addEventListener("pointercancel", handlePointerCancel, true);
    document.addEventListener("lostpointercapture", handleLostPointerCapture, true);
    document.addEventListener("selectstart", preventTextSelection, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handlePointerCancel, true);
      document.removeEventListener("lostpointercapture", handleLostPointerCapture, true);
      document.removeEventListener("selectstart", preventTextSelection, true);
      pageColorPointerIdRef.current = null;
      root.classList.remove("page-color-picking");
      pausedVideos.forEach(({ video, wasPlaying }) => {
        pageColorVideoFrames.delete(video);
        if (wasPlaying) void video.play().catch(() => {});
      });
    };
  }, [pageColorMode, tool, visible]);

  useEffect(() => {
    if (!visible) return;
    const frame = window.requestAnimationFrame(() => {
      if (selectorScrollRef.current) selectorScrollRef.current.scrollLeft = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tool, visible]);

  useEffect(
    () => () => {
      if (fontSizeRepeatDelayRef.current !== null) {
        window.clearTimeout(fontSizeRepeatDelayRef.current);
      }
      if (fontSizeRepeatIntervalRef.current !== null) {
        window.clearInterval(fontSizeRepeatIntervalRef.current);
      }
    },
    [],
  );

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

  const changeFontSize = (direction: -1 | 1) => {
    const currentSize = fontSizeRef.current;
    const nextSize = Math.min(
      MAX_FONT_SIZE,
      Math.max(MIN_FONT_SIZE, currentSize + direction * FONT_SIZE_STEP),
    );
    if (nextSize === currentSize) {
      stopFontSizeRepeat();
      return;
    }
    fontSizeRef.current = nextSize;
    onChange({ fontSize: nextSize });
    if (nextSize === MIN_FONT_SIZE || nextSize === MAX_FONT_SIZE) {
      stopFontSizeRepeat();
    }
  };

  const stopFontSizeRepeat = () => {
    if (fontSizeRepeatDelayRef.current !== null) {
      window.clearTimeout(fontSizeRepeatDelayRef.current);
      fontSizeRepeatDelayRef.current = null;
    }
    if (fontSizeRepeatIntervalRef.current !== null) {
      window.clearInterval(fontSizeRepeatIntervalRef.current);
      fontSizeRepeatIntervalRef.current = null;
    }
  };

  const startFontSizeRepeat = (
    event: ReactPointerEvent<HTMLButtonElement>,
    direction: -1 | 1,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    stopFontSizeRepeat();
    fontSizeDidRepeatRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    fontSizeRepeatDelayRef.current = window.setTimeout(() => {
      fontSizeDidRepeatRef.current = true;
      changeFontSize(direction);
      fontSizeRepeatIntervalRef.current = window.setInterval(
        () => changeFontSize(direction),
        72,
      );
    }, 320);
  };

  const finishFontSizeRepeat = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const repeated = fontSizeDidRepeatRef.current;
    stopFontSizeRepeat();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (repeated) {
      window.setTimeout(() => {
        fontSizeDidRepeatRef.current = false;
      }, 0);
    }
  };

  const activateFontSizeStep = (direction: -1 | 1) => {
    if (fontSizeDidRepeatRef.current) {
      fontSizeDidRepeatRef.current = false;
      return;
    }
    changeFontSize(direction);
  };

  const pageColorPickerActive = pageColorMode === tool && tool !== "font";
  const startPageColorPicker = (nextTool: TextTool) => {
    document
      .querySelectorAll<HTMLVideoElement>("video")
      .forEach(cachePageColorVideoFrame);
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const dockTop =
      document.querySelector<HTMLElement>(".selector-dock")?.getBoundingClientRect().top ??
      viewportTop + (viewport?.height ?? window.innerHeight);
    const x = viewportLeft + viewportWidth / 2;
    const y = viewportTop + Math.max(72, dockTop - viewportTop) / 2;
    const color = samplePageColorAtPoint(x, y) ?? activeColor;
    const nextPoint = {
      x: x + window.scrollX,
      y: y + window.scrollY,
      color,
    };
    setGradientMode(null);
    setPageColorMode(nextTool);
    pageColorPointRef.current = nextPoint;
    setPageColorPoint(nextPoint);
    onChangeRef.current(
      nextTool === "background" ? { backgroundColor: color } : { textColor: color },
    );
  };
  const finishStyleSelection = () => {
    setGradientMode(null);
    setPageColorMode(null);
    setPageColorDragging(false);
    setPageColorPoint(null);
    onBack();
  };

  return (
    <>
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

        {gradientMode !== tool && !pageColorPickerActive && tool === "font"
          ? [
              <div className="font-size-stepper" role="group" aria-label="Font size" key="font-size">
                <button
                  type="button"
                  onPointerDown={(event) => startFontSizeRepeat(event, -1)}
                  onPointerUp={finishFontSizeRepeat}
                  onPointerCancel={(event) => {
                    finishFontSizeRepeat(event);
                    fontSizeDidRepeatRef.current = false;
                  }}
                  onClick={() => activateFontSizeStep(-1)}
                  onContextMenu={(event) => event.preventDefault()}
                  disabled={fontSize <= MIN_FONT_SIZE}
                  tabIndex={visible ? 0 : -1}
                  aria-label="Decrease font size"
                >
                  <Minus aria-hidden="true" />
                </button>
                <output aria-label={`${fontSize} pixels`}>{fontSize}</output>
                <button
                  type="button"
                  onPointerDown={(event) => startFontSizeRepeat(event, 1)}
                  onPointerUp={finishFontSizeRepeat}
                  onPointerCancel={(event) => {
                    finishFontSizeRepeat(event);
                    fontSizeDidRepeatRef.current = false;
                  }}
                  onClick={() => activateFontSizeStep(1)}
                  onContextMenu={(event) => event.preventDefault()}
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
                  className={`selector-option color-selector-option color-swatch-option ${selected ? "is-selected" : ""}`}
                  style={swatchStyle(option.value)}
                  onClick={() => {
                    setPageColorMode(null);
                    onChange({
                      backgroundColor: option.value,
                      ...(block.content.length === 0
                        ? { textColor: contrastColor(option.value) }
                        : {}),
                    });
                  }}
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
          <>
            <button
              type="button"
              className="selector-option color-selector-option gradient-trigger"
              onClick={() => {
                setPageColorMode(null);
                setGradientMode("background");
              }}
              tabIndex={visible ? 0 : -1}
              aria-label="Open the background color wheel"
            >
              <Palette aria-hidden="true" />
            </button>
            <button
              type="button"
              className="selector-option color-selector-option page-color-trigger"
              style={swatchStyle(background)}
              onClick={() => startPageColorPicker("background")}
              tabIndex={visible ? 0 : -1}
              aria-label="Match a background color from the page"
              aria-pressed={pageColorPickerActive}
            >
              <Pipette aria-hidden="true" />
            </button>
          </>
        ) : null}

        {gradientMode !== tool && tool === "color"
          ? textColorOptions.map((option) => {
              const selected = textColor.toUpperCase() === option.value.toUpperCase();
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`selector-option color-selector-option color-swatch-option ${selected ? "is-selected" : ""}`}
                  style={swatchStyle(option.value)}
                  onClick={() => {
                    setPageColorMode(null);
                    onChange({ textColor: option.value });
                  }}
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
          <>
            <button
              type="button"
              className="selector-option color-selector-option gradient-trigger"
              onClick={() => {
                setPageColorMode(null);
                setGradientMode("color");
              }}
              tabIndex={visible ? 0 : -1}
              aria-label="Open the text color wheel"
            >
              <Palette aria-hidden="true" />
            </button>
            <button
              type="button"
              className="selector-option color-selector-option page-color-trigger"
              style={swatchStyle(textColor)}
              onClick={() => startPageColorPicker("color")}
              tabIndex={visible ? 0 : -1}
              aria-label="Match a text color from the page"
              aria-pressed={pageColorPickerActive}
            >
              <Pipette aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
      <div className="selector-leading">
        <button
          className="dock-icon-button selector-back-button"
          type="button"
          onClick={finishStyleSelection}
          disabled={doneDisabled}
          tabIndex={visible ? 0 : -1}
          aria-label="Done choosing styles"
        >
          <Check className="dock-glyph" aria-hidden="true" />
        </button>
      </div>
      </footer>
      {pageColorPickerActive && pageColorPoint && typeof document !== "undefined"
        ? createPortal(
            <span
              className={`page-color-picker-indicator ${
                pageColorDragging ? "is-dragging" : ""
              }`}
              style={{
                left: `${pageColorPoint.x}px`,
                top: `${pageColorPoint.y}px`,
                color: pageColorPoint.color,
              }}
              aria-hidden="true"
            >
              <span className="page-color-picker-indicator-core" />
            </span>,
            document.body,
          )
        : null}
    </>
  );
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

function BlockHeightReporter({
  blockId,
  onHeight,
}: {
  blockId: string;
  onHeight: (blockId: string, height: number) => void;
}) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const onHeightRef = useRef(onHeight);
  onHeightRef.current = onHeight;

  useLayoutEffect(() => {
    const block = markerRef.current?.parentElement;
    if (!block) return;

    const report = () => {
      const height = Math.round(block.getBoundingClientRect().height);
      if (height > 0) onHeightRef.current(blockId, height);
    };

    report();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", report);
      return () => window.removeEventListener("resize", report);
    }

    const observer = new ResizeObserver(report);
    observer.observe(block);
    return () => observer.disconnect();
  }, [blockId]);

  return <span ref={markerRef} hidden aria-hidden="true" />;
}

function StripVideoBlock({
  block,
  isEditing,
  isSelected,
  onSelect,
  muted,
  showAudioToggle,
  onToggleAudio,
  onAudioPresence,
  onFirstFrameColor,
  shouldLoad,
  isLoaded,
  loadSettled,
  loadBeforeReveal,
  reservedHeight,
  onLoadSettled,
  onHeight,
  controls,
  cropTop = 0,
  cropSourceHeight,
  cropEditing = false,
  croppedHeight,
  heightCropHandles,
}: {
  block: VideoBlock;
  isEditing: boolean;
  isSelected: boolean;
  onSelect: () => void;
  muted: boolean;
  showAudioToggle: boolean;
  onToggleAudio: () => void;
  onAudioPresence?: (hasAudio: boolean) => void;
  onFirstFrameColor?: (color: string) => void;
  shouldLoad: boolean;
  isLoaded: boolean;
  loadSettled: boolean;
  loadBeforeReveal: boolean;
  reservedHeight?: number;
  onLoadSettled: (loaded: boolean) => void;
  onHeight?: (blockId: string, height: number) => void;
  controls?: ReactNode;
  cropTop?: number;
  cropSourceHeight?: number;
  cropEditing?: boolean;
  croppedHeight?: number;
  heightCropHandles?: ReactNode;
}) {
  const cropViewportHeight = cropEditing ? cropSourceHeight : croppedHeight;
  const videoRef = useRef<HTMLVideoElement>(null);
  const tapGestureRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const reportAudioPresence = (video: HTMLVideoElement) => {
    const hasAudio = detectVideoAudio(video);
    if (hasAudio !== null) onAudioPresence?.(hasAudio);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) return;
    video.muted = muted;
    if (loadBeforeReveal && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      video.load();
    }
  }, [block.src, loadBeforeReveal, muted, shouldLoad]);

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
  }, [block.src, shouldLoad]);

  return (
    <figure
      className={`strip-block video-block ${isEditing ? "is-editing" : ""} ${
        isEditing && isSelected ? "is-selected" : ""
      } ${croppedHeight !== undefined ? "is-height-cropped" : ""} ${
        heightCropHandles ? "is-height-cropping" : ""
      }`}
      data-block-id={block.id}
      aria-busy={!loadSettled}
      style={
        !loadSettled && reservedHeight && croppedHeight === undefined
          ? { minHeight: reservedHeight }
          : undefined
      }
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
      <div
        className="block-crop-viewport"
        style={
          cropViewportHeight !== undefined
            ? { height: `${cropViewportHeight}px` }
            : undefined
        }
      >
        <div
          className="block-crop-content"
          style={
            !cropEditing && cropTop
              ? { transform: `translateY(${-cropTop}px)` }
              : undefined
          }
        >
          <video
            ref={videoRef}
            src={shouldLoad ? block.src : undefined}
            aria-label={block.alt ? `Video: ${block.alt}` : "Strip video"}
            autoPlay
            muted={muted}
            loop
            playsInline
            controls={false}
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            preload={shouldLoad ? (loadBeforeReveal ? "auto" : "metadata") : "none"}
            draggable={false}
            style={{
              display: loadSettled && !isLoaded ? "none" : undefined,
              visibility: isLoaded ? "visible" : "hidden",
            }}
            onLoadedData={(event) => {
              onLoadSettled(true);
              const sampledColor = sampleVideoBottomColor(event.currentTarget);
              if (sampledColor) onFirstFrameColor?.(sampledColor);
              reportAudioPresence(event.currentTarget);
            }}
            onLoadedMetadata={(event) => reportAudioPresence(event.currentTarget)}
            onCanPlay={(event) => reportAudioPresence(event.currentTarget)}
            onTimeUpdate={(event) => reportAudioPresence(event.currentTarget)}
            onError={() => onLoadSettled(false)}
          />
          {onHeight ? <BlockHeightReporter blockId={block.id} onHeight={onHeight} /> : null}
        </div>
      </div>
      {controls}
      {heightCropHandles}
      {showAudioToggle ? (
        <button
          className="video-audio-toggle"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleAudio();
          }}
          aria-label={muted ? "Turn video sound on" : "Turn video sound off"}
          aria-pressed={!muted}
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </button>
      ) : null}
    </figure>
  );
}

function StripStickerBlock({
  block,
  isEditing,
  isSelected,
  isOverlappingSelection,
  onTapSelectedText,
  onSelect,
  onTransform,
  onLowerBoundaryAttempt,
  onLoadSettled,
  controls,
}: {
  block: StickerBlock;
  isEditing: boolean;
  isSelected: boolean;
  isOverlappingSelection: boolean;
  onTapSelectedText: (
    clientX: number,
    clientY: number,
    stickerElement: HTMLElement,
  ) => boolean;
  onSelect: () => void;
  onTransform: (
    transform: Pick<StickerBlock, "x" | "y" | "width"> & { rotation: number },
  ) => void;
  onLowerBoundaryAttempt: () => void;
  onLoadSettled?: (loaded: boolean) => void;
  controls?: ReactNode;
}) {
  const stickerElementRef = useRef<HTMLElement>(null);
  const liveBlockRef = useRef(block);
  const selectionTapRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    moved: boolean;
  } | null>(null);
  const activePointersRef = useRef(
    new Map<number, { clientX: number; clientY: number }>(),
  );
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    canvasWidth: number;
    canvasHeight: number;
  } | null>(null);
  const transformRef = useRef<{
    distance: number;
    angle: number;
    midpointX: number;
    midpointY: number;
    x: number;
    y: number;
    width: number;
    rotation: number;
    canvasWidth: number;
    canvasHeight: number;
  } | null>(null);
  const canvasTouchTransformRef = useRef<{
    distance: number;
    angle: number;
    midpointX: number;
    midpointY: number;
    x: number;
    y: number;
    width: number;
    rotation: number;
    canvasWidth: number;
    canvasHeight: number;
  } | null>(null);
  const canvasTouchDragRef = useRef<{
    touchId: number;
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    width: number;
    rotation: number;
    canvasWidth: number;
    canvasHeight: number;
  } | null>(null);
  const lowerBoundaryNoticeShownRef = useRef(false);
  const [isTransforming, setIsTransforming] = useState(false);

  useEffect(() => {
    if (
      activePointersRef.current.size === 0 &&
      !canvasTouchTransformRef.current &&
      !canvasTouchDragRef.current
    ) {
      liveBlockRef.current = block;
    }
  }, [block]);

  const renderedBlock =
    activePointersRef.current.size > 0 ||
    canvasTouchTransformRef.current ||
    canvasTouchDragRef.current
      ? liveBlockRef.current
      : block;

  const previewTransform = (
    transform: Pick<StickerBlock, "x" | "y" | "width"> & { rotation: number },
  ) => {
    liveBlockRef.current = { ...liveBlockRef.current, ...transform };
    const sticker = stickerElementRef.current;
    if (!sticker) return;
    sticker.style.left = `${transform.x}%`;
    sticker.style.top = `${transform.y}px`;
    sticker.style.width = `${transform.width}%`;
    sticker.style.setProperty("--sticker-rotation", `${transform.rotation}deg`);
    sticker.style.setProperty(
      "--sticker-counter-rotation",
      `${-transform.rotation}deg`,
    );
  };

  const projectedStickerSize = (
    width: number,
    rotation: number,
    canvasWidth: number,
  ) => {
    const safeCanvasWidth = Math.max(1, canvasWidth);
    const stickerWidth = (width / 100) * safeCanvasWidth;
    const media = stickerElementRef.current?.querySelector("img, video");
    const intrinsicWidth =
      media instanceof HTMLVideoElement ? media.videoWidth : media?.naturalWidth;
    const intrinsicHeight =
      media instanceof HTMLVideoElement ? media.videoHeight : media?.naturalHeight;
    const aspectRatio =
      intrinsicWidth && intrinsicHeight
        ? intrinsicWidth / intrinsicHeight
        : media && media.clientWidth > 0 && media.clientHeight > 0
          ? media.clientWidth / media.clientHeight
          : 1;
    const stickerHeight = stickerWidth / Math.max(0.01, aspectRatio);
    const radians = (rotation * Math.PI) / 180;
    const projectedWidth =
      Math.abs(stickerWidth * Math.cos(radians)) +
      Math.abs(stickerHeight * Math.sin(radians));
    const projectedHeight =
      Math.abs(stickerHeight * Math.cos(radians)) +
      Math.abs(stickerWidth * Math.sin(radians));

    return { projectedWidth, projectedHeight };
  };

  const clampStickerX = (
    x: number,
    width: number,
    rotation: number,
    canvasWidth: number,
  ) => {
    const safeCanvasWidth = Math.max(1, canvasWidth);
    const { projectedWidth } = projectedStickerSize(
      width,
      rotation,
      safeCanvasWidth,
    );
    const visiblePixels = Math.min(STICKER_MIN_VISIBLE_PX, projectedWidth);
    const minimumCenter = visiblePixels - projectedWidth / 2;
    const maximumCenter =
      safeCanvasWidth - visiblePixels + projectedWidth / 2;
    const center = (x / 100) * safeCanvasWidth;
    const clampedCenter = Math.min(
      maximumCenter,
      Math.max(minimumCenter, center),
    );

    return (clampedCenter / safeCanvasWidth) * 100;
  };

  const clampStickerY = (
    y: number,
    width: number,
    rotation: number,
    canvasWidth: number,
    canvasHeight: number,
    announceBoundary = true,
  ) => {
    const sticker = stickerElementRef.current;
    const canvas = sticker?.closest<HTMLElement>(".strip-canvas");
    const canvasBounds = canvas?.getBoundingClientRect();
    const firstAnchor = canvas
      ? Array.from(canvas.children).find(
          (element): element is HTMLElement =>
            element instanceof HTMLElement &&
            (element.classList.contains("text-block") ||
              element.classList.contains("image-block")),
        )
      : undefined;
    const endingActions = canvas?.querySelector<HTMLElement>(
      ".strip-ending-card .strip-end-sheet-controls",
    );
    const { projectedHeight } = projectedStickerSize(
      width,
      rotation,
      canvasWidth,
    );
    const minimumCenter = Math.max(
      0,
      firstAnchor && canvasBounds
        ? firstAnchor.getBoundingClientRect().top - canvasBounds.top
        : 0,
    );
    const actionLimit =
      endingActions && canvasBounds
        ? endingActions.getBoundingClientRect().top -
          canvasBounds.top -
          STICKER_ENDING_BUTTON_BUFFER_PX -
          projectedHeight / 2
        : canvasHeight - STICKER_ENDING_BUTTON_BUFFER_PX - projectedHeight / 2;
    const maximumCenter = Math.max(minimumCenter, actionLimit);

    if (
      announceBoundary &&
      y > maximumCenter + 0.5 &&
      !lowerBoundaryNoticeShownRef.current
    ) {
      lowerBoundaryNoticeShownRef.current = true;
      onLowerBoundaryAttempt();
    }

    return Math.min(maximumCenter, Math.max(minimumCenter, y));
  };

  const settleStickerWithinBounds = () => {
    if (!isEditing) return;
    const canvas = stickerElementRef.current?.closest<HTMLElement>(".strip-canvas");
    if (!canvas) return;
    const current = liveBlockRef.current;
    const canvasWidth = Math.max(1, canvas.getBoundingClientRect().width);
    const canvasHeight = Math.max(window.innerHeight, canvas.scrollHeight);
    const y = clampStickerY(
      current.y,
      current.width,
      current.rotation ?? 0,
      canvasWidth,
      canvasHeight,
      false,
    );
    if (Math.abs(y - current.y) < 0.5) return;
    const nextTransform = {
      x: current.x,
      y,
      width: current.width,
      rotation: current.rotation ?? 0,
    };
    previewTransform(nextTransform);
    onTransform(nextTransform);
  };

  useLayoutEffect(() => {
    if (!isEditing) return;
    const frame = window.requestAnimationFrame(settleStickerWithinBounds);
    const handleResize = () => settleStickerWithinBounds();
    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [block.id, isEditing]);

  useEffect(() => {
    if (!isEditing || !isSelected) {
      canvasTouchTransformRef.current = null;
      canvasTouchDragRef.current = null;
      return;
    }

    const beginCanvasTransform = (event: TouchEvent) => {
      if (event.touches.length < 2 || canvasTouchTransformRef.current) return;
      const canvas = stickerElementRef.current?.closest<HTMLElement>(".strip-canvas");
      if (!canvas) return;
      lowerBoundaryNoticeShownRef.current = false;

      const [first, second] = [event.touches[0], event.touches[1]];
      const current = liveBlockRef.current;
      canvasTouchTransformRef.current = {
        distance: Math.max(
          1,
          Math.hypot(
            second.clientX - first.clientX,
            second.clientY - first.clientY,
          ),
        ),
        angle: Math.atan2(
          second.clientY - first.clientY,
          second.clientX - first.clientX,
        ),
        midpointX: (first.clientX + second.clientX) / 2,
        midpointY: (first.clientY + second.clientY) / 2,
        x: current.x,
        y: current.y,
        width: current.width,
        rotation: current.rotation ?? 0,
        canvasWidth: Math.max(1, canvas.getBoundingClientRect().width),
        canvasHeight: Math.max(window.innerHeight, canvas.scrollHeight),
      };
      canvasTouchDragRef.current = null;
      activePointersRef.current.clear();
      dragRef.current = null;
      transformRef.current = null;
      setIsTransforming(true);
      event.preventDefault();
    };

    const updateCanvasTransform = (event: TouchEvent) => {
      const transform = canvasTouchTransformRef.current;
      if (transform && event.touches.length >= 2) {
        event.preventDefault();

        const [first, second] = [event.touches[0], event.touches[1]];
        const distance = Math.max(
          1,
          Math.hypot(
            second.clientX - first.clientX,
            second.clientY - first.clientY,
          ),
        );
        const angle = Math.atan2(
          second.clientY - first.clientY,
          second.clientX - first.clientX,
        );
        const midpointX = (first.clientX + second.clientX) / 2;
        const midpointY = (first.clientY + second.clientY) / 2;
        const width = Math.min(
          92,
          Math.max(10, transform.width * (distance / transform.distance)),
        );
        const rawRotation =
          transform.rotation + ((angle - transform.angle) * 180) / Math.PI;
        const rotation = ((rawRotation + 180) % 360 + 360) % 360 - 180;

        previewTransform({
          x: clampStickerX(
            transform.x +
              ((midpointX - transform.midpointX) / transform.canvasWidth) * 100,
            width,
            rotation,
            transform.canvasWidth,
          ),
          y: clampStickerY(
            transform.y + midpointY - transform.midpointY,
            width,
            rotation,
            transform.canvasWidth,
            transform.canvasHeight,
          ),
          width,
          rotation,
        });
        return;
      }

      const drag = canvasTouchDragRef.current;
      if (!drag || event.touches.length === 0) return;
      const touch = Array.from(event.touches).find(
        (candidate) => candidate.identifier === drag.touchId,
      );
      if (!touch) return;
      event.preventDefault();
      previewTransform({
        x: clampStickerX(
          drag.x + ((touch.clientX - drag.clientX) / drag.canvasWidth) * 100,
          drag.width,
          drag.rotation,
          drag.canvasWidth,
        ),
        y: clampStickerY(
          drag.y + touch.clientY - drag.clientY,
          drag.width,
          drag.rotation,
          drag.canvasWidth,
          drag.canvasHeight,
        ),
        width: drag.width,
        rotation: drag.rotation,
      });
    };

    const finishCanvasTransform = (event: TouchEvent) => {
      const transform = canvasTouchTransformRef.current;
      const drag = canvasTouchDragRef.current;
      if ((!transform && !drag) || event.touches.length >= 2) return;
      if (event.cancelable) event.preventDefault();

      if (event.touches.length === 1) {
        const remainingTouch = event.touches[0];
        const current = liveBlockRef.current;
        canvasTouchTransformRef.current = null;
        canvasTouchDragRef.current = {
          touchId: remainingTouch.identifier,
          clientX: remainingTouch.clientX,
          clientY: remainingTouch.clientY,
          x: current.x,
          y: current.y,
          width: current.width,
          rotation: current.rotation ?? 0,
          canvasWidth:
            transform?.canvasWidth ?? drag?.canvasWidth ?? window.innerWidth,
          canvasHeight:
            transform?.canvasHeight ??
            drag?.canvasHeight ??
            Math.max(window.innerHeight, document.documentElement.scrollHeight),
        };
        activePointersRef.current.clear();
        dragRef.current = null;
        transformRef.current = null;
        setIsTransforming(true);
        return;
      }

      canvasTouchTransformRef.current = null;
      canvasTouchDragRef.current = null;
      activePointersRef.current.clear();
      dragRef.current = null;
      transformRef.current = null;
      setIsTransforming(false);
      const current = liveBlockRef.current;
      onTransform({
        x: current.x,
        y: current.y,
        width: current.width,
        rotation: current.rotation ?? 0,
      });
    };

    document.addEventListener("touchstart", beginCanvasTransform, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchmove", updateCanvasTransform, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchend", finishCanvasTransform, {
      capture: true,
      passive: false,
    });
    document.addEventListener("touchcancel", finishCanvasTransform, {
      capture: true,
      passive: false,
    });

    return () => {
      document.removeEventListener("touchstart", beginCanvasTransform, true);
      document.removeEventListener("touchmove", updateCanvasTransform, true);
      document.removeEventListener("touchend", finishCanvasTransform, true);
      document.removeEventListener("touchcancel", finishCanvasTransform, true);
    };
  }, [block.id, isEditing, isSelected]);

  const stopPointer = (
    event: ReactPointerEvent<HTMLElement>,
    cancelled = false,
  ) => {
    const selectionTap = selectionTapRef.current;
    if (selectionTap?.pointerId === event.pointerId) {
      selectionTapRef.current = null;
      if (!cancelled && !selectionTap.moved) {
        event.preventDefault();
        event.stopPropagation();
        if (
          onTapSelectedText(
            event.clientX,
            event.clientY,
            event.currentTarget,
          )
        ) {
          return;
        }
        onSelect();
      }
      return;
    }

    const activePointers = activePointersRef.current;
    if (canvasTouchTransformRef.current) {
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      activePointers.delete(event.pointerId);
      dragRef.current = null;
      transformRef.current = null;
      return;
    }
    if (!activePointers.has(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointers.delete(event.pointerId);

    if (activePointers.size === 0) {
      const current = liveBlockRef.current;
      onTransform({
        x: current.x,
        y: current.y,
        width: current.width,
        rotation: current.rotation ?? 0,
      });
    }

    if (activePointers.size < 2) {
      transformRef.current = null;
      setIsTransforming(false);
    }

    if (activePointers.size === 1) {
      const [pointerId, pointer] = activePointers.entries().next().value as [
        number,
        { clientX: number; clientY: number },
      ];
      const canvas = event.currentTarget.closest<HTMLElement>(".strip-canvas");
      const current = liveBlockRef.current;
      dragRef.current = canvas
        ? {
            pointerId,
            clientX: pointer.clientX,
            clientY: pointer.clientY,
            x: current.x,
            y: current.y,
            canvasWidth: Math.max(1, canvas.getBoundingClientRect().width),
            canvasHeight: Math.max(window.innerHeight, canvas.scrollHeight),
          }
        : null;
    } else {
      dragRef.current = null;
    }
  };

  return (
    <figure
      ref={stickerElementRef}
      className={`strip-block sticker-block ${isEditing ? "is-editing" : ""} ${
        isEditing && isSelected ? "is-selected" : ""
      } ${isEditing && isTransforming ? "is-transforming" : ""} ${
        isEditing && isOverlappingSelection ? "is-overlapping-selection" : ""
      }`}
      data-block-id={block.id}
      style={
        {
          left: `${renderedBlock.x}%`,
          top: `${renderedBlock.y}px`,
          width: `${renderedBlock.width}%`,
          "--sticker-rotation": `${renderedBlock.rotation ?? 0}deg`,
          "--sticker-counter-rotation": `${-(renderedBlock.rotation ?? 0)}deg`,
        } satisfies StickerBlockStyle
      }
      onPointerDown={(event) => {
        if (!isEditing) return;
        event.stopPropagation();

        if (!isSelected) {
          selectionTapRef.current = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            moved: false,
          };
          return;
        }

        if (event.pointerType === "touch" && !event.isPrimary) return;

        event.preventDefault();
        const canvas = event.currentTarget.closest<HTMLElement>(".strip-canvas");
        if (!canvas) return;
        lowerBoundaryNoticeShownRef.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
        const canvasWidth = Math.max(1, canvas.getBoundingClientRect().width);
        const canvasHeight = Math.max(window.innerHeight, canvas.scrollHeight);
        const activePointers = activePointersRef.current;
        activePointers.set(event.pointerId, {
          clientX: event.clientX,
          clientY: event.clientY,
        });

        if (activePointers.size === 1) {
          const current = liveBlockRef.current;
          dragRef.current = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            x: current.x,
            y: current.y,
            canvasWidth,
            canvasHeight,
          };
          return;
        }

        const [first, second] = Array.from(activePointers.values());
        const current = liveBlockRef.current;
        transformRef.current = {
          distance: Math.max(
            1,
            Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
          ),
          angle: Math.atan2(
            second.clientY - first.clientY,
            second.clientX - first.clientX,
          ),
          midpointX: (first.clientX + second.clientX) / 2,
          midpointY: (first.clientY + second.clientY) / 2,
          x: current.x,
          y: current.y,
          width: current.width,
          rotation: current.rotation ?? 0,
          canvasWidth,
          canvasHeight,
        };
        dragRef.current = null;
        setIsTransforming(true);
      }}
      onPointerMove={(event) => {
        const selectionTap = selectionTapRef.current;
        if (selectionTap?.pointerId === event.pointerId) {
          if (
            Math.hypot(
              event.clientX - selectionTap.clientX,
              event.clientY - selectionTap.clientY,
            ) > 8
          ) {
            selectionTap.moved = true;
          }
          return;
        }

        if (canvasTouchTransformRef.current) {
          event.preventDefault();
          return;
        }

        const activePointers = activePointersRef.current;
        if (activePointers.has(event.pointerId)) {
          activePointers.set(event.pointerId, {
            clientX: event.clientX,
            clientY: event.clientY,
          });
        }

        const transform = transformRef.current;
        if (transform && activePointers.size >= 2) {
          event.preventDefault();
          const [first, second] = Array.from(activePointers.values());
          const distance = Math.max(
            1,
            Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
          );
          const angle = Math.atan2(
            second.clientY - first.clientY,
            second.clientX - first.clientX,
          );
          const midpointX = (first.clientX + second.clientX) / 2;
          const midpointY = (first.clientY + second.clientY) / 2;
          const width = Math.min(
            92,
            Math.max(10, transform.width * (distance / transform.distance)),
          );
          const rawRotation =
            transform.rotation + ((angle - transform.angle) * 180) / Math.PI;
          const rotation = ((rawRotation + 180) % 360 + 360) % 360 - 180;

          previewTransform({
            x: clampStickerX(
              transform.x +
                ((midpointX - transform.midpointX) / transform.canvasWidth) * 100,
              width,
              rotation,
              transform.canvasWidth,
            ),
            y: clampStickerY(
              transform.y + midpointY - transform.midpointY,
              width,
              rotation,
              transform.canvasWidth,
              transform.canvasHeight,
            ),
            width,
            rotation,
          });
          return;
        }

        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        const current = liveBlockRef.current;
        previewTransform({
          x: clampStickerX(
            drag.x + ((event.clientX - drag.clientX) / drag.canvasWidth) * 100,
            current.width,
            current.rotation ?? 0,
            drag.canvasWidth,
          ),
          y: clampStickerY(
            drag.y + event.clientY - drag.clientY,
            current.width,
            current.rotation ?? 0,
            drag.canvasWidth,
            drag.canvasHeight,
          ),
          width: current.width,
          rotation: current.rotation ?? 0,
        });
      }}
      onPointerUp={(event) => stopPointer(event)}
      onPointerCancel={(event) => stopPointer(event, true)}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={
        isEditing
          ? isSelected
            ? "Sticker selected. Drag from the sticker with one finger, or resize and rotate from anywhere with two fingers."
            : "Sticker. Tap to select."
          : block.alt || "Sticker"
      }
    >
      <span className="sticker-visual">
        {block.mediaType === "video" ? (
          <video
            src={block.src}
            aria-label={block.alt ? `Video sticker: ${block.alt}` : "Video sticker"}
            autoPlay
            muted
            loop
            playsInline
            controls={false}
            disablePictureInPicture
            controlsList="nodownload nofullscreen noplaybackrate noremoteplayback"
            preload="auto"
            draggable={false}
            onLoadedData={() => {
              settleStickerWithinBounds();
              onLoadSettled?.(true);
            }}
            onError={() => onLoadSettled?.(false)}
          />
        ) : (
          <img
            src={block.src}
            alt={block.alt}
            loading="eager"
            decoding="async"
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget;
              void image
                .decode()
                .catch(() => {})
                .then(() => {
                  settleStickerWithinBounds();
                  onLoadSettled?.(true);
                });
            }}
            onError={() => onLoadSettled?.(false)}
          />
        )}
      </span>
      {controls}
    </figure>
  );
}

function DeleteConfirmationModal({
  title,
  pending = false,
  cancelButtonRef,
  onCancel,
  onConfirm,
}: {
  title: string;
  pending?: boolean;
  cancelButtonRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <section
        className="delete-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        aria-describedby="delete-modal-description"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="delete-modal-title">{title}</h2>
        <p id="delete-modal-description">This can&apos;t be undone.</p>
        <div className="delete-modal-actions">
          <button
            ref={cancelButtonRef}
            className="cancel-delete-button"
            type="button"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            className="confirm-delete-button"
            type="button"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const [blocks, setBlocks] = useState<StripBlock[]>([]);
  const [endingStyle, setEndingStyle] = useState<StripEndingStyle>(
    DEFAULT_STRIP_ENDING_STYLE,
  );
  const [imageTrayColors, setImageTrayColors] = useState<Record<string, string>>({});
  const [videoAudioPresence, setVideoAudioPresence] = useState<Record<string, boolean>>(
    {},
  );
  const [mediaLoadStatus, setMediaLoadStatus] = useState<
    Record<string, "loaded" | "error">
  >({});
  const [publishedMinimumReadyKey, setPublishedMinimumReadyKey] = useState<
    string | null
  >(null);
  const [publishedCoverSettledKey, setPublishedCoverSettledKey] = useState<
    string | null
  >(null);
  const [publishedLoaderDismissedKey, setPublishedLoaderDismissedKey] = useState<
    string | null
  >(null);
  const [audibleVideoId, setAudibleVideoId] = useState<string | null>(null);
  const [publishedStrips, setPublishedStrips] = useState<PublishedStripSummary[]>([]);
  const [draftStrips, setDraftStrips] = useState<DraftStripSummary[]>([]);
  const [viewedStrips, setViewedStrips] = useState<ViewedStripSummary[]>([]);
  const [libraryOwnerId, setLibraryOwnerId] = useState("");
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authStep, setAuthStep] = useState<AuthStep>("landing");
  const [authTransitionDirection, setAuthTransitionDirection] =
    useState<PageTransitionDirection>("forward");
  const [authPhone, setAuthPhone] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authResendSeconds, setAuthResendSeconds] = useState(0);
  const [authUsername, setAuthUsername] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authUsernameError, setAuthUsernameError] = useState("");
  const [authDevelopmentCode, setAuthDevelopmentCode] = useState("");
  const [authenticationRequired, setAuthenticationRequired] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [openingStripId, setOpeningStripId] = useState<string | null>(null);
  const [openingDraftId, setOpeningDraftId] = useState<string | null>(null);
  const [openedPublishedStrip, setOpenedPublishedStrip] =
    useState<PublishedStripDetail | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [currentDraftCreatedAt, setCurrentDraftCreatedAt] = useState(0);
  const [editingPublishedStripId, setEditingPublishedStripId] = useState<
    string | null
  >(null);
  const [publishing, setPublishing] = useState(false);
  const [storyAssetFile, setStoryAssetFile] = useState<File | null>(null);
  const [storyAssetUrl, setStoryAssetUrl] = useState("");
  const [storyAssetLoading, setStoryAssetLoading] = useState(false);
  const [view, setView] = useState<View>("library");
  const [libraryScrollInset, setLibraryScrollInset] = useState(0);
  const [initialRouteReady, setInitialRouteReady] = useState(false);
  const [legacyPageTransition, setLegacyPageTransition] =
    useState<LegacyPageTransitionSnapshot | null>(null);
  const [dockTransition, setDockTransition] =
    useState<DockTransitionSnapshot | null>(null);
  const [dockTransitionStarted, setDockTransitionStarted] = useState(false);
  const [editorDockEntering, setEditorDockEntering] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [inlinePreview, setInlinePreview] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editingTextBlockId, setEditingTextBlockId] = useState<string | null>(null);
  const [activeTextTool, setActiveTextTool] = useState<TextTool | null>(null);
  const [activeEndingTool, setActiveEndingTool] = useState<EndingTool | null>(null);
  const [lastTextTool, setLastTextTool] = useState<TextTool>("font");
  const [heightCropSession, setHeightCropSession] =
    useState<HeightCropSession | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDraftDeleteId, setPendingDraftDeleteId] = useState<string | null>(
    null,
  );
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
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
  const [publishSetupReturnView, setPublishSetupReturnView] = useState<"edit" | "preview">(
    "edit",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const authPhoneInputRef = useRef<HTMLInputElement>(null);
  const coverStageRef = useRef<HTMLDivElement>(null);
  const coverInstructionRef = useRef<HTMLParagraphElement>(null);
  const coverSwipeStartYRef = useRef<number | null>(null);
  const coverDragProgressRef = useRef(0);
  const coverSwipeSuppressClickRef = useRef(false);
  const pageTransitionInFlightRef = useRef(false);
  const libraryScrollInsetRef = useRef(0);
  const leadingImageInsetRef = useRef(0);
  const skipLeadingImagePlacementOnReorderRef = useRef(false);
  const suppressLeadingImageSettleUntilTouchRef = useRef(false);
  const blockReorderFrameRef = useRef<number | null>(null);
  const blockReorderReleaseFrameRef = useRef<number | null>(null);
  const blockReorderOverflowAnchorRef = useRef<{
    root: string;
    body: string;
  } | null>(null);
  const dockTransitionTimerRef = useRef<number | null>(null);
  const dockTransitionFrameRef = useRef<number | null>(null);
  const editorDockEntryTimerRef = useRef<number | null>(null);
  const publishFlowStartScrollRef = useRef(0);
  const inlinePreviewScrollRef = useRef<number | null>(null);
  const inlinePreviewHistoryEntryRef = useRef(false);
  const inlinePreviewBasePathRef = useRef<string | null>(null);
  const inlinePreviewSelectionRef = useRef<string | null>(null);
  const suppressSelectedBlockAutoFocusRef = useRef(false);
  const inlinePreviewExitLockRef = useRef<{
    scrollTop: number;
    scrollRestoration: "auto" | "manual";
  } | null>(null);
  const inlinePreviewExitFrameRef = useRef<number | null>(null);
  const inlinePreviewExitSettleFrameRef = useRef<number | null>(null);
  const inlinePreviewExitTimerRef = useRef<number | null>(null);
  const legacyDraftBlocksRef = useRef<StripBlock[] | null>(null);
  const legacyOwnerIdRef = useRef("");
  const initialRouteHandledRef = useRef(false);
  const draftSaveTimerRef = useRef<number | null>(null);
  const draftSaveSequenceRef = useRef(0);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const deletingDraftRef = useRef(false);
  const storyAssetObjectUrlRef = useRef("");
  const blockTapGestureRef = useRef<{
    blockId: string;
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const heightCropDragRef = useRef<{
    blockId: string;
    edge: "top" | "bottom";
    pointerId: number;
    startY: number;
    startTop: number;
    startBottom: number;
    sourceHeight: number;
  } | null>(null);

  const mediaLoadKey =
    view === "published" && openedPublishedStrip
      ? `published:${openedPublishedStrip.id}`
      : currentDraftId
        ? `draft:${currentDraftId}`
        : "none";

  useLayoutEffect(() => {
    setMediaLoadStatus({});
  }, [mediaLoadKey]);

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
  const hasStickerAnchorBlock = blocks.some(
    (block) => block.type === "text" || block.type === "image",
  );
  const topSafeAreaColor =
    view === "library" ||
    view === "drafts" ||
    view === "history" ||
    view === "settings" ||
    view === "publish-setup" ||
    view === "title-setup" ||
    view === "share"
      ? DEFAULT_BACKGROUND
      : firstVisibleBlock?.type === "text"
      ? (firstVisibleBlock.backgroundColor ?? DEFAULT_BACKGROUND)
      : DEFAULT_BACKGROUND;
  const hasLeadingImage =
    firstVisibleBlock?.type === "image" || firstVisibleBlock?.type === "video";
  const hasLeadingText = firstVisibleBlock?.type === "text";
  const visibleEndingStyle =
    view === "published" && openedPublishedStrip
      ? openedPublishedStrip.endingStyle ?? DEFAULT_STRIP_ENDING_STYLE
      : endingStyle;
  const publishedAssetIds =
    view === "published" && openedPublishedStrip
      ? openedPublishedStrip.blocks.flatMap((block) =>
          block.type === "image" ||
          block.type === "video" ||
          block.type === "sticker"
            ? [block.id]
            : [],
        )
      : [];
  const publishedAssetKey = publishedAssetIds.join("|");
  const publishedContentReady = publishedAssetIds.every(
    (blockId) => mediaLoadStatus[blockId] !== undefined,
  );
  const publishedStripLoadKey =
    view === "published" && openedPublishedStrip
      ? openedPublishedStrip.id
      : "";
  const publishedCoverReady =
    openedPublishedStrip?.cover.kind !== "image" ||
    publishedCoverSettledKey === publishedStripLoadKey;
  const publishedAssetsReady = publishedContentReady && publishedCoverReady;
  const publishedMinimumElapsed =
    publishedStripLoadKey !== "" &&
    publishedMinimumReadyKey === publishedStripLoadKey;
  const publishedContentCanReveal =
    publishedAssetsReady && publishedMinimumElapsed;
  const publishedLoaderPhase = publishedContentCanReveal
    ? "revealing"
    : "loading";
  const publishedLoaderIsVisible =
    publishedStripLoadKey !== "" &&
    (!publishedContentCanReveal ||
      publishedLoaderDismissedKey !== publishedStripLoadKey);
  const cleanViewBottomSurfaceColor =
    view === "edit" && inlinePreview
      ? endingStyle.backgroundColor
      : null;

  useEffect(() => {
    setPublishedMinimumReadyKey(null);
    if (!publishedStripLoadKey) return;

    const timeout = window.setTimeout(() => {
      setPublishedMinimumReadyKey(publishedStripLoadKey);
    }, PUBLISHED_LOADING_MINIMUM_MS);
    return () => window.clearTimeout(timeout);
  }, [publishedStripLoadKey]);

  useEffect(() => {
    if (!publishedStripLoadKey || !publishedContentCanReveal) return;
    const timeout = window.setTimeout(() => {
      setPublishedLoaderDismissedKey(publishedStripLoadKey);
    }, PUBLISHED_LOADING_RELEASE_MS);
    return () => window.clearTimeout(timeout);
  }, [publishedContentCanReveal, publishedStripLoadKey]);

  useEffect(() => {
    const root = document.documentElement;
    const isWaitingForPublishedContent =
      view === "published" &&
      openedPublishedStrip !== null &&
      publishedLoaderIsVisible;
    root.classList.toggle(
      "published-content-loading",
      isWaitingForPublishedContent,
    );
    if (!isWaitingForPublishedContent) {
      return () => root.classList.remove("published-content-loading");
    }

    const timeout = !publishedAssetsReady
      ? window.setTimeout(() => {
          setMediaLoadStatus((current) => {
            const next = { ...current };
            publishedAssetKey.split("|").filter(Boolean).forEach((blockId) => {
              if (next[blockId] === undefined) next[blockId] = "error";
            });
            return next;
          });
          setPublishedCoverSettledKey(publishedStripLoadKey);
        }, PUBLISHED_MEDIA_LOAD_TIMEOUT_MS)
      : null;

    return () => {
      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
      root.classList.remove("published-content-loading");
    };
  }, [
    openedPublishedStrip,
    publishedAssetKey,
    publishedAssetsReady,
    publishedLoaderIsVisible,
    publishedStripLoadKey,
    view,
  ]);

  useEffect(() => {
    if (view === "edit") return;
    setInlinePreview(false);
    setHeightCropSession(null);
    heightCropDragRef.current = null;
    setActiveEndingTool(null);
    inlinePreviewScrollRef.current = null;
    inlinePreviewHistoryEntryRef.current = false;
    inlinePreviewBasePathRef.current = null;
  }, [view]);

  useEffect(() => {
    if (!inlinePreview) return;
    const rememberPreviewScroll = () => {
      inlinePreviewScrollRef.current = window.scrollY;
    };
    rememberPreviewScroll();
    window.addEventListener("scroll", rememberPreviewScroll, { passive: true });
    return () => window.removeEventListener("scroll", rememberPreviewScroll);
  }, [inlinePreview]);

  useLayoutEffect(() => {
    const isLibraryView =
      view === "library" ||
      view === "drafts" ||
      view === "history" ||
      view === "settings";
    if (!isLibraryView || libraryScrollInset <= 0) return;

    const lockedScrollTop = libraryScrollInset;
    const root = document.documentElement;
    let lastTouchY: number | null = null;
    let restoringScroll = false;

    const setLockedScrollTop = () => {
      if (
        restoringScroll ||
        Math.abs(window.scrollY - lockedScrollTop) < 0.5
      ) {
        return;
      }
      restoringScroll = true;
      window.scrollTo({ top: lockedScrollTop, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = lockedScrollTop;
      document.body.scrollTop = lockedScrollTop;
      restoringScroll = false;
    };
    const restoreLockedScrollTop = () => {
      if (window.scrollY < lockedScrollTop) setLockedScrollTop();
    };
    const handleTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? null;
    };
    const handleTouchMove = (event: TouchEvent) => {
      const nextTouchY = event.touches[0]?.clientY;
      if (nextTouchY === undefined || lastTouchY === null) return;

      const upwardScrollDistance = nextTouchY - lastTouchY;
      lastTouchY = nextTouchY;
      if (
        upwardScrollDistance <= 0 ||
        window.scrollY - upwardScrollDistance > lockedScrollTop
      ) {
        return;
      }

      if (event.cancelable) event.preventDefault();
      setLockedScrollTop();
    };
    const handleTouchEnd = () => {
      lastTouchY = null;
      restoreLockedScrollTop();
    };
    const handleWheel = (event: WheelEvent) => {
      if (
        event.deltaY >= 0 ||
        window.scrollY + event.deltaY > lockedScrollTop
      ) {
        return;
      }
      if (event.cancelable) event.preventDefault();
      setLockedScrollTop();
    };

    root.classList.add("library-scroll-top-locked");
    restoreLockedScrollTop();
    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
      capture: true,
    });
    document.addEventListener("touchmove", handleTouchMove, {
      passive: false,
      capture: true,
    });
    document.addEventListener("touchend", handleTouchEnd, { capture: true });
    document.addEventListener("touchcancel", handleTouchEnd, { capture: true });
    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("scroll", restoreLockedScrollTop, { passive: true });
    return () => {
      root.classList.remove("library-scroll-top-locked");
      document.removeEventListener("touchstart", handleTouchStart, true);
      document.removeEventListener("touchmove", handleTouchMove, true);
      document.removeEventListener("touchend", handleTouchEnd, true);
      document.removeEventListener("touchcancel", handleTouchEnd, true);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("scroll", restoreLockedScrollTop);
    };
  }, [libraryScrollInset, view]);

  useEffect(() => {
    if (selectedBlockId !== STRIP_ENDING_BLOCK_ID) {
      setActiveEndingTool(null);
    }
  }, [selectedBlockId]);

  useEffect(() => {
    if (view !== "edit") return;

    const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const originalViewport = viewportMeta?.content;
    viewportMeta?.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
    );

    const preventGestureZoom = (event: Event) => event.preventDefault();
    const preventMultiTouchZoom = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };

    document.addEventListener("gesturestart", preventGestureZoom, { passive: false });
    document.addEventListener("gesturechange", preventGestureZoom, { passive: false });
    document.addEventListener("gestureend", preventGestureZoom, { passive: false });
    document.addEventListener("touchmove", preventMultiTouchZoom, { passive: false });

    return () => {
      if (viewportMeta && originalViewport !== undefined) {
        viewportMeta.setAttribute("content", originalViewport);
      }
      document.removeEventListener("gesturestart", preventGestureZoom);
      document.removeEventListener("gesturechange", preventGestureZoom);
      document.removeEventListener("gestureend", preventGestureZoom);
      document.removeEventListener("touchmove", preventMultiTouchZoom);
    };
  }, [view]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const stripIsVisible =
      view === "edit" || view === "preview" || view === "published";

    const calculateLeadingImageOffset = () => {
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

      if (
        !stripIsVisible ||
        !hasLeadingImage ||
        !isIOS ||
        window.screen.height / window.screen.width <= 2
      ) {
        return 0;
      }

      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top)";
      document.body.appendChild(probe);
      const reportedSafeTop = Number.parseFloat(
        window.getComputedStyle(probe).paddingTop,
      );
      probe.remove();

      const fallbackSafeTop = Math.min(
        62,
        Math.max(47, window.screen.width * 0.154),
      );
      return Math.round(
        Number.isFinite(reportedSafeTop) && reportedSafeTop >= 1
          ? reportedSafeTop
          : fallbackSafeTop,
      );
    };

    const offset = calculateLeadingImageOffset();
    leadingImageInsetRef.current = offset;
    root.style.setProperty("--leading-image-inset", `${offset}px`);
    root.classList.toggle("leading-image-inset-active", offset > 0);
    const ownsReloadScroll =
      initialRouteReady &&
      stripIsVisible &&
      root.dataset.stripReloadScroll === "manual";
    const skipInitialAnchor =
      skipLeadingImagePlacementOnReorderRef.current && !ownsReloadScroll;
    skipLeadingImagePlacementOnReorderRef.current = false;

    const placeLeadingImageAtAnchor = () => {
      if (offset > 0) {
        window.scrollTo({ top: offset, left: 0, behavior: "auto" });
        return;
      }
      if (ownsReloadScroll) {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    };

    let anchorFrame: number | null = null;
    if (!skipInitialAnchor) {
      placeLeadingImageAtAnchor();
      anchorFrame = window.requestAnimationFrame(placeLeadingImageAtAnchor);
    }
    let releaseFrame: number | null = null;
    let releaseTimer: number | null = null;

    if (ownsReloadScroll) {
      releaseFrame = window.requestAnimationFrame(() => {
        placeLeadingImageAtAnchor();
        releaseTimer = window.setTimeout(() => {
          placeLeadingImageAtAnchor();
          history.scrollRestoration = "auto";
          delete root.dataset.stripReloadScroll;
        }, 0);
      });
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) placeLeadingImageAtAnchor();
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      if (anchorFrame !== null) window.cancelAnimationFrame(anchorFrame);
      if (releaseFrame !== null) window.cancelAnimationFrame(releaseFrame);
      if (releaseTimer !== null) window.clearTimeout(releaseTimer);
      window.removeEventListener("pageshow", handlePageShow);
      if (ownsReloadScroll && root.dataset.stripReloadScroll === "manual") {
        history.scrollRestoration = "auto";
        delete root.dataset.stripReloadScroll;
      }
      leadingImageInsetRef.current = 0;
      root.classList.remove("leading-image-inset-active");
      root.style.removeProperty("--leading-image-inset");
    };
  }, [hasLeadingImage, initialRouteReady, view]);

  useEffect(() => {
    const stripIsVisible =
      view === "edit" || view === "preview" || view === "published";
    if (!initialRouteReady || !hasLeadingImage || !stripIsVisible) return;

    let settleFrame: number | null = null;
    let settleTimer: number | null = null;
    let touchIsActive = false;
    let settleIsArmed = !suppressLeadingImageSettleUntilTouchRef.current;
    suppressLeadingImageSettleUntilTouchRef.current = false;

    const clearPendingSettle = () => {
      if (settleFrame !== null) window.cancelAnimationFrame(settleFrame);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleFrame = null;
      settleTimer = null;
    };

    const settleLeadingImageAtAnchor = () => {
      if (touchIsActive || !settleIsArmed) return;
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = null;
      settleFrame = window.requestAnimationFrame(() => {
        settleFrame = null;
        const anchor = leadingImageInsetRef.current;
        const leadingMedia = document.querySelector<HTMLElement>(
          ".strip-canvas > .image-block, .strip-canvas > .video-block",
        );
        if (anchor <= 0 || !leadingMedia) return;

        const mediaBounds = leadingMedia.getBoundingClientRect();
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const topEdgeIsInAnchorZone =
          mediaBounds.bottom > 0 &&
          mediaBounds.top < viewportHeight &&
          mediaBounds.top >= -anchor - 1;
        if (!topEdgeIsInAnchorZone || Math.abs(window.scrollY - anchor) <= 0.5) {
          return;
        }
        window.scrollTo({ top: anchor, left: 0, behavior: "smooth" });
      });
    };

    const scheduleSettleFallback = (delay: number) => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settleLeadingImageAtAnchor, delay);
    };

    const handleTouchStart = () => {
      settleIsArmed = true;
      touchIsActive = true;
      clearPendingSettle();
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      touchIsActive = false;
      scheduleSettleFallback(360);
    };

    const handleNativeReboundScroll = () => {
      if (touchIsActive) return;
      scheduleSettleFallback(90);
    };

    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchend", handleTouchEnd, {
      passive: true,
    });
    document.addEventListener("touchcancel", handleTouchEnd, {
      passive: true,
    });
    window.addEventListener("scroll", handleNativeReboundScroll, {
      passive: true,
    });
    window.addEventListener("scrollend", settleLeadingImageAtAnchor);

    return () => {
      clearPendingSettle();
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
      window.removeEventListener("scroll", handleNativeReboundScroll);
      window.removeEventListener("scrollend", settleLeadingImageAtAnchor);
    };
  }, [hasLeadingImage, initialRouteReady, view]);

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
      if (blockReorderFrameRef.current !== null) {
        window.cancelAnimationFrame(blockReorderFrameRef.current);
      }
      if (blockReorderReleaseFrameRef.current !== null) {
        window.cancelAnimationFrame(blockReorderReleaseFrameRef.current);
      }
      if (inlinePreviewExitFrameRef.current !== null) {
        window.cancelAnimationFrame(inlinePreviewExitFrameRef.current);
      }
      if (inlinePreviewExitSettleFrameRef.current !== null) {
        window.cancelAnimationFrame(inlinePreviewExitSettleFrameRef.current);
      }
      if (inlinePreviewExitTimerRef.current !== null) {
        window.clearTimeout(inlinePreviewExitTimerRef.current);
      }
      const previewExitLock = inlinePreviewExitLockRef.current;
      if (previewExitLock) {
        history.scrollRestoration = previewExitLock.scrollRestoration;
        document.documentElement.classList.remove("inline-preview-exit-locked");
        inlinePreviewExitLockRef.current = null;
      }
      const originalOverflowAnchor = blockReorderOverflowAnchorRef.current;
      if (originalOverflowAnchor) {
        document.documentElement.style.overflowAnchor = originalOverflowAnchor.root;
        document.body.style.overflowAnchor = originalOverflowAnchor.body;
        blockReorderOverflowAnchorRef.current = null;
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

  useLayoutEffect(() => {
    const root = document.documentElement;
    const trailingEdgeIsActive =
      view === "edit" && inlinePreview && cleanViewBottomSurfaceColor !== null;
    root.style.setProperty(
      "--bottom-safe-area-color",
      trailingEdgeIsActive && cleanViewBottomSurfaceColor
        ? cleanViewBottomSurfaceColor
        : DEFAULT_BACKGROUND,
    );
    root.classList.toggle("published-trailing-edge-active", trailingEdgeIsActive);
  }, [cleanViewBottomSurfaceColor, inlinePreview, view]);

  useEffect(() => {
    const root = document.documentElement;
    const sheet = document.querySelector<HTMLElement>(
      ".published-mode .published-bottom-sheet",
    );
    if (view !== "published" || !publishedContentCanReveal || !sheet) {
      root.classList.remove("published-bottom-sheet-canvas-active");
      return;
    }

    const themeColor = document.querySelector<HTMLMetaElement>(
      "#strip-theme-color",
    );
    const sheetCanvasColor = visibleEndingStyle.backgroundColor;
    const viewport = window.visualViewport;
    let syncFrame: number | null = null;
    let sheetCanvasIsActive: boolean | null = null;

    const setSheetCanvasIsActive = (isActive: boolean) => {
      if (sheetCanvasIsActive === isActive) return;
      sheetCanvasIsActive = isActive;
      root.classList.toggle(
        "published-bottom-sheet-canvas-active",
        isActive,
      );
      root.style.setProperty(
        "--bottom-safe-area-color",
        isActive ? sheetCanvasColor : DEFAULT_BACKGROUND,
      );
      themeColor?.setAttribute(
        "content",
        isActive ? sheetCanvasColor : topSafeAreaColor,
      );
    };

    const syncTrailingCanvas = () => {
      syncFrame = null;
      const viewportBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      const sheetBounds = sheet.getBoundingClientRect();
      setSheetCanvasIsActive(sheetBounds.top <= viewportBottom + 240);
    };

    const scheduleTrailingCanvasSync = () => {
      if (syncFrame !== null) return;
      syncFrame = window.requestAnimationFrame(syncTrailingCanvas);
    };

    syncTrailingCanvas();
    window.addEventListener("scroll", scheduleTrailingCanvasSync, {
      passive: true,
    });
    window.addEventListener("resize", scheduleTrailingCanvasSync, {
      passive: true,
    });
    viewport?.addEventListener("scroll", scheduleTrailingCanvasSync, {
      passive: true,
    });
    viewport?.addEventListener("resize", scheduleTrailingCanvasSync, {
      passive: true,
    });

    return () => {
      if (syncFrame !== null) window.cancelAnimationFrame(syncFrame);
      window.removeEventListener("scroll", scheduleTrailingCanvasSync);
      window.removeEventListener("resize", scheduleTrailingCanvasSync);
      viewport?.removeEventListener("scroll", scheduleTrailingCanvasSync);
      viewport?.removeEventListener("resize", scheduleTrailingCanvasSync);
      root.classList.remove("published-bottom-sheet-canvas-active");
      root.style.setProperty("--bottom-safe-area-color", DEFAULT_BACKGROUND);
      themeColor?.setAttribute("content", topSafeAreaColor);
    };
  }, [
    publishedContentCanReveal,
    topSafeAreaColor,
    view,
    visibleEndingStyle.backgroundColor,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    if (
      !initialRouteReady ||
      view !== "edit" ||
      !inlinePreview ||
      cleanViewBottomSurfaceColor === null
    ) {
      root.classList.remove("published-bottom-pocket-active");
      return;
    }

    let syncFrame: number | null = null;
    let pocketIsActive: boolean | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const scrollRoot =
      document.scrollingElement ?? document.documentElement;

    const setThemeColor = (color: string) => {
      const themeColor = document.querySelector<HTMLMetaElement>(
        "#strip-theme-color",
      );
      if (!themeColor || themeColor.content === color) return;
      themeColor.setAttribute("content", color);
    };

    const syncBottomPocket = () => {
      syncFrame = null;
      const maximumScroll = Math.max(
        0,
        scrollRoot.scrollHeight - scrollRoot.clientHeight,
      );
      const endingCard = document.querySelector<HTMLElement>(
        ".editor-mode.is-inline-preview .strip-ending-card",
      );
      const viewport = window.visualViewport;
      const viewportBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;
      const endingBounds = endingCard?.getBoundingClientRect();
      const endingIsVisible = Boolean(
        endingBounds &&
          endingBounds.top <= viewportBottom + 1 &&
          endingBounds.bottom >= -1,
      );
      const shouldActivate =
        endingIsVisible || maximumScroll - window.scrollY <= 2;
      const topAndBottomAreBothVisible =
        maximumScroll <= 1 && window.scrollY <= 1;

      if (shouldActivate !== pocketIsActive) {
        pocketIsActive = shouldActivate;
        root.classList.toggle(
          "published-bottom-pocket-active",
          shouldActivate,
        );
      }
      setThemeColor(
        shouldActivate && !topAndBottomAreBothVisible
          ? cleanViewBottomSurfaceColor
          : topSafeAreaColor,
      );
    };

    const scheduleBottomPocketSync = () => {
      if (syncFrame !== null) return;
      syncFrame = window.requestAnimationFrame(syncBottomPocket);
    };

    window.addEventListener("scroll", scheduleBottomPocketSync, {
      passive: true,
    });
    window.addEventListener("scrollend", scheduleBottomPocketSync);
    window.addEventListener("pageshow", scheduleBottomPocketSync);
    window.visualViewport?.addEventListener(
      "resize",
      scheduleBottomPocketSync,
      { passive: true },
    );
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleBottomPocketSync);
      resizeObserver.observe(scrollRoot);
      const endingCard = document.querySelector<HTMLElement>(
        ".editor-mode.is-inline-preview .strip-ending-card",
      );
      if (endingCard) resizeObserver.observe(endingCard);
    }
    syncBottomPocket();

    return () => {
      if (syncFrame !== null) window.cancelAnimationFrame(syncFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", scheduleBottomPocketSync);
      window.removeEventListener("scrollend", scheduleBottomPocketSync);
      window.removeEventListener("pageshow", scheduleBottomPocketSync);
      window.visualViewport?.removeEventListener(
        "resize",
        scheduleBottomPocketSync,
      );
      root.classList.remove("published-bottom-pocket-active");
      setThemeColor(topSafeAreaColor);
    };
  }, [
    initialRouteReady,
    cleanViewBottomSurfaceColor,
    inlinePreview,
    topSafeAreaColor,
    view,
  ]);

  useEffect(() => {
    if (view !== "share" || !openedPublishedStrip) return;
    let cancelled = false;
    setStoryAssetLoading(true);
    setStoryAssetFile(null);
    setStoryAssetUrl("");

    void createInstagramStoryAsset(openedPublishedStrip)
      .then((blob) => {
        if (cancelled) return;
        if (storyAssetObjectUrlRef.current) {
          URL.revokeObjectURL(storyAssetObjectUrlRef.current);
        }
        const filenameBase = (openedPublishedStrip.title.trim() || "untitled")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 48) || "strip";
        const file = new File([blob], `${filenameBase}-share.png`, {
          type: "image/png",
        });
        const assetUrl = URL.createObjectURL(blob);
        storyAssetObjectUrlRef.current = assetUrl;
        setStoryAssetFile(file);
        setStoryAssetUrl(assetUrl);
      })
      .catch(() => {
        if (!cancelled) setNotice("Couldn’t build your share image. Try again.");
      })
      .finally(() => {
        if (!cancelled) setStoryAssetLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [openedPublishedStrip, view]);

  useEffect(
    () => () => {
      if (storyAssetObjectUrlRef.current) {
        URL.revokeObjectURL(storyAssetObjectUrlRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    let layoutHeight = window.innerHeight;
    let visibilityTimer: number | null = null;
    let keyboardReturnTimer: number | null = null;
    let keyboardReleaseTimer: number | null = null;
    let keyboardWasOpen = false;
    let keyboardReturnInProgress = false;
    let scrollTopBeforeKeyboard: number | null = null;
    let textSessionAnchorQueued = false;
    let textSessionAnchored = false;

    const textEntryIsFocused = () => {
      const activeElement = document.activeElement;
      if (activeElement?.closest(".auth-shell")) return false;
      return (
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLInputElement &&
          (activeElement.type === "text" || activeElement.type === "tel"))
      );
    };

    const cancelKeyboardReturn = () => {
      if (keyboardReturnTimer !== null) {
        window.clearTimeout(keyboardReturnTimer);
        keyboardReturnTimer = null;
      }
      if (keyboardReleaseTimer !== null) {
        window.clearTimeout(keyboardReleaseTimer);
        keyboardReleaseTimer = null;
      }
      keyboardReturnInProgress = false;
      root.classList.remove("keyboard-settling");
    };

    const queueFocusedTextBlockVisibility = () => {
      if (textSessionAnchorQueued || textSessionAnchored) return;
      textSessionAnchorQueued = true;
      visibilityTimer = window.setTimeout(() => {
        visibilityTimer = null;
        textSessionAnchorQueued = false;
        if (!textEntryIsFocused() || !root.classList.contains("keyboard-open")) return;
        keepFocusedTextBlockVisible("smooth");
        textSessionAnchored = true;
      }, KEYBOARD_SCROLL_SETTLE_MS);
    };

    const queueKeyboardReturn = () => {
      if (scrollTopBeforeKeyboard === null || keyboardReturnInProgress) return;
      if (keyboardReturnTimer !== null) {
        window.clearTimeout(keyboardReturnTimer);
      }
      keyboardReturnTimer = window.setTimeout(() => {
        keyboardReturnTimer = null;
        keyboardReturnInProgress = true;
        window.scrollTo({
          top: scrollTopBeforeKeyboard ?? window.scrollY,
          left: 0,
          behavior: "smooth",
        });
        keyboardReleaseTimer = window.setTimeout(() => {
          keyboardReleaseTimer = null;
          keyboardReturnInProgress = false;
          scrollTopBeforeKeyboard = null;
          root.classList.remove("keyboard-settling");
        }, KEYBOARD_SCROLL_RELEASE_MS);
      }, KEYBOARD_SCROLL_SETTLE_MS);
    };

    const updateKeyboardInset = () => {
      const textIsFocused = textEntryIsFocused();
      if (!textIsFocused) layoutHeight = window.innerHeight;
      if (!viewport) {
        root.style.setProperty("--keyboard-inset", "0px");
        root.classList.remove("keyboard-open");
        cancelKeyboardReturn();
        keyboardWasOpen = false;
        scrollTopBeforeKeyboard = null;
        return;
      }
      const obscuredHeight = Math.max(
        0,
        layoutHeight - (viewport.height + viewport.offsetTop),
      );
      const keyboardInset = textIsFocused && obscuredHeight > 80 ? obscuredHeight : 0;
      const keyboardIsOpen = keyboardInset > 0;
      root.style.setProperty("--keyboard-inset", `${keyboardInset}px`);
      root.classList.toggle("keyboard-open", keyboardIsOpen);
      if (keyboardIsOpen) {
        keyboardWasOpen = true;
        cancelKeyboardReturn();
        queueFocusedTextBlockVisibility();
      } else if (keyboardWasOpen) {
        keyboardWasOpen = false;
        if (visibilityTimer !== null) {
          window.clearTimeout(visibilityTimer);
          visibilityTimer = null;
          textSessionAnchorQueued = false;
        }
        if (scrollTopBeforeKeyboard !== null) {
          root.classList.add("keyboard-settling");
          queueKeyboardReturn();
        }
      } else if (
        root.classList.contains("keyboard-settling") &&
        !keyboardReturnInProgress
      ) {
        queueKeyboardReturn();
      } else if (!textIsFocused && !keyboardReturnInProgress) {
        scrollTopBeforeKeyboard = null;
      }
    };
    const handleFocusIn = () => {
      if (textEntryIsFocused()) {
        textSessionAnchorQueued = false;
        textSessionAnchored = false;
        if (scrollTopBeforeKeyboard === null) {
          scrollTopBeforeKeyboard = window.scrollY;
        }
      }
      window.requestAnimationFrame(updateKeyboardInset);
    };
    const handleFocusOut = () =>
      window.requestAnimationFrame(() => {
        if (!textEntryIsFocused()) {
          textSessionAnchorQueued = false;
          textSessionAnchored = false;
        }
        updateKeyboardInset();
      });

    updateKeyboardInset();
    // Our smooth correction moves the visual viewport. Listening for that scroll
    // here would schedule the same correction again and create a feedback loop.
    viewport?.addEventListener("resize", updateKeyboardInset);
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    return () => {
      viewport?.removeEventListener("resize", updateKeyboardInset);
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
      if (visibilityTimer !== null) {
        window.clearTimeout(visibilityTimer);
      }
      cancelKeyboardReturn();
      root.style.removeProperty("--keyboard-inset");
      root.classList.remove("keyboard-open");
      root.classList.remove("keyboard-settling");
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
      legacyOwnerIdRef.current =
        savedOwnerId && /^[a-zA-Z0-9_-]{8,128}$/.test(savedOwnerId)
          ? savedOwnerId
          : "";
    } catch {
      // Broken local data should never block the app.
      legacyOwnerIdRef.current = "";
    }

    const controller = new AbortController();
    void fetch("/api/auth/session", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session request failed");
        const data = (await response.json()) as { user?: AuthUser | null };
        if (data.user) {
          setAuthUser(data.user);
          setLibraryOwnerId(data.user.id);
          setAuthStatus("signed-in");
        } else {
          setAuthStatus("signed-out");
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAuthStatus("signed-out");
        setAuthError("Couldn’t check your sign-in. Try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (authStep !== "code" || authResendSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setAuthResendSeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [authResendSeconds, authStep]);

  useEffect(() => {
    if (!libraryOwnerId) return;
    const controller = new AbortController();
    setLibraryLoading(true);
    void fetch("/api/strips", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Library request failed");
        const data = (await response.json()) as {
          strips?: PublishedStripSummary[];
        };
        const strips = Array.isArray(data.strips) ? data.strips : [];
        const preparedStrips = await prepareLibrarySummaries(strips);
        if (!controller.signal.aborted) setPublishedStrips(preparedStrips);
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
    void fetch("/api/drafts", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Draft library request failed");
        const data = (await response.json()) as { drafts?: DraftStripSummary[] };
        const drafts = Array.isArray(data.drafts) ? data.drafts : [];
        const preparedDrafts = await prepareLibrarySummaries(drafts);
        if (!controller.signal.aborted) setDraftStrips(preparedDrafts);
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
    if (!libraryOwnerId) return;
    const controller = new AbortController();
    setHistoryLoading(true);
    void fetch("/api/history", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("History request failed");
        const data = (await response.json()) as {
          history?: ViewedStripSummary[];
        };
        const historyItems = Array.isArray(data.history) ? data.history : [];
        const preparedHistory = await prepareLibrarySummaries(historyItems);
        if (!controller.signal.aborted) setViewedStrips(preparedHistory);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice("Couldn’t load your history. Try refreshing.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
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
        id,
        title: "",
        blocks: legacyBlocks,
        endingStyle: DEFAULT_STRIP_ENDING_STYLE,
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
          id: currentDraftId,
          title: stripTitle,
          blocks,
          endingStyle,
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
    endingStyle,
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
    if (!pendingDeleteId && !pendingDraftDeleteId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelDeleteButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || deletingDraftRef.current) return;
      setPendingDeleteId(null);
      setPendingDraftDeleteId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pendingDeleteId, pendingDraftDeleteId]);


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
      const backgroundColor =
        inheritedStyle?.backgroundColor ?? DEFAULT_BLOCK_BACKGROUND;
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
  };

  const addMedia = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0) return;

    const insertionAfterId = selectedBlockId;
    const mediaBlocks = (
      await Promise.all(
        files.map(
          (file) =>
            new Promise<ImageBlock | VideoBlock | null>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result !== "string") {
                  resolve(null);
                  return;
                }

                const id = makeId();
                resolve(
                  file.type.startsWith("video/")
                    ? {
                        id,
                        type: "video",
                        src: reader.result,
                        alt: file.name.replace(/\.[^/.]+$/, ""),
                        audioEnabled: true,
                      }
                    : {
                        id,
                        type: "image",
                        src: reader.result,
                        alt: file.name.replace(/\.[^/.]+$/, ""),
                      },
                );
              };
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(file);
            }),
        ),
      )
    ).filter((block): block is ImageBlock | VideoBlock => block !== null);

    if (mediaBlocks.length === 0) return;

    setBlocks((current) => {
      const next = [...current];
      const selectedIndex = current.findIndex((block) => block.id === insertionAfterId);
      next.splice(selectedIndex >= 0 ? selectedIndex + 1 : next.length, 0, ...mediaBlocks);
      return next;
    });
    setSelectedBlockId(mediaBlocks[mediaBlocks.length - 1].id);
    setEditingTextBlockId(null);
    setActiveTextTool(null);
  };

  const addSticker = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.currentTarget.value = "";
    const mediaType = file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("image/")
        ? "image"
        : null;
    if (!mediaType) {
      setNotice("Choose an image or video for your sticker.");
      return;
    }
    if (!hasStickerAnchorBlock) {
      setNotice("Add a text or image block before adding a sticker.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const canvas = document.querySelector<HTMLElement>(".editor-mode .strip-canvas");
      const canvasBounds = canvas?.getBoundingClientRect();
      const anchorBlocks = canvas
        ? Array.from(canvas.children)
            .filter(
              (element): element is HTMLElement =>
                element instanceof HTMLElement &&
                (element.classList.contains("text-block") ||
                  element.classList.contains("image-block")),
            )
            .map((element) => ({
              element,
              bounds: element.getBoundingClientRect(),
            }))
            .filter(({ bounds }) => bounds.height > 0)
        : [];
      if (!canvas || !canvasBounds || anchorBlocks.length === 0) {
        setNotice("Add a text or image block before adding a sticker.");
        return;
      }
      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportOffsetTop = viewport?.offsetTop ?? 0;
      const placementLine = viewportOffsetTop + viewportHeight * 0.42;
      const selectedAnchor = anchorBlocks.find(
        ({ element }) => element.dataset.blockId === selectedBlockId,
      );
      const targetAnchor =
        selectedAnchor ??
        anchorBlocks.reduce((closest, candidate) => {
          const closestCenter = (closest.bounds.top + closest.bounds.bottom) / 2;
          const candidateCenter = (candidate.bounds.top + candidate.bounds.bottom) / 2;
          return Math.abs(candidateCenter - placementLine) <
            Math.abs(closestCenter - placementLine)
            ? candidate
            : closest;
        });
      const canvasWidth = Math.max(1, canvasBounds.width);
      const id = makeId();
      const y =
        Math.min(
          targetAnchor.bounds.bottom - 1,
          Math.max(targetAnchor.bounds.top + 1, placementLine),
        ) - canvasBounds.top;
      const width = Math.min(
        34,
        Math.max(24, (132 / canvasWidth) * 100),
      );
      setBlocks((current) => [
        ...current,
        {
          id,
          type: "sticker",
          src: reader.result as string,
          alt: file.name.replace(/\.[^/.]+$/, ""),
          mediaType,
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
    if (target < 0 || target >= blocks.length) return;

    const root = document.documentElement;
    const body = document.body;
    const scrollTop = window.scrollY;
    if (!blockReorderOverflowAnchorRef.current) {
      blockReorderOverflowAnchorRef.current = {
        root: root.style.overflowAnchor,
        body: body.style.overflowAnchor,
      };
    }
    root.style.overflowAnchor = "none";
    body.style.overflowAnchor = "none";
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (blockReorderFrameRef.current !== null) {
      window.cancelAnimationFrame(blockReorderFrameRef.current);
    }
    if (blockReorderReleaseFrameRef.current !== null) {
      window.cancelAnimationFrame(blockReorderReleaseFrameRef.current);
    }

    if (target === 0 || index === 0) {
      const nextTopBlock = target === 0 ? blocks[index] : blocks[target];
      const mediaWillBecomeTop =
        blocks[0]?.type !== "image" &&
        blocks[0]?.type !== "video" &&
        (nextTopBlock?.type === "image" || nextTopBlock?.type === "video");
      skipLeadingImagePlacementOnReorderRef.current = mediaWillBecomeTop;
      suppressLeadingImageSettleUntilTouchRef.current = mediaWillBecomeTop;
    }

    flushSync(() => {
      setBlocks((current) => {
        const next = [...current];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
    });

    const restoreViewport = () => {
      window.scrollTo({ top: scrollTop, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = scrollTop;
      document.body.scrollTop = scrollTop;
    };

    restoreViewport();
    blockReorderFrameRef.current = window.requestAnimationFrame(() => {
      blockReorderFrameRef.current = null;
      restoreViewport();
      blockReorderReleaseFrameRef.current = window.requestAnimationFrame(() => {
        blockReorderReleaseFrameRef.current = null;
        restoreViewport();
        const originalOverflowAnchor = blockReorderOverflowAnchorRef.current;
        if (!originalOverflowAnchor) return;
        root.style.overflowAnchor = originalOverflowAnchor.root;
        body.style.overflowAnchor = originalOverflowAnchor.body;
        blockReorderOverflowAnchorRef.current = null;
      });
    });
  };

  const hasContent = blocks.length > 0;
  const selectedBlockIndex = blocks.findIndex((block) => block.id === selectedBlockId);
  const selectedBlock = selectedBlockIndex >= 0 ? blocks[selectedBlockIndex] : undefined;
  const endingIsSelected = selectedBlockId === STRIP_ENDING_BLOCK_ID;
  const [overlappingStickerIds, setOverlappingStickerIds] = useState<string[]>([]);
  useLayoutEffect(() => {
    if (
      view !== "edit" ||
      inlinePreview ||
      !selectedBlockId ||
      suppressSelectedBlockAutoFocusRef.current
    ) {
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        focusSelectedBlockWithToolbar(selectedBlockId);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [selectedBlockId, view]);
  useLayoutEffect(() => {
    const selected = blocks.find((block) => block.id === selectedBlockId);
    const selectedIsEnding = selectedBlockId === STRIP_ENDING_BLOCK_ID;
    if (
      view !== "edit" ||
      (!selected && !selectedIsEnding) ||
      selected?.type === "sticker"
    ) {
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
      const activeTools = selectedElement?.querySelector<HTMLElement>(".block-controls");
      const selectedIsText = selected?.type === "text";
      const textIsBeingTypedIn =
        selectedIsText && editingTextBlockId === selected.id;
      const overlapTargets = [
        ...(activeTools && !textIsBeingTypedIn
          ? [activeTools.getBoundingClientRect()]
          : []),
        ...(selectedElement && (selectedIsText || selectedIsEnding)
          ? [selectedElement.getBoundingClientRect()]
          : []),
      ];

      if (overlapTargets.length === 0) {
        setOverlappingStickerIds((current) => (current.length === 0 ? current : []));
        return;
      }

      const nextIds = Array.from(
        canvas.querySelectorAll<HTMLElement>(".sticker-block"),
      )
        .filter((sticker) => {
          const stickerBounds = sticker.getBoundingClientRect();
          return overlapTargets.some(
            (targetBounds) =>
              stickerBounds.left < targetBounds.right &&
              stickerBounds.right > targetBounds.left &&
              stickerBounds.top < targetBounds.bottom &&
              stickerBounds.bottom > targetBounds.top,
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
  }, [blocks, editingTextBlockId, selectedBlockId, view]);
  const pendingDeleteBlock = blocks.find((block) => block.id === pendingDeleteId);
  const visualCoverBlocks = blocks.filter(
    (block): block is ImageBlock | StickerBlock =>
      block.type === "image" ||
      (block.type === "sticker" && block.mediaType !== "video"),
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
  const hasCoverImages = visualCoverBlocks.length > 0 || Boolean(customCoverSrc);
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
    ...visualCoverBlocks.map((block, index) => ({
      key: `${block.type}:${block.id}`,
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
      layoutClass: currentControls?.classList.contains("app-navigation-controls")
        ? "app-navigation-controls"
        : "",
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
    libraryScrollInsetRef.current = 0;
    flushSync(() => {
      setDockTransition(dockSnapshot);
      setDockTransitionStarted(false);
      setLibraryScrollInset(0);
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
    preserveScroll = false,
  ) => {
    const root = document.documentElement;
    const preservedScrollTop = preserveScroll ? Math.max(0, window.scrollY) : 0;
    cancelDockTransitionSchedule();
    root.classList.remove("strip-page-transitioning");
    libraryScrollInsetRef.current = preservedScrollTop;
    flushSync(() => {
      setLegacyPageTransition(null);
      setDockTransition(null);
      setDockTransitionStarted(false);
      setLibraryScrollInset(preservedScrollTop);
      setView(nextView);
    });
    if (!preserveScroll) {
      const top =
        nextScroll === "end"
          ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
          : 0;
      window.scrollTo({ top, behavior: "auto" });
      document.documentElement.scrollTop = top;
      document.body.scrollTop = top;
    }
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

  const resetTransientNavigationState = () => {
    const root = document.documentElement;
    pageTransitionInFlightRef.current = false;
    cancelDockTransitionSchedule();
    setOpeningStripId(null);
    setOpeningDraftId(null);
    setLegacyPageTransition(null);
    setDockTransition(null);
    setDockTransitionStarted(false);
    root.classList.remove(
      "strip-page-transitioning",
      "strip-standard-page-entering",
    );
    root.style.removeProperty("--page-transition-duration");
  };

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resetTransientNavigationState();
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

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

  useEffect(() => {
    if (!inlinePreview) return;

    const rememberPreviewScroll = () => {
      inlinePreviewScrollRef.current = window.scrollY;
    };

    window.addEventListener("scroll", rememberPreviewScroll, { passive: true });
    return () => window.removeEventListener("scroll", rememberPreviewScroll);
  }, [inlinePreview]);

  const toggleInlinePreview = () => {
    if (!inlinePreview && !hasContent) {
      setNotice("Add something to preview.");
      return;
    }

    inlinePreviewScrollRef.current = window.scrollY;
    const consumesPreviewHistory =
      inlinePreview && inlinePreviewHistoryEntryRef.current;
    if (!inlinePreview) {
      const currentHistoryState =
        window.history.state && typeof window.history.state === "object"
          ? { ...window.history.state }
          : {};
      currentHistoryState[INLINE_PREVIEW_HISTORY_KEY] = true;
      inlinePreviewBasePathRef.current = window.location.pathname;
      window.history.pushState(
        currentHistoryState,
        "",
        window.location.href,
      );
      inlinePreviewHistoryEntryRef.current = true;
    } else if (consumesPreviewHistory) {
      beginInlinePreviewExitLock(inlinePreviewScrollRef.current);
      window.history.back();
      return;
    }
    flushSync(() => {
      setActiveTextTool(null);
      setActiveEndingTool(null);
      setEditingTextBlockId(null);
      setInlinePreview((current) => !current);
    });

    const restoreScroll = () => {
      const scrollTop = inlinePreviewScrollRef.current;
      if (scrollTop === null) return;
      window.scrollTo({ top: scrollTop, left: 0, behavior: "auto" });
    };

    restoreScroll();
    window.requestAnimationFrame(() => {
      restoreScroll();
      inlinePreviewScrollRef.current = null;
    });
  };

  const restoreInlinePreviewExitScroll = (scrollTop: number) => {
    window.scrollTo({ top: scrollTop, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = scrollTop;
    document.body.scrollTop = scrollTop;
  };

  const releaseInlinePreviewExitLock = () => {
    const lock = inlinePreviewExitLockRef.current;
    if (!lock) return;
    restoreInlinePreviewExitScroll(lock.scrollTop);
    history.scrollRestoration = lock.scrollRestoration;
    document.documentElement.classList.remove("inline-preview-exit-locked");
    inlinePreviewExitLockRef.current = null;
    inlinePreviewScrollRef.current = null;
    suppressSelectedBlockAutoFocusRef.current = false;
    inlinePreviewExitTimerRef.current = null;
  };

  const beginInlinePreviewExitLock = (scrollTop: number) => {
    if (inlinePreviewExitFrameRef.current !== null) {
      window.cancelAnimationFrame(inlinePreviewExitFrameRef.current);
      inlinePreviewExitFrameRef.current = null;
    }
    if (inlinePreviewExitSettleFrameRef.current !== null) {
      window.cancelAnimationFrame(inlinePreviewExitSettleFrameRef.current);
      inlinePreviewExitSettleFrameRef.current = null;
    }
    if (inlinePreviewExitTimerRef.current !== null) {
      window.clearTimeout(inlinePreviewExitTimerRef.current);
      inlinePreviewExitTimerRef.current = null;
    }

    if (!inlinePreviewExitLockRef.current) {
      inlinePreviewExitLockRef.current = {
        scrollTop,
        scrollRestoration: history.scrollRestoration,
      };
    } else {
      inlinePreviewExitLockRef.current.scrollTop = scrollTop;
    }
    history.scrollRestoration = "manual";
    document.documentElement.classList.add("inline-preview-exit-locked");
    restoreInlinePreviewExitScroll(scrollTop);

    inlinePreviewExitTimerRef.current = window.setTimeout(
      releaseInlinePreviewExitLock,
      1000,
    );
  };

  const settleInlinePreviewExitLock = () => {
    const lock = inlinePreviewExitLockRef.current;
    if (!lock) return;
    if (inlinePreviewExitTimerRef.current !== null) {
      window.clearTimeout(inlinePreviewExitTimerRef.current);
      inlinePreviewExitTimerRef.current = null;
    }

    const restoreScroll = () => {
      const activeLock = inlinePreviewExitLockRef.current;
      if (!activeLock) return;
      restoreInlinePreviewExitScroll(activeLock.scrollTop);
    };

    restoreScroll();
    inlinePreviewExitFrameRef.current = window.requestAnimationFrame(() => {
      inlinePreviewExitFrameRef.current = null;
      restoreScroll();
      inlinePreviewExitSettleFrameRef.current = window.requestAnimationFrame(() => {
        inlinePreviewExitSettleFrameRef.current = null;
        restoreScroll();
        inlinePreviewExitTimerRef.current = window.setTimeout(
          releaseInlinePreviewExitLock,
          120,
        );
      });
    });
  };

  const exitInlinePreviewAndSelect = (blockId: string) => {
    if (!inlinePreview) return;
    inlinePreviewScrollRef.current = window.scrollY;
    inlinePreviewSelectionRef.current = blockId;
    suppressSelectedBlockAutoFocusRef.current = true;
    beginInlinePreviewExitLock(inlinePreviewScrollRef.current);
    triggerSelectionHaptic();

    if (inlinePreviewHistoryEntryRef.current) {
      window.history.back();
      return;
    }

    flushSync(() => {
      setInlinePreview(false);
      setSelectedBlockId(blockId);
      setEditingTextBlockId(null);
      setActiveTextTool(null);
      setActiveEndingTool(null);
    });
    restoreInlinePreviewExitScroll(inlinePreviewScrollRef.current);
    inlinePreviewSelectionRef.current = null;
    settleInlinePreviewExitLock();
  };

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
    setActiveEndingTool(null);
    setInlinePreview(false);
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
    setCoverColorPickerOpen(true);
  };

  const confirmCoverColor = () => {
    const color = pendingCoverColor.toUpperCase();
    if (isBlackCoverColor(color)) {
      setNotice("Our system can’t handle pure black covers.");
      return;
    }
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

  const requestSignInCode = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (authPending) return;
    setAuthPending(true);
    setAuthError("");
    setAuthDevelopmentCode("");
    try {
      const response = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: authPhone }),
      });
      const data = (await response.json()) as {
        error?: string;
        developmentCode?: string;
      };
      if (!response.ok) throw new Error(data.error || "Couldn’t send a code.");
      setAuthDevelopmentCode(data.developmentCode ?? "");
      setAuthTransitionDirection("forward");
      setAuthStep("code");
      setAuthCode("");
      setAuthResendSeconds(30);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Couldn’t send a code.");
    } finally {
      setAuthPending(false);
    }
  };

  const verifySignInCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authPending) return;
    setAuthPending(true);
    setAuthError("");
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: authPhone,
          code: authCode,
          legacyOwnerId: legacyOwnerIdRef.current || undefined,
        }),
      });
      const data = (await response.json()) as { user?: AuthUser; error?: string };
      if (!response.ok || !data.user) {
        throw new Error(data.error || "That code isn’t right.");
      }
      try {
        window.localStorage.removeItem(OWNER_STORAGE_KEY);
      } catch {
        // Storage cleanup should not interrupt a successful sign-in.
      }
      setAuthUser(data.user);
      setLibraryOwnerId(data.user.id);
      setAuthStatus("signed-in");
      setAuthenticationRequired(false);
      setAuthStep("landing");
      setAuthCode("");
      setAuthResendSeconds(0);
      setAuthDevelopmentCode("");
      initialRouteHandledRef.current = false;
      setInitialRouteReady(false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "That code isn’t right.");
    } finally {
      setAuthPending(false);
    }
  };

  const claimUsername = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authPending) return;
    const username = authUsername.trim().toLowerCase();
    setAuthPending(true);
    setAuthUsernameError("");
    try {
      const response = await fetch("/api/auth/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = (await response.json()) as { user?: AuthUser; error?: string };
      if (!response.ok || !data.user) {
        throw new Error(data.error || "Couldn’t save that username.");
      }
      const claimedUser = data.user;
      setAuthUser(claimedUser);
      setAuthUsername(claimedUser.username ?? username);
      setPublishedStrips((current) =>
        current.map((strip) => ({ ...strip, username: claimedUser.username })),
      );
    } catch (error) {
      setAuthUsernameError(
        error instanceof Error ? error.message : "Couldn’t save that username.",
      );
    } finally {
      setAuthPending(false);
    }
  };

  const editSignInPhone = () => {
    flushSync(() => {
      setAuthTransitionDirection("backward");
      setAuthStep("phone");
      setAuthCode("");
      setAuthResendSeconds(0);
      setAuthError("");
      setAuthDevelopmentCode("");
    });
    authPhoneInputRef.current?.focus({ preventScroll: true });
  };

  const beginSignIn = () => {
    flushSync(() => {
      setAuthTransitionDirection("forward");
      setAuthStep("phone");
      setAuthError("");
      setAuthDevelopmentCode("");
    });
    authPhoneInputRef.current?.focus({ preventScroll: true });
  };

  const returnToAuthLanding = () => {
    setAuthTransitionDirection("backward");
    setAuthStep("landing");
    setAuthPhone("");
    setAuthCode("");
    setAuthResendSeconds(0);
    setAuthError("");
    setAuthDevelopmentCode("");
  };

  const signOut = async () => {
    if (authPending) return;
    setAuthPending(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      setPublishedStrips([]);
      setDraftStrips([]);
      setViewedStrips([]);
      setLibraryOwnerId("");
      setAuthUser(null);
      setAuthUsername("");
      setAuthUsernameError("");
      setAuthStatus("signed-out");
      setAuthenticationRequired(true);
      setAuthTransitionDirection("forward");
      setAuthStep("landing");
      setAuthPhone("");
      setAuthCode("");
      setAuthResendSeconds(0);
      setBrowserPath("/", true);
      setView("library");
      initialRouteHandledRef.current = false;
      setInitialRouteReady(false);
      setAuthPending(false);
    }
  };

  const beginNewStrip = () => {
    if (authStatus !== "signed-in") {
      setAuthenticationRequired(true);
      return;
    }
    const draftId = makeId();
    setCurrentDraftId(draftId);
    setCurrentDraftCreatedAt(Date.now());
    setEditingPublishedStripId(null);
    setBlocks([]);
    setEndingStyle(DEFAULT_STRIP_ENDING_STYLE);
    setStripTitle("");
    setSelectedCover("");
    setActiveCoverKey("");
    setCustomCoverSrc(null);
    setCustomCoverColors([]);
    setCoverColorShape("square");
    setSelectedBlockId(null);
    setEditingTextBlockId(null);
    setActiveTextTool(null);
    setActiveEndingTool(null);
    setOpenedPublishedStrip(null);
    setBrowserPath(`/edit/${encodeURIComponent(draftId)}`);
    setViewInstantly("edit");
  };

  const deleteDraft = async (draftId: string) => {
    if (deletingDraftRef.current) return;
    deletingDraftRef.current = true;
    setDeletingDraftId(draftId);

    try {
      const response = await fetch(
        `/api/drafts/${encodeURIComponent(draftId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Draft delete failed");

      if (draftSaveTimerRef.current !== null && currentDraftId === draftId) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      if (currentDraftId === draftId) {
        draftSaveSequenceRef.current += 1;
        setCurrentDraftId(null);
        setCurrentDraftCreatedAt(0);
      }
      setDraftStrips((current) =>
        current.filter((draft) => draft.id !== draftId),
      );
      setPendingDraftDeleteId(null);
      setNotice("Draft deleted.");
    } catch {
      setNotice("Couldn’t delete this draft. Try again.");
    } finally {
      deletingDraftRef.current = false;
      setDeletingDraftId(null);
    }
  };

  const openDraft = async (draft: DraftStripSummary) => {
    if (!libraryOwnerId || openingDraftId || pageTransitionInFlightRef.current) return;
    setOpeningDraftId(draft.id);
    pageTransitionInFlightRef.current = true;
    try {
      const response = await fetch(
        `/api/drafts/${encodeURIComponent(draft.id)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Draft request failed");
      const data = (await response.json()) as { draft: DraftStripDetail };
      setCurrentDraftId(data.draft.id);
      setCurrentDraftCreatedAt(data.draft.createdAt);
      setEditingPublishedStripId(data.draft.publishedStripId ?? null);
      setBlocks(data.draft.blocks);
      setEndingStyle(data.draft.endingStyle ?? DEFAULT_STRIP_ENDING_STYLE);
      setStripTitle(data.draft.title);
      setSelectedBlockId(null);
      setEditingTextBlockId(null);
      setActiveTextTool(null);
      setActiveEndingTool(null);
      setSelectedCover("");
      setActiveCoverKey("");
      setCustomCoverSrc(null);
      setCustomCoverColors([]);
      setCoverColorShape("square");
      setBrowserPath(`/edit/${encodeURIComponent(data.draft.id)}`);
      setViewInstantly("edit");
    } catch {
      setNotice("Couldn’t open this draft. Try again.");
    } finally {
      setOpeningDraftId(null);
      pageTransitionInFlightRef.current = false;
    }
  };

  const openLibrarySection = (
    nextView: "library" | "drafts" | "history" | "settings",
  ) => {
    if (view === nextView) return;
    if (pageTransitionInFlightRef.current) return;
    setBrowserPath(
      nextView === "library"
        ? "/"
        : nextView === "drafts"
          ? "/drafts"
          : nextView === "history"
            ? "/history"
            : "/settings",
    );
    void transitionToViewStandard(nextView, "top", true);
  };

  const openDraftLibrary = () => openLibrarySection("drafts");
  const openHistory = () => openLibrarySection("history");
  const openSettings = () => openLibrarySection("settings");
  const returnToLibrary = () => openLibrarySection("library");

  const openPublishedStrip = async (strip: PublishedStripSummary) => {
    if (!libraryOwnerId || openingStripId || pageTransitionInFlightRef.current) return;
    setOpeningStripId(strip.id);
    setViewedStrips((current) => [
      { ...strip, viewedAt: Date.now() },
      ...current.filter((viewedStrip) => viewedStrip.id !== strip.id),
    ]);
    pageTransitionInFlightRef.current = true;
    try {
      await fetch("/api/auth/session", { cache: "no-store" });
    } catch {
      // The published Strip remains public if session promotion is unavailable.
    }
    window.location.assign(publicStripUrl(strip));
  };

  const returnToLibraryFromPublished = async () => {
    if (pageTransitionInFlightRef.current) return;
    pageTransitionInFlightRef.current = true;
    try {
      setBrowserPath("/");
      await transitionToViewStandard("library");
      setOpenedPublishedStrip(null);
      if (authStatus !== "signed-in") setAuthenticationRequired(true);
    } finally {
      pageTransitionInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (authStatus === "loading" || initialRouteHandledRef.current) return;
    initialRouteHandledRef.current = true;
    let cancelled = false;

    const applyRoute = async () => {
      try {
        const route = routeFromLocation(
          window.location.pathname,
          window.location.hostname,
        );
        if (route.kind === "published") {
          setAuthenticationRequired(false);
          try {
            const response = await fetch(`/api/strips/${encodeURIComponent(route.id)}`, {
              cache: "no-store",
            });
            if (!response.ok) throw new Error("Published route request failed");
            const data = (await response.json()) as { strip: PublishedStripDetail };
            if (
              route.username &&
              data.strip.username?.toLowerCase() !== route.username
            ) {
              throw new Error("Published route username mismatch");
            }
            if (cancelled) return;
            setPublishedCoverSettledKey(null);
            setPublishedLoaderDismissedKey(null);
            setOpenedPublishedStrip(data.strip);
            setView("published");
            window.scrollTo({ top: 0, behavior: "auto" });
          } catch {
            if (cancelled) return;
            setBrowserPath("/", true);
            setView("library");
            setAuthenticationRequired(authStatus !== "signed-in");
            setNotice("Couldn’t open this Strip.");
          }
          return;
        }

        if (authStatus !== "signed-in" || !libraryOwnerId) {
          setAuthenticationRequired(true);
          setView("library");
          setOpenedPublishedStrip(null);
          window.scrollTo({ top: 0, behavior: "auto" });
          return;
        }
        setAuthenticationRequired(false);
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
        if (route.kind === "history") {
          setView("history");
          setOpenedPublishedStrip(null);
          window.scrollTo({ top: 0, behavior: "auto" });
          return;
        }
        if (route.kind === "settings") {
          setView("settings");
          setOpenedPublishedStrip(null);
          window.scrollTo({ top: 0, behavior: "auto" });
          return;
        }
        if (route.kind === "edit") {
          try {
            const response = await fetch(
              `/api/drafts/${encodeURIComponent(route.id)}`,
              { cache: "no-store" },
            );
            if (cancelled) return;
            if (response.status === 404) {
              setCurrentDraftId(route.id);
              setCurrentDraftCreatedAt(Date.now());
              setEditingPublishedStripId(null);
              setBlocks([]);
              setEndingStyle(DEFAULT_STRIP_ENDING_STYLE);
              setStripTitle("");
            } else {
              if (!response.ok) throw new Error("Draft route request failed");
              const data = (await response.json()) as { draft: DraftStripDetail };
              if (cancelled) return;
              setCurrentDraftId(data.draft.id);
              setCurrentDraftCreatedAt(data.draft.createdAt);
              setEditingPublishedStripId(data.draft.publishedStripId ?? null);
              setBlocks(data.draft.blocks);
              setEndingStyle(
                data.draft.endingStyle ?? DEFAULT_STRIP_ENDING_STYLE,
              );
              setStripTitle(data.draft.title);
            }
            setSelectedBlockId(null);
            setEditingTextBlockId(null);
            setActiveTextTool(null);
            setActiveEndingTool(null);
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
          setView("share");
          window.scrollTo({ top: 0, behavior: "auto" });
        } catch {
          if (cancelled) return;
          setBrowserPath("/", true);
          setView("library");
          setNotice("Couldn’t open this Strip.");
        }
      } finally {
        if (!cancelled) setInitialRouteReady(true);
      }
    };

    const handlePopState = (event: PopStateEvent) => {
      if (inlinePreviewHistoryEntryRef.current) {
        inlinePreviewHistoryEntryRef.current = false;
        const selectedPreviewBlockId = inlinePreviewSelectionRef.current;
        inlinePreviewSelectionRef.current = null;
        const scrollTop = inlinePreviewScrollRef.current ?? window.scrollY;
        inlinePreviewBasePathRef.current ??= window.location.pathname;
        if (selectedPreviewBlockId) {
          suppressSelectedBlockAutoFocusRef.current = true;
        }
        beginInlinePreviewExitLock(scrollTop);
        flushSync(() => {
          setInlinePreview(false);
          if (selectedPreviewBlockId) {
            setSelectedBlockId(selectedPreviewBlockId);
          }
          setEditingTextBlockId(null);
          setActiveTextTool(null);
          setActiveEndingTool(null);
        });
        restoreInlinePreviewExitScroll(scrollTop);
        settleInlinePreviewExitLock();
        return;
      }

      if (
        event.state &&
        typeof event.state === "object" &&
        event.state[INLINE_PREVIEW_HISTORY_KEY] === true &&
        routeFromLocation(window.location.pathname, window.location.hostname).kind ===
          "edit"
      ) {
        inlinePreviewHistoryEntryRef.current = true;
        inlinePreviewBasePathRef.current = window.location.pathname;
        inlinePreviewScrollRef.current = window.scrollY;
        flushSync(() => {
          setActiveTextTool(null);
          setActiveEndingTool(null);
          setEditingTextBlockId(null);
          setInlinePreview(true);
        });
        return;
      }

      const previewBasePath = inlinePreviewBasePathRef.current;
      if (
        previewBasePath &&
        window.location.pathname === previewBasePath &&
        routeFromLocation(window.location.pathname, window.location.hostname).kind ===
          "edit"
      ) {
        window.history.back();
        return;
      }
      inlinePreviewBasePathRef.current = null;
      if (inlinePreviewExitLockRef.current) {
        releaseInlinePreviewExitLock();
      }

      resetTransientNavigationState();
      void applyRoute();
    };
    void applyRoute();
    window.addEventListener("popstate", handlePopState);
    return () => {
      cancelled = true;
      window.removeEventListener("popstate", handlePopState);
    };
  }, [authStatus, libraryOwnerId]);

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
    const stripId = editingPublishedStripId ?? makeId();
    const publishedAt = Date.now();
    pageTransitionInFlightRef.current = true;
    setPublishing(true);
    try {
      const response = await fetch("/api/strips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: stripId,
          draftId: currentDraftId,
          title: stripTitle.trim(),
          publishedAt,
          cover: publishedCover,
          blocks,
          endingStyle,
        }),
      });
      if (!response.ok) throw new Error("Publish request failed");
      const data = (await response.json()) as {
        strip: PublishedStripSummary;
      };
      setPublishedStrips((current) => [
        data.strip,
        ...current.filter((strip) => strip.id !== data.strip.id),
      ]);
      setOpenedPublishedStrip({
        ...data.strip,
        blocks,
        endingStyle,
        viewerIsOwner: true,
      });
      if (currentDraftId) {
        try {
          await fetch(
            `/api/drafts/${encodeURIComponent(currentDraftId)}`,
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
      setEditingPublishedStripId(null);
      setEditingTextBlockId(null);
      setActiveTextTool(null);
      setActiveEndingTool(null);
      setSelectedBlockId(null);
      setBlocks([]);
      setEndingStyle(DEFAULT_STRIP_ENDING_STYLE);
      setStripTitle("");
      setSelectedCover("");
      setActiveCoverKey("");
      setCustomCoverSrc(null);
      setCustomCoverColors([]);
      setCoverColorShape("square");
      setBrowserPath(`/share/${encodeURIComponent(stripId)}`);
      await transitionToView("share", "forward", "top", false);
    } catch {
      setNotice("Couldn’t publish this Strip. Try again.");
    } finally {
      setPublishing(false);
      pageTransitionInFlightRef.current = false;
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        openedPublishedStrip
          ? publicStripUrl(openedPublishedStrip)
          : window.location.href,
      );
      setNotice("Link copied.");
    } catch {
      setNotice("Copy the address from your browser.");
    }
  };

  const copyPublishedStripLink = async () => {
    if (!openedPublishedStrip) return;
    const stripUrl = publicStripUrl(openedPublishedStrip);
    try {
      await navigator.clipboard.writeText(stripUrl);
      setNotice("Strip link copied.");
    } catch {
      setNotice("Copy the Strip link from its published page.");
    }
  };

  const sharePublishedStripFromReader = async () => {
    if (!openedPublishedStrip) return;
    const stripUrl = publicStripUrl(openedPublishedStrip);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: openedPublishedStrip.title || "Strip",
          url: stripUrl,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyPublishedStripLink();
  };

  const makeOwnStripFromReader = () => {
    window.location.assign(
      `${mainAppOrigin()}/edit/${encodeURIComponent(makeId())}`,
    );
  };

  const editPublishedStripFromReader = async () => {
    if (
      !openedPublishedStrip?.viewerIsOwner ||
      pageTransitionInFlightRef.current
    ) {
      return;
    }
    pageTransitionInFlightRef.current = true;
    try {
      const response = await fetch(
        `/api/strips/${encodeURIComponent(openedPublishedStrip.id)}/draft`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Published draft request failed");
      const data = (await response.json()) as { draft: { id: string } };
      window.location.assign(
        `${mainAppOrigin()}/edit/${encodeURIComponent(data.draft.id)}`,
      );
    } catch {
      pageTransitionInFlightRef.current = false;
      setNotice("Couldn’t open this Strip for editing. Try again.");
    }
  };

  const downloadStoryAsset = () => {
    if (!storyAssetFile || !storyAssetUrl) return;
    const link = document.createElement("a");
    link.href = storyAssetUrl;
    link.download = storyAssetFile.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setNotice("Share image saved.");
  };

  const shareStoryToInstagram = async () => {
    if (!storyAssetFile) {
      setNotice(storyAssetLoading ? "Finishing your share image…" : "Try again.");
      return;
    }
    const shareData: ShareData = { files: [storyAssetFile] };
    const supportsFileSharing =
      typeof navigator.share === "function" &&
      (typeof navigator.canShare !== "function" || navigator.canShare(shareData));
    if (!supportsFileSharing) {
      downloadStoryAsset();
      return;
    }
    try {
      await navigator.share(shareData);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      downloadStoryAsset();
    }
  };

  const toggleVideoPlaybackAudio = (blockId: string) => {
    const nextAudibleVideoId = audibleVideoId === blockId ? null : blockId;
    const videos = Array.from(
      document.querySelectorAll<HTMLVideoElement>(".video-block video"),
    );

    videos.forEach((video) => {
      video.muted = true;
    });

    if (nextAudibleVideoId) {
      const audibleVideo = videos.find(
        (video) =>
          video.closest<HTMLElement>(".video-block")?.dataset.blockId ===
          nextAudibleVideoId,
      );
      if (audibleVideo) audibleVideo.muted = false;
    }

    videos.forEach((video) => {
      const bounds = video.getBoundingClientRect();
      if (bounds.bottom > 0 && bounds.top < window.innerHeight) {
        void video.play().catch(() => {});
      }
    });
    setAudibleVideoId(nextAudibleVideoId);
  };

  const toggleVideoAudioSetting = (blockId: string) => {
    const disablingAudio = blocks.some(
      (block) =>
        block.id === blockId &&
        block.type === "video" &&
        block.audioEnabled !== false,
    );
    setBlocks((current) =>
      current.map((block) => {
        if (block.id !== blockId || block.type !== "video") return block;
        return { ...block, audioEnabled: block.audioEnabled === false };
      }),
    );
    if (disablingAudio && audibleVideoId === blockId) {
      document
        .querySelectorAll<HTMLVideoElement>(
          `.video-block[data-block-id="${blockId}"] video`,
        )
        .forEach((video) => {
          video.muted = true;
        });
      setAudibleVideoId(null);
    }
  };

  const recordVideoAudioPresence = (blockId: string, hasAudio: boolean) => {
    setVideoAudioPresence((current) =>
      current[blockId] === hasAudio
        ? current
        : { ...current, [blockId]: hasAudio },
    );
    if (view === "published") return;
    setBlocks((current) =>
      current.map((block) =>
        block.id === blockId &&
        block.type === "video" &&
        block.hasAudio !== hasAudio
          ? { ...block, hasAudio }
          : block,
      ),
    );
  };

  const recordBlockHeight = (blockId: string, height: number) => {
    setBlocks((current) => {
      let changed = false;
      const next = current.map((block) => {
        if (
          block.id !== blockId ||
          block.type === "sticker" ||
          Math.abs((block.height ?? 0) - height) < 1
        ) {
          return block;
        }
        changed = true;
        return { ...block, height };
      });
      return changed ? next : current;
    });
  };

  const settleMediaLoad = (blockId: string, loadedSuccessfully: boolean) => {
    setMediaLoadStatus((current) => {
      const status = loadedSuccessfully ? "loaded" : "error";
      return current[blockId] === status
        ? current
        : { ...current, [blockId]: status };
    });
  };

  const startHeightCrop = (block: ImageBlock | VideoBlock) => {
    const content = document.querySelector<HTMLElement>(
      `.editor-mode .strip-block[data-block-id="${block.id}"] .block-crop-content`,
    );
    const measuredHeight = content?.getBoundingClientRect().height ?? 0;
    const sourceHeight = Math.max(
      MIN_CROPPED_BLOCK_HEIGHT,
      block.height ?? 0,
      measuredHeight,
    );
    const maxCrop = Math.max(0, sourceHeight - MIN_CROPPED_BLOCK_HEIGHT);
    const initialTop = Math.min(maxCrop, Math.max(0, block.cropTop ?? 0));
    const initialBottom = Math.min(
      Math.max(0, maxCrop - initialTop),
      Math.max(0, block.cropBottom ?? 0),
    );

    setEditingTextBlockId(null);
    setActiveTextTool(null);
    setHeightCropSession({
      blockId: block.id,
      sourceHeight,
      initialTop,
      initialBottom,
      top: initialTop,
      bottom: initialBottom,
    });
  };

  const finishHeightCrop = (commit: boolean) => {
    const session = heightCropSession;
    if (!session) return;

    if (commit) {
      const maxCrop = Math.max(
        0,
        session.sourceHeight - MIN_CROPPED_BLOCK_HEIGHT,
      );
      const cropTop = Math.round(
        Math.min(maxCrop, Math.max(0, session.top)),
      );
      const cropBottom = Math.round(
        Math.min(
          Math.max(0, maxCrop - cropTop),
          Math.max(0, session.bottom),
        ),
      );
      setBlocks((current) =>
        current.map((block) =>
          block.id === session.blockId &&
          (block.type === "image" || block.type === "video")
            ? {
                ...block,
                cropTop: cropTop || undefined,
                cropBottom: cropBottom || undefined,
              }
            : block,
        ),
      );
    }

    heightCropDragRef.current = null;
    setHeightCropSession(null);
  };

  const releaseHeightCropForSelection = (blockId: string) => {
    if (!heightCropSession) return true;
    if (heightCropSession.blockId === blockId) return false;
    finishHeightCrop(true);
    return true;
  };

  const beginHeightCropDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    edge: "top" | "bottom",
  ) => {
    const session = heightCropSession;
    if (!session) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    heightCropDragRef.current = {
      blockId: session.blockId,
      edge,
      pointerId: event.pointerId,
      startY: event.clientY,
      startTop: session.top,
      startBottom: session.bottom,
      sourceHeight: session.sourceHeight,
    };
  };

  const updateHeightCropDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = heightCropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = event.clientY - drag.startY;
    const maxCrop = Math.max(
      0,
      drag.sourceHeight - MIN_CROPPED_BLOCK_HEIGHT,
    );
    const top =
      drag.edge === "top"
        ? Math.min(
            Math.max(0, maxCrop - drag.startBottom),
            Math.max(0, drag.startTop + delta),
          )
        : drag.startTop;
    const bottom =
      drag.edge === "bottom"
        ? Math.min(
            Math.max(0, maxCrop - drag.startTop),
            Math.max(0, drag.startBottom - delta),
          )
        : drag.startBottom;

    setHeightCropSession((current) =>
      current?.blockId === drag.blockId ? { ...current, top, bottom } : current,
    );
  };

  const endHeightCropDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = heightCropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    heightCropDragRef.current = null;
  };

  const renderHeightCropHandles = (
    block: ImageBlock | VideoBlock,
    crop: ReturnType<typeof resolveBlockHeightCrop>,
  ) => {
    if (!crop.isEditing) return null;
    const handleColor = "#FFFFFF";

    return (
      <>
        <span
          className="height-crop-shade is-top"
          style={{ height: `${crop.top}px` }}
          aria-hidden="true"
        />
        <span
          className="height-crop-shade is-bottom"
          style={{
            top: `${Math.max(0, crop.sourceHeight - crop.bottom)}px`,
            height: `${crop.bottom}px`,
          }}
          aria-hidden="true"
        />
        <div
          className="height-crop-handles is-media"
          style={{
            color: handleColor,
            top: `${crop.top}px`,
            ...(crop.height !== undefined ? { height: `${crop.height}px` } : {}),
          }}
          role="group"
          aria-label="Crop block height"
        >
          <span className="height-crop-frame" aria-hidden="true" />
          {(["top", "bottom"] as const).map((edge) => (
            <button
              className={`height-crop-handle is-${edge}`}
              type="button"
              key={edge}
              onPointerDown={(event) => beginHeightCropDrag(event, edge)}
              onPointerMove={updateHeightCropDrag}
              onPointerUp={endHeightCropDrag}
              onPointerCancel={endHeightCropDrag}
              onLostPointerCapture={() => {
                heightCropDragRef.current = null;
              }}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Drag ${edge} edge to crop`}
            >
              <span
                className="height-crop-grip"
                style={{
                  backgroundColor: handleColor,
                  color: contrastColor(handleColor),
                }}
                aria-hidden="true"
              >
                <GripHorizontal />
              </span>
            </button>
          ))}
        </div>
      </>
    );
  };

  const renderBlockControls = (block: StripBlock, index: number) => {
    if (selectedBlockId !== block.id) return null;
    const firstFlowBlockIndex = blocks.findIndex(
      (candidate) => candidate.type !== "sticker",
    );

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
                setLastTextTool(tool);
                setActiveTextTool(tool);
              }
            : undefined
        }
        activeTextTool={activeTextTool}
        onHeightCrop={
          block.type === "image" || block.type === "video"
            ? () => startHeightCrop(block)
            : undefined
        }
        onVideoAudio={
          block.type === "video"
            ? () => toggleVideoAudioSetting(block.id)
            : undefined
        }
        videoMuted={block.type === "video" ? block.audioEnabled === false : undefined}
        surfaceColor={
          block.type === "text"
            ? block.backgroundColor ?? DEFAULT_BACKGROUND
            : block.type === "image"
              ? imageTrayColors[block.id]
              : block.type === "video"
                ? imageTrayColors[block.id] ?? "#000000"
              : undefined
        }
        imageSrc={block.type === "image" ? block.src : undefined}
        stickerRotation={block.type === "sticker" ? block.rotation ?? 0 : undefined}
        showTopEdge={!(block.type === "text" && index === firstFlowBlockIndex)}
        closing={heightCropSession?.blockId === block.id}
      />
    );
  };

  const renderEndingControls = () => {
    if (!endingIsSelected) return null;
    return (
      <BlockControls
        index={0}
        count={1}
        onEndingTool={(tool) => {
          setEditingTextBlockId(null);
          setActiveTextTool(null);
          setActiveEndingTool(tool);
        }}
        activeEndingTool={activeEndingTool}
        surfaceColor={endingStyle.backgroundColor}
      />
    );
  };

  const selectEndingBlock = () => {
    if (!endingIsSelected) triggerSelectionHaptic();
    setSelectedBlockId(STRIP_ENDING_BLOCK_ID);
    setEditingTextBlockId(null);
    setActiveTextTool(null);
  };

  const showEndingPreviewActionNotice = () => {
    setNotice("These buttons are only live when your Strip is published.");
  };

  const renderStrip = (
    isEditing: boolean,
    sourceBlocks: StripBlock[] = blocks,
    sourceEndingStyle: StripEndingStyle = visibleEndingStyle,
  ) => {
    const mediaBlockIds = sourceBlocks.flatMap((block) =>
      block.type === "image" || block.type === "video" ? [block.id] : [],
    );
    const shouldLoadMedia = (blockId: string) => {
      const mediaIndex = mediaBlockIds.indexOf(blockId);
      if (!isEditing && view === "published") return mediaIndex >= 0;
      return (
        mediaIndex >= 0 &&
        mediaBlockIds
          .slice(0, mediaIndex)
          .every((precedingId) => mediaLoadStatus[precedingId] !== undefined)
      );
    };
    const stickerFloor = sourceBlocks.reduce(
      (floor, block) =>
        block.type === "sticker" ? Math.max(floor, block.y + 180) : floor,
      0,
    );
    const firstFlowBlock = sourceBlocks.find((block) => block.type !== "sticker");
    const showsEndingCard = view !== "published";
    const trailingFlowBlock = [...sourceBlocks]
      .reverse()
      .find((block) => block.type !== "sticker");
    const endingOverlapsMedia =
      showsEndingCard &&
      (trailingFlowBlock?.type === "image" || trailingFlowBlock?.type === "video");
    const endingFollowsText = showsEndingCard && trailingFlowBlock?.type === "text";
    const canvasMinHeight = stickerFloor > 0 ? `${stickerFloor}px` : undefined;
    const canvasStyle = {
      ...(canvasMinHeight ? { minHeight: canvasMinHeight } : {}),
      ...(endingFollowsText
        ? {
            backgroundColor:
              trailingFlowBlock.backgroundColor ?? DEFAULT_BACKGROUND,
          }
        : {}),
    } satisfies CSSProperties;

    return (
      <div
        className={`strip-canvas ${showsEndingCard ? "has-ending-card" : ""} ${
          endingOverlapsMedia ? "has-trailing-media" : ""
        } ${endingFollowsText ? "has-trailing-text" : ""}`}
        style={Object.keys(canvasStyle).length > 0 ? canvasStyle : undefined}
      >
        {sourceBlocks.length === 0 && isEditing ? (
          <div className="empty-strip">
            <p>Your Strip starts here.</p>
            <span>Add one block at a time.</span>
          </div>
        ) : null}

        {sourceBlocks.map((block, index) => {
        const heightCrop =
          block.type === "image" || block.type === "video"
            ? resolveBlockHeightCrop(block, heightCropSession)
            : null;
        if (block.type === "text") {
          const textIsBeingEdited = isEditing && editingTextBlockId === block.id;
          const textIsEmpty = block.content.length === 0;
          const textIsVisuallyBlank = block.content.trim().length === 0;
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
              onPointerDown={(event) => {
                if (heightCropSession?.blockId === block.id) return;
                beginBlockTapGesture(event, block.id);
              }}
              onPointerMove={trackBlockTapGesture}
              onPointerCancel={cancelBlockTapGesture}
              onClick={(event) => {
                if (
                  !isEditing ||
                  textIsBeingEdited ||
                  heightCropSession?.blockId === block.id
                ) {
                  return;
                }
                if (!completeBlockTapGesture(block.id)) return;
                if (!releaseHeightCropForSelection(block.id)) return;
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
              {isEditing ? renderBlockControls(block, index) : null}
              <div className="block-crop-viewport">
                <div className="block-crop-content text-block-content">
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
                      }}
                      placeholder="tap me to write"
                      aria-label={`Text block ${index + 1}`}
                      rows={1}
                    />
                  ) : (
                    <p
                      className={
                        isEditing && textIsEmpty
                          ? "is-placeholder"
                          : textIsEmpty
                            ? "is-blank"
                            : undefined
                      }
                      style={{ fontSize: `${block.fontSize ?? DEFAULT_FONT_SIZE}px` }}
                      aria-hidden={textIsVisuallyBlank || undefined}
                    >
                      {textIsEmpty
                        ? isEditing
                          ? "tap me to write"
                          : ""
                        : `${block.content}\u200B`}
                    </p>
                  )}
                  {isEditing ? (
                    <BlockHeightReporter
                      blockId={block.id}
                      onHeight={recordBlockHeight}
                    />
                  ) : null}
                </div>
              </div>
            </section>
          );
        }

        if (block.type === "image") {
          const cropViewportHeight = heightCrop?.isEditing
            ? heightCrop.sourceHeight
            : heightCrop?.height;
          return (
            <figure
              className={`strip-block image-block ${isEditing ? "is-editing" : ""} ${
                isEditing && selectedBlockId === block.id ? "is-selected" : ""
              } ${heightCrop?.isActive ? "is-height-cropped" : ""} ${
                heightCrop?.isEditing ? "is-height-cropping" : ""
              } ${
                heightCrop?.isEditing && firstFlowBlock?.id === block.id
                  ? "has-top-crop-clearance"
                  : ""
              }`}
              data-block-id={block.id}
              key={block.id}
              aria-busy={mediaLoadStatus[block.id] === undefined}
              style={
                mediaLoadStatus[block.id] === undefined &&
                block.height &&
                heightCrop?.height === undefined
                  ? { minHeight: block.height }
                  : undefined
              }
              onPointerDown={(event) => {
                if (heightCropSession?.blockId === block.id) return;
                beginBlockTapGesture(event, block.id);
              }}
              onPointerMove={trackBlockTapGesture}
              onPointerCancel={cancelBlockTapGesture}
              onClick={() => {
                if (!isEditing || heightCropSession?.blockId === block.id) return;
                if (!completeBlockTapGesture(block.id)) return;
                if (!releaseHeightCropForSelection(block.id)) return;
                if (selectedBlockId !== block.id) triggerSelectionHaptic();
                setSelectedBlockId(block.id);
                setEditingTextBlockId(null);
                setActiveTextTool(null);
              }}
            >
              {/* A Strip image is intentionally edge-to-edge. */}
              {isEditing ? renderBlockControls(block, index) : null}
              <div
                className="block-crop-viewport"
                style={
                  cropViewportHeight !== undefined
                    ? { height: `${cropViewportHeight}px` }
                    : undefined
                }
              >
                <div
                  className="block-crop-content"
                  style={
                    !heightCrop?.isEditing && heightCrop?.top
                      ? { transform: `translateY(${-heightCrop.top}px)` }
                      : undefined
                  }
                >
                  <img
                    src={shouldLoadMedia(block.id) ? block.src : undefined}
                    alt={block.alt}
                    loading="eager"
                    decoding="async"
                    style={
                      mediaLoadStatus[block.id] === "error"
                        ? { display: "none" }
                        : view === "published"
                          ? undefined
                          : {
                              visibility:
                                mediaLoadStatus[block.id] === "loaded"
                                  ? "visible"
                                  : "hidden",
                            }
                    }
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      void image
                        .decode()
                        .catch(() => {})
                        .then(() => {
                          settleMediaLoad(block.id, true);
                          if (
                            isEditing &&
                            !suppressSelectedBlockAutoFocusRef.current &&
                            selectedBlockId === block.id
                          ) {
                            window.requestAnimationFrame(() =>
                              focusSelectedBlockWithToolbar(block.id),
                            );
                          }
                          const sampledColor = sampleImageBottomColor(image);
                          if (!sampledColor) return;
                          setImageTrayColors((current) =>
                            current[block.id] === sampledColor
                              ? current
                              : { ...current, [block.id]: sampledColor },
                          );
                        });
                    }}
                    onError={() => settleMediaLoad(block.id, false)}
                  />
                  {isEditing ? (
                    <BlockHeightReporter
                      blockId={block.id}
                      onHeight={recordBlockHeight}
                    />
                  ) : null}
                </div>
              </div>
              {isEditing && heightCrop
                ? renderHeightCropHandles(block, heightCrop)
                : null}
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
              onTapSelectedText={(clientX, clientY, stickerElement) => {
                if (
                  !isEditing ||
                  heightCropSession ||
                  selectedBlock?.type !== "text"
                ) {
                  return false;
                }
                const selectedTextElement = Array.from(
                  document.querySelectorAll<HTMLElement>(
                    ".editor-mode .text-block",
                  ),
                ).find(
                  (element) => element.dataset.blockId === selectedBlock.id,
                );
                if (!selectedTextElement) return false;

                const bounds = selectedTextElement.getBoundingClientRect();
                const tapIsInsideTextBlock =
                  clientX >= bounds.left &&
                  clientX <= bounds.right &&
                  clientY >= bounds.top &&
                  clientY <= bounds.bottom;
                if (!tapIsInsideTextBlock) return false;

                const previousPointerEvents = stickerElement.style.pointerEvents;
                stickerElement.style.pointerEvents = "none";
                const caretOffset = caretOffsetAtPoint(
                  selectedTextElement,
                  clientX,
                  clientY,
                  selectedBlock.content.length,
                );
                stickerElement.style.pointerEvents = previousPointerEvents;
                enterTextEditing(selectedBlock.id, caretOffset);
                return true;
              }}
              onSelect={() => {
                if (!isEditing || !releaseHeightCropForSelection(block.id)) return;
                if (selectedBlockId !== block.id) triggerSelectionHaptic();
                setSelectedBlockId(block.id);
                setEditingTextBlockId(null);
                setActiveTextTool(null);
              }}
              onTransform={(transform) => {
                setBlocks((current) =>
                  current.map((currentBlock) =>
                    currentBlock.id === block.id && currentBlock.type === "sticker"
                      ? { ...currentBlock, ...transform }
                      : currentBlock,
                  ),
                );
              }}
              onLowerBoundaryAttempt={() =>
                setNotice("Keep stickers above the STRIP buttons.")
              }
              onLoadSettled={(loadedSuccessfully) =>
                settleMediaLoad(block.id, loadedSuccessfully)
              }
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
            muted={
              isEditing ||
              block.audioEnabled === false ||
              audibleVideoId !== block.id
            }
            showAudioToggle={
              !isEditing &&
              block.audioEnabled !== false &&
              (videoAudioPresence[block.id] ?? block.hasAudio === true)
            }
            onToggleAudio={() => toggleVideoPlaybackAudio(block.id)}
            onAudioPresence={(hasAudio) =>
              recordVideoAudioPresence(block.id, hasAudio)
            }
            onSelect={() => {
              if (!isEditing || !releaseHeightCropForSelection(block.id)) return;
              if (selectedBlockId !== block.id) triggerSelectionHaptic();
              setSelectedBlockId(block.id);
              setEditingTextBlockId(null);
              setActiveTextTool(null);
            }}
            onFirstFrameColor={(color) => {
              setImageTrayColors((current) =>
                current[block.id] === color
                  ? current
                  : { ...current, [block.id]: color },
              );
            }}
            shouldLoad={shouldLoadMedia(block.id)}
            isLoaded={mediaLoadStatus[block.id] === "loaded"}
            loadSettled={mediaLoadStatus[block.id] !== undefined}
            loadBeforeReveal={!isEditing && view === "published"}
            reservedHeight={block.height}
            cropTop={heightCrop?.top}
            cropSourceHeight={heightCrop?.sourceHeight}
            cropEditing={heightCrop?.isEditing}
            croppedHeight={heightCrop?.height}
            onLoadSettled={(loadedSuccessfully) => {
              settleMediaLoad(block.id, loadedSuccessfully);
              if (
                isEditing &&
                loadedSuccessfully &&
                !suppressSelectedBlockAutoFocusRef.current &&
                selectedBlockId === block.id
              ) {
                window.requestAnimationFrame(() =>
                  focusSelectedBlockWithToolbar(block.id),
                );
              }
            }}
            onHeight={isEditing ? recordBlockHeight : undefined}
            controls={isEditing ? renderBlockControls(block, index) : null}
            heightCropHandles={
              isEditing && heightCrop
                ? renderHeightCropHandles(block, heightCrop)
                : null
            }
          />
        );
        })}
        {showsEndingCard ? (
        <section
          className={`strip-block strip-ending-card strip-end-sheet ${
            isEditing ? "is-editing" : ""
          } ${isEditing && endingIsSelected ? "is-selected" : ""}`}
          data-block-id={STRIP_ENDING_BLOCK_ID}
          role={isEditing && !endingIsSelected ? "button" : undefined}
          tabIndex={isEditing && !endingIsSelected ? 0 : undefined}
          style={
            {
              "--ending-background": sourceEndingStyle.backgroundColor,
              "--ending-foreground": contrastColor(
                sourceEndingStyle.backgroundColor,
              ),
              "--ending-button": sourceEndingStyle.buttonColor,
              "--ending-button-foreground": contrastColor(
                sourceEndingStyle.buttonColor,
              ),
            } as CSSProperties
          }
          onPointerDown={(event) =>
            beginBlockTapGesture(event, STRIP_ENDING_BLOCK_ID)
          }
          onPointerMove={trackBlockTapGesture}
          onPointerCancel={cancelBlockTapGesture}
          onClick={() => {
            if (!isEditing) return;
            if (!completeBlockTapGesture(STRIP_ENDING_BLOCK_ID)) return;
            selectEndingBlock();
          }}
          onKeyDown={(event) => {
            if (
              !isEditing ||
              event.target !== event.currentTarget ||
              (event.key !== "Enter" && event.key !== " ")
            ) {
              return;
            }
            event.preventDefault();
            selectEndingBlock();
          }}
        >
          {isEditing ? renderEndingControls() : null}
          <div className="strip-ending-card-inner">
            <StripEndActions
              primaryAction="edit"
              primaryLabel="Edit this Strip"
              onPrimary={showEndingPreviewActionNotice}
              onShare={showEndingPreviewActionNotice}
            />
          </div>
        </section>
        ) : null}
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
      className={`dock-controls dock-controls-outgoing ${dockTransition.layoutClass} ${
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

  if (authStatus === "signed-in" && authUser && !authUser.username) {
    return (
      <main className="app-shell auth-mode">
        <div
          className="top-safe-area-anchor"
          style={{ backgroundColor: DEFAULT_BACKGROUND }}
          aria-hidden="true"
        />
        <section className="auth-shell" aria-labelledby="username-heading">
          <header className="auth-brand">STRIP</header>
          <div className="auth-card">
            <div className="auth-copy">
              <p>One last thing.</p>
              <h1 id="username-heading">Pick a username</h1>
              <span>Your friends will find your Strips here.</span>
            </div>
            <form className="auth-form" onSubmit={claimUsername}>
              <label htmlFor="auth-username">Username</label>
              <input
                id="auth-username"
                type="text"
                inputMode="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                minLength={3}
                maxLength={24}
                placeholder="yourname"
                value={authUsername}
                onChange={(event) => {
                  setAuthUsername(
                    event.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "")
                      .slice(0, 24),
                  );
                  setAuthUsernameError("");
                }}
                disabled={authPending}
                required
              />
              <p className="auth-username-url">
                {authUsername || "you"}.{PUBLIC_DOMAIN}
              </p>
              <button
                type="submit"
                disabled={authPending || authUsername.length < 3}
              >
                {authPending ? "Saving…" : "Continue"}
              </button>
            </form>
            {authUsernameError ? (
              <p className="auth-error" role="alert">
                {authUsernameError}
              </p>
            ) : null}
          </div>
          <p className="auth-terms">
            Letters, numbers, and hyphens. 3–24 characters.
          </p>
        </section>
      </main>
    );
  }

  if (!initialRouteReady) {
    return <main className="app-shell route-loading-mode" aria-busy="true" />;
  }

  if (authenticationRequired && authStatus !== "signed-in") {
    return (
      <main className="app-shell auth-mode">
        <div
          className="top-safe-area-anchor"
          style={{ backgroundColor: DEFAULT_BACKGROUND }}
          aria-hidden="true"
        />
        <section
          className={`auth-shell auth-step-${authStep} auth-transition-${authTransitionDirection}`}
          aria-labelledby="auth-heading"
        >
          {authStep === "landing" ? (
            <div className="auth-landing">
              <div className="auth-landing-copy">
                <span className="auth-landing-brand">STRIP</span>
                <h1 id="auth-heading">Make something for your friends.</h1>
              </div>
            </div>
          ) : (
            <>
              <header className="auth-flow-header">
                <button
                  className="auth-back-button"
                  type="button"
                  onClick={authStep === "code" ? editSignInPhone : returnToAuthLanding}
                  aria-label={authStep === "code" ? "Change phone number" : "Back"}
                  disabled={authPending}
                >
                  <ArrowLeft aria-hidden="true" strokeWidth={2.8} />
                </button>
                <span className="auth-flow-brand">STRIP</span>
              </header>

              <div className="auth-flow-stage">
                <div className="auth-flow-copy">
                  <h1 id="auth-heading">
                    {authStep === "phone" ? "Phone number" : "Confirmation"}
                  </h1>
                  <p>
                    {authStep === "phone"
                      ? "Enter your phone number"
                      : `Enter the 6-digit code sent to ${authPhone.trim()}.`}
                  </p>
                </div>

                {authStep === "phone" ? (
                  <form
                    id="auth-phone-form"
                    className="auth-form auth-flow-form"
                    onSubmit={requestSignInCode}
                  >
                    <label htmlFor="auth-phone">Phone number</label>
                    <input
                      id="auth-phone"
                      ref={authPhoneInputRef}
                      className="auth-phone-input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="Phone number"
                      value={authPhone}
                      onChange={(event) => {
                        setAuthPhone(event.target.value.slice(0, 24));
                        setAuthError("");
                      }}
                      disabled={authPending}
                    />
                    {authError ? (
                      <p className="auth-error" role="alert">{authError}</p>
                    ) : null}
                  </form>
                ) : (
                  <form
                    id="auth-code-form"
                    className="auth-form auth-flow-form auth-confirmation-form"
                    onSubmit={verifySignInCode}
                  >
                    <label htmlFor="auth-code">Verification code</label>
                    <div className="auth-code-field">
                      <div className="auth-code-cells" aria-hidden="true">
                        {Array.from({ length: AUTH_CODE_LENGTH }, (_, index) => {
                          const value = authCode[index] ?? "";
                          const activeIndex = Math.min(authCode.length, AUTH_CODE_LENGTH - 1);
                          return (
                            <span
                              className={`auth-code-cell ${value ? "has-value" : ""} ${
                                !authPending && index === activeIndex ? "is-active" : ""
                              }`}
                              key={index}
                            >
                              {value}
                            </span>
                          );
                        })}
                      </div>
                      <input
                        id="auth-code"
                        className="auth-code-native"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={authCode}
                        onChange={(event) => {
                          setAuthCode(
                            event.target.value
                              .replace(/\D/g, "")
                              .slice(0, AUTH_CODE_LENGTH),
                          );
                          setAuthError("");
                        }}
                        disabled={authPending}
                      />
                    </div>
                    {authError ? (
                      <p className="auth-error" role="alert">{authError}</p>
                    ) : null}
                    {authDevelopmentCode ? (
                      <p className="auth-dev-note">Local code: {authDevelopmentCode}</p>
                    ) : null}
                    <button
                      className="auth-resend-button"
                      type="button"
                      onClick={() => void requestSignInCode()}
                      disabled={authPending || authResendSeconds > 0}
                    >
                      {authResendSeconds > 0
                        ? `Resend code in 0:${String(authResendSeconds).padStart(2, "0")}`
                        : "Resend code"}
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
          <footer className="composer-dock auth-action-dock">
            <div className="dock-controls dock-controls-current auth-action-controls">
              {authStep === "landing" ? (
                <>
                  <button
                    className="auth-action-button"
                    type="button"
                    onClick={beginSignIn}
                  >
                    Get started
                  </button>
                  <p className="auth-action-terms">
                    By continuing, you agree to our Terms &amp; Privacy Policy.
                  </p>
                </>
              ) : (
                <button
                  className="auth-action-button"
                  type="submit"
                  form={authStep === "phone" ? "auth-phone-form" : "auth-code-form"}
                  disabled={
                    authPending ||
                    (authStep === "phone"
                      ? !authPhone.trim()
                      : authCode.length !== AUTH_CODE_LENGTH)
                  }
                >
                  {authPending
                    ? authStep === "phone"
                      ? "Sending…"
                      : "Checking…"
                    : "Continue"}
                </button>
              )}
            </div>
          </footer>
        </section>
      </main>
    );
  }


  if (
    view === "library" ||
    view === "drafts" ||
    view === "history" ||
    view === "settings"
  ) {
    const isDraftLibrary = view === "drafts";
    const isHistory = view === "history";
    const isSettings = view === "settings";
    const libraryItems = isSettings
      ? []
      : isHistory
        ? viewedStrips
        : isDraftLibrary
          ? draftStrips
          : publishedStrips;
    const libraryColumns = [
      libraryItems.filter((_, index) => index % 2 === 0),
      libraryItems.filter((_, index) => index % 2 === 1),
    ];
    const libraryItemOrder = new Map(
      libraryItems.map((item, index) => [item.id, index]),
    );
    const libraryIsLoading = isDraftLibrary
      ? draftsLoading
      : isHistory
        ? historyLoading
        : libraryLoading;
    const pendingDraftDelete = draftStrips.find(
      (draft) => draft.id === pendingDraftDeleteId,
    );
    const librarySkeletonColumns = [
      [
        { order: 0, titleWidth: "68%" },
        { order: 2, titleWidth: "48%" },
      ],
      [
        { order: 1, titleWidth: "76%" },
        { order: 3, titleWidth: "58%" },
      ],
    ];

    const renderLibraryCard = (
      strip:
        | PublishedStripSummary
        | DraftStripSummary
        | ViewedStripSummary,
    ) => {
      const isDraft = "updatedAt" in strip;
      const itemOrder = libraryItemOrder.get(strip.id) ?? 0;
      const cardTitle =
        strip.title ||
        (isDraft ? draftFallbackTitle(strip.createdAt) : "Untitled");
      const coverStyle: CSSProperties | undefined =
        strip.cover.kind === "color"
          ? { backgroundColor: strip.cover.color }
          : strip.cover.aspectRatio
            ? { aspectRatio: String(strip.cover.aspectRatio) }
            : undefined;
      return (
        <div
          className="library-card is-library-card-entering"
          key={strip.id}
          style={{ "--library-item-order": Math.min(itemOrder, 8) } as CSSProperties}
        >
          <button
            className="library-card-open-button"
            type="button"
            onClick={() =>
              isDraft
                ? void openDraft(strip)
                : openPublishedStrip(strip)
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
              style={coverStyle}
            >
              {strip.cover.kind === "image" ? (
                <img
                  src={strip.cover.src}
                  alt={strip.cover.alt}
                  loading={itemOrder < 6 ? "eager" : "lazy"}
                  decoding="async"
                />
              ) : null}
            </div>
            <h2>{cardTitle}</h2>
          </button>
          {isDraft ? (
            <button
              className="library-card-delete-button"
              type="button"
              onClick={() => setPendingDraftDeleteId(strip.id)}
              disabled={
                deletingDraftId !== null || openingDraftId === strip.id
              }
              aria-label={`Delete ${cardTitle} draft`}
            >
              <Trash2 aria-hidden="true" />
            </button>
          ) : null}
        </div>
      );
    };

    return (
      <>
        {legacyTransitionLayer}
        <main
          className={`app-shell library-mode ${
            isDraftLibrary ? "drafts-library-mode" : ""
          } ${isHistory ? "history-library-mode" : ""} ${
            isSettings ? "settings-mode" : ""
          }`}
        >
          <div
            className={`top-safe-area-anchor ${legacyPageEnterClass}`}
            style={{ backgroundColor: DEFAULT_BACKGROUND }}
            aria-hidden="true"
          />

          <section
            className={`strip-library ${legacyPageEnterClass}`}
            style={
              {
                "--library-tab-scroll-inset": `${libraryScrollInsetRef.current}px`,
              } as CSSProperties
            }
          >
            <header className="library-header">
              <h1>
                {isSettings
                  ? "SETTINGS"
                  : isDraftLibrary
                    ? "DRAFTS"
                    : isHistory
                      ? "HISTORY"
                      : "STRIP"}
              </h1>
            </header>
            {isSettings ? (
              <div className="settings-content">
                <section className="settings-section" aria-labelledby="account-settings-heading">
                  <h2 id="account-settings-heading">Account</h2>
                  <div className="settings-card">
                    <div className="settings-row">
                      <span>Username</span>
                      <strong>
                        {authUser?.username ? `@${authUser.username}` : "Not set"}
                      </strong>
                    </div>
                    <div className="settings-row">
                      <span>Phone</span>
                      <strong>{authUser?.phoneLabel || "Not available"}</strong>
                    </div>
                  </div>
                </section>

                <section className="settings-section" aria-labelledby="library-settings-heading">
                  <h2 id="library-settings-heading">Your library</h2>
                  <div className="settings-card">
                    <div className="settings-row">
                      <span>Published Strips</span>
                      <strong>{publishedStrips.length}</strong>
                    </div>
                    <div className="settings-row">
                      <span>Drafts</span>
                      <strong>{draftStrips.length}</strong>
                    </div>
                    <div className="settings-row">
                      <span>Viewed Strips</span>
                      <strong>{viewedStrips.length}</strong>
                    </div>
                  </div>
                </section>

                <section className="settings-section" aria-labelledby="about-settings-heading">
                  <h2 id="about-settings-heading">About</h2>
                  <div className="settings-card settings-about-card">
                    <strong>STRIP</strong>
                    <p>Make something for your friends.</p>
                  </div>
                </section>

                <button
                  className="settings-sign-out"
                  type="button"
                  onClick={() => void signOut()}
                  disabled={authPending}
                >
                  <LogOut aria-hidden="true" />
                  {authPending ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : libraryIsLoading ? (
              <div
                className="library-grid library-skeleton-grid"
                aria-label={
                  isDraftLibrary
                    ? "Loading your drafts"
                    : isHistory
                      ? "Loading your viewed Strips"
                      : "Loading your Strips"
                }
                aria-busy="true"
                role="status"
              >
                {librarySkeletonColumns.map((column, columnIndex) => (
                  <div
                    className="library-column"
                    key={`${view}-skeleton-column-${columnIndex}`}
                    aria-hidden="true"
                  >
                    {column.map((item, itemIndex) => (
                      <div
                        className="library-card library-card-skeleton"
                        key={`${view}-skeleton-${columnIndex}-${itemIndex}`}
                        style={{
                          "--library-item-order": item.order,
                        } as CSSProperties}
                      >
                        <div
                          className="library-cover library-cover-square library-skeleton-surface"
                        />
                        <div
                          className="library-skeleton-title library-skeleton-surface"
                          style={{ width: item.titleWidth }}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : isHistory && libraryItems.length === 0 ? (
              <div className="library-empty-state">
                <strong>No viewing history yet.</strong>
                <span>Strips you open will appear here.</span>
              </div>
            ) : (
              <div
                className="library-grid"
                aria-label={
                  isDraftLibrary
                    ? "Your drafts"
                    : isHistory
                      ? "Your viewed Strips"
                      : "Your Strips"
                }
                aria-busy="false"
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
            )}
          </section>

          {!isSettings ? (
            <button
              className="library-add-button"
              type="button"
              onClick={beginNewStrip}
              aria-label="Create a new Strip"
            >
              <Plus aria-hidden="true" />
            </button>
          ) : null}

          <footer
            key="persistent-composer-dock"
            className="composer-dock app-navigation-dock"
          >
            {dockTransitionLayer}
            <nav
              className={`${currentDockControlsClass} app-navigation-controls`}
              key={`dock-controls:${view}`}
              aria-label="Main"
            >
              <button
                className={`app-navigation-button ${
                  view === "library" ? "is-active" : ""
                }`}
                type="button"
                onClick={() => void returnToLibrary()}
                aria-label="Home"
                aria-current={view === "library" ? "page" : undefined}
              >
                <House aria-hidden="true" />
                <span className="visually-hidden">Home</span>
              </button>
              <button
                className={`app-navigation-button ${
                  view === "drafts" ? "is-active" : ""
                }`}
                type="button"
                onClick={() => void openDraftLibrary()}
                aria-label="Drafts"
                aria-current={view === "drafts" ? "page" : undefined}
              >
                <Files aria-hidden="true" />
                <span className="visually-hidden">Drafts</span>
              </button>
              <button
                className={`app-navigation-button ${
                  view === "history" ? "is-active" : ""
                }`}
                type="button"
                onClick={() => void openHistory()}
                aria-label="History"
                aria-current={view === "history" ? "page" : undefined}
              >
                <History aria-hidden="true" />
                <span className="visually-hidden">History</span>
              </button>
              <button
                className={`app-navigation-button ${
                  view === "settings" ? "is-active" : ""
                }`}
                type="button"
                onClick={() => void openSettings()}
                aria-label="Settings"
                aria-current={view === "settings" ? "page" : undefined}
              >
                <Settings aria-hidden="true" />
                <span className="visually-hidden">Settings</span>
              </button>
            </nav>
          </footer>
          {pendingDraftDelete ? (
            <DeleteConfirmationModal
              title="Delete this draft?"
              pending={deletingDraftId === pendingDraftDelete.id}
              cancelButtonRef={cancelDeleteButtonRef}
              onCancel={() => setPendingDraftDeleteId(null)}
              onConfirm={() => void deleteDraft(pendingDraftDelete.id)}
            />
          ) : null}
          {notice ? <div className="notice">{notice}</div> : null}
        </main>
      </>
    );
  }

  if (view === "share" && openedPublishedStrip) {
    return (
      <>
        {legacyTransitionLayer}
        <main className="app-shell share-mode">
          <div
            className={`top-safe-area-anchor ${legacyPageEnterClass}`}
            style={{ backgroundColor: DEFAULT_BACKGROUND }}
            aria-hidden="true"
          />
          <section
            className={`share-shell ${legacyPageEnterClass}`}
            aria-labelledby="share-heading"
          >
            <header className="share-heading">
              <span>Published</span>
              <h1 id="share-heading">Ready to share.</h1>
            </header>

            <div className="story-asset-stage" aria-live="polite">
              {storyAssetUrl ? (
                <img
                  className="story-asset-preview"
                  src={storyAssetUrl}
                  alt={`Share artwork for ${
                    openedPublishedStrip.title || "Untitled"
                  }`}
                />
              ) : (
                <div className="story-asset-loading" aria-busy="true">
                  <span />
                  Preparing…
                </div>
              )}
            </div>

            <button
              className="share-link-button"
              type="button"
              onClick={() => void copyPublishedStripLink()}
            >
              <Link2 aria-hidden="true" />
              <span>Copy link</span>
            </button>
          </section>

          <footer className="composer-dock share-dock publish-flow-dock">
            <div className="dock-controls dock-controls-current">
              <button
                className="dock-icon-button publish-flow-button publish-flow-back-button"
                type="button"
                onClick={() => void returnToLibrary()}
              >
                Done
              </button>
              <button
                className="dock-icon-button publish-icon-button publish-flow-button share-story-button"
                type="button"
                onClick={() => void shareStoryToInstagram()}
                disabled={storyAssetLoading || !storyAssetFile}
                aria-label="Share Strip"
              >
                <span>
                  {storyAssetLoading ? "Preparing…" : "Share"}
                </span>
              </button>
            </div>
          </footer>
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
          }}
          onBack={confirmCoverColor}
          backgroundOptions={BACKGROUND_COLORS.filter(
            (option) => !isBlackCoverColor(option.value),
          )}
          startInGradientMode
        />
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
      const trailingPublishedBlock = [...publishedBlocks]
        .reverse()
        .find((block) => block.type !== "sticker");
      const publishedEndsWithMedia =
        trailingPublishedBlock?.type === "image" ||
        trailingPublishedBlock?.type === "video";
      const publishedEndsWithVideo = trailingPublishedBlock?.type === "video";
      const publishedEndsWithText = trailingPublishedBlock?.type === "text";
      const publishedViewerCanEdit =
        authStatus === "signed-in" &&
        openedPublishedStrip?.viewerIsOwner === true;
      const publishedStripStyle = {
        "--ending-background": visibleEndingStyle.backgroundColor,
        "--ending-foreground": contrastColor(
          visibleEndingStyle.backgroundColor,
        ),
        "--ending-button": visibleEndingStyle.buttonColor,
        "--ending-button-foreground": contrastColor(
          visibleEndingStyle.buttonColor,
        ),
        ...(publishedEndsWithText
          ? {
              backgroundColor:
                trailingPublishedBlock.backgroundColor ?? DEFAULT_BACKGROUND,
            }
          : {}),
      } as CSSProperties;
      return (
        <>
          {legacyTransitionLayer}
          <main
            className={`app-shell reader-mode published-mode ${
              hasLeadingImage ? "has-leading-image" : ""
            } ${hasLeadingText ? "has-leading-text" : ""}`}
          >
            <div
              className={`top-safe-area-anchor ${legacyPageEnterClass}`}
              style={{ backgroundColor: topSafeAreaColor }}
              aria-hidden="true"
            />

            <article
              className={`published-strip published-strip-load-gate ${
                publishedContentCanReveal ? "is-ready" : ""
              } ${publishedEndsWithMedia ? "has-trailing-media" : ""} ${
                publishedEndsWithVideo ? "has-trailing-video" : ""
              } ${publishedEndsWithText ? "has-trailing-text" : ""
              } ${legacyPageEnterClass}`}
              style={publishedStripStyle}
              aria-hidden={!publishedContentCanReveal}
            >
              {renderStrip(false, publishedBlocks, visibleEndingStyle)}
              <footer
                className="published-bottom-sheet strip-end-sheet"
                aria-label="Strip actions"
              >
                <StripEndActions
                  primaryAction={publishedViewerCanEdit ? "edit" : "create"}
                  primaryLabel={
                    publishedViewerCanEdit
                      ? "Edit this Strip"
                      : "Make your own Strip"
                  }
                  onPrimary={() => {
                    if (publishedViewerCanEdit) {
                      void editPublishedStripFromReader();
                      return;
                    }
                    makeOwnStripFromReader();
                  }}
                  onShare={() => void sharePublishedStripFromReader()}
                />
              </footer>
            </article>
            {publishedLoaderIsVisible ? (
              <div
                className={`published-strip-loading ${
                  publishedLoaderPhase === "revealing" ? "is-revealing" : ""
                }`}
                role="status"
                aria-label="Loading Strip"
              >
                <div className="published-strip-loading-orb-stage" aria-hidden="true">
                  <div className="published-strip-loading-orb-drift">
                    <div
                      className={`published-strip-loading-orb is-${
                        openedPublishedStrip.cover.kind
                      }`}
                    >
                      {openedPublishedStrip.cover.kind === "image" ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="published-strip-loading-orb-glow"
                            src={openedPublishedStrip.cover.src}
                            alt=""
                            fetchPriority="high"
                            decoding="async"
                            draggable={false}
                            onLoad={(event) => {
                              const image = event.currentTarget;
                              void image
                                .decode()
                                .catch(() => {})
                                .then(() =>
                                  setPublishedCoverSettledKey(
                                    publishedStripLoadKey,
                                  ),
                                );
                            }}
                            onError={() =>
                              setPublishedCoverSettledKey(publishedStripLoadKey)
                            }
                          />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="published-strip-loading-orb-vapor is-far"
                            src={openedPublishedStrip.cover.src}
                            alt=""
                            decoding="async"
                            draggable={false}
                          />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="published-strip-loading-orb-vapor is-near"
                            src={openedPublishedStrip.cover.src}
                            alt=""
                            decoding="async"
                            draggable={false}
                          />
                          <div className="published-strip-loading-orb-surface">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={openedPublishedStrip.cover.src}
                              alt=""
                              fetchPriority="high"
                              decoding="async"
                              draggable={false}
                            />
                            <svg
                              className="published-strip-loading-orb-grain"
                              viewBox="0 0 100 100"
                              preserveAspectRatio="none"
                              focusable="false"
                            >
                              <filter id="published-strip-gas-texture-image">
                                <feTurbulence
                                  type="fractalNoise"
                                  baseFrequency="0.018 0.036"
                                  numOctaves="3"
                                  seed="11"
                                  stitchTiles="stitch"
                                />
                                <feComponentTransfer>
                                  <feFuncA
                                    type="table"
                                    tableValues="0.05 0.62"
                                  />
                                </feComponentTransfer>
                              </filter>
                              <rect
                                width="100"
                                height="100"
                                filter="url(#published-strip-gas-texture-image)"
                              />
                            </svg>
                            <span className="published-strip-loading-orb-sheen" />
                            <span className="published-strip-loading-orb-membrane" />
                          </div>
                          <span className="published-strip-loading-orb-burst-ring" />
                        </>
                      ) : (
                        <>
                          <span
                            className="published-strip-loading-orb-glow"
                            style={{
                              backgroundColor: openedPublishedStrip.cover.color,
                            }}
                          />
                          <span
                            className="published-strip-loading-orb-vapor is-far"
                            style={{
                              backgroundColor: openedPublishedStrip.cover.color,
                            }}
                          />
                          <span
                            className="published-strip-loading-orb-vapor is-near"
                            style={{
                              backgroundColor: openedPublishedStrip.cover.color,
                            }}
                          />
                          <div
                            className="published-strip-loading-orb-surface"
                            style={{
                              backgroundColor: openedPublishedStrip.cover.color,
                            }}
                          >
                            <svg
                              className="published-strip-loading-orb-grain"
                              viewBox="0 0 100 100"
                              preserveAspectRatio="none"
                              focusable="false"
                            >
                              <filter id="published-strip-gas-texture-color">
                                <feTurbulence
                                  type="fractalNoise"
                                  baseFrequency="0.018 0.036"
                                  numOctaves="3"
                                  seed="17"
                                  stitchTiles="stitch"
                                />
                                <feComponentTransfer>
                                  <feFuncA
                                    type="table"
                                    tableValues="0.04 0.56"
                                  />
                                </feComponentTransfer>
                              </filter>
                              <rect
                                width="100"
                                height="100"
                                filter="url(#published-strip-gas-texture-color)"
                              />
                            </svg>
                            <span className="published-strip-loading-orb-sheen" />
                            <span className="published-strip-loading-orb-membrane" />
                          </div>
                          <span className="published-strip-loading-orb-burst-ring" />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
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
                <strong>{openedPublishedStrip?.username ?? "STRIP"}</strong>
                <span>just stripped</span>
              </div>
            </header>
          ) : null}
          {renderStrip(false, publishedBlocks)}
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
        className={`app-shell editor-mode ${inlinePreview ? "is-inline-preview" : ""} ${
          selectedBlockIndex >= 0 || endingIsSelected ? "has-block-toolbar" : ""
        } ${editingTextBlockId ? "is-typing" : ""} ${
          hasLeadingImage ? "has-leading-image" : ""
        } ${heightCropSession ? "is-height-cropping" : ""}`}
      >
      <div
        className={`top-safe-area-anchor ${legacyPageEnterClass}`}
        style={{ backgroundColor: topSafeAreaColor }}
        aria-hidden="true"
      />
      <div
        className={`editor-canvas ${legacyPageEnterClass}`}
        onClickCapture={(event) => {
          if (!inlinePreview || !(event.target instanceof Element)) return;
          const blockElement = event.target.closest<HTMLElement>(
            ".strip-block[data-block-id]",
          );
          const blockId = blockElement?.dataset.blockId;
          if (!blockId || !event.currentTarget.contains(blockElement)) return;
          event.preventDefault();
          event.stopPropagation();
          exitInlinePreviewAndSelect(blockId);
        }}
      >
        {renderStrip(!inlinePreview)}
      </div>

      {!inlinePreview && !heightCropSession && selectedBlock?.type === "text" ? (
        <TextStyleSelector
          block={selectedBlock}
          tool={activeTextTool ?? lastTextTool}
          visible={activeTextTool !== null}
          onChange={(change) => updateTextStyle(selectedBlock.id, change)}
          onBack={() => setActiveTextTool(null)}
        />
      ) : null}

      {!inlinePreview && endingIsSelected ? (
        <TextStyleSelector
          block={{
            id: STRIP_ENDING_BLOCK_ID,
            type: "text",
            content: "Strip ending",
            backgroundColor: endingStyle.backgroundColor,
            textColor: endingStyle.buttonColor,
          }}
          tool={activeEndingTool === "button" ? "color" : "background"}
          visible={activeEndingTool !== null}
          onChange={(change) => {
            setEndingStyle((current) => ({
              backgroundColor:
                change.backgroundColor ?? current.backgroundColor,
              buttonColor: change.textColor ?? current.buttonColor,
            }));
          }}
          onBack={() => setActiveEndingTool(null)}
        />
      ) : null}

      {!inlinePreview ? (
      <footer
        key="persistent-composer-dock"
        className={`composer-dock main-composer-dock ${
          editorDockEntering ? "is-entering-editor" : ""
        } ${activeTextTool || activeEndingTool ? "is-shifted" : ""} ${
          heightCropSession ? "is-height-cropping" : ""
        }`}
      >
        {dockTransitionLayer}
        {heightCropSession ? (
          <div
            className={`${currentDockControlsClass} height-crop-dock-controls`}
            key="height-crop-controls"
          >
            <button
              className="height-crop-action height-crop-cancel"
              type="button"
              onClick={() => finishHeightCrop(false)}
            >
              Cancel
            </button>
            <button
              className="height-crop-action height-crop-confirm"
              type="button"
              onClick={() => finishHeightCrop(true)}
            >
              <Check aria-hidden="true" />
              Crop
            </button>
          </div>
        ) : (
        <div className={currentDockControlsClass} key={`dock-controls:${view}`}>
          <button
            className="dock-icon-button dock-tool-button"
            type="button"
            onClick={addText}
            disabled={inlinePreview}
            aria-label="Add text"
          >
            <Type className="dock-glyph" aria-hidden="true" />
          </button>
          <button
            className="dock-icon-button dock-tool-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={inlinePreview}
            aria-label="Add photo or video"
          >
            <ImagePlus className="dock-glyph" aria-hidden="true" />
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={addMedia}
            aria-label="Choose photos or videos"
          />
          <button
            className="dock-icon-button dock-tool-button"
            type="button"
            onClick={() => {
              if (!hasStickerAnchorBlock) {
                setNotice("Add a text or image block before adding a sticker.");
                return;
              }
              stickerInputRef.current?.click();
            }}
            disabled={inlinePreview}
            aria-label="Add sticker"
          >
            <Sticker className="dock-glyph" aria-hidden="true" />
          </button>
          <input
            ref={stickerInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*,video/*"
            onChange={addSticker}
            aria-label="Choose a sticker image or video"
          />
          <span className="dock-divider" aria-hidden="true" />
          <button
            className="dock-icon-button preview-toggle-button"
            type="button"
            aria-label={inlinePreview ? "Exit preview" : "Preview Strip"}
            aria-pressed={inlinePreview}
            onClick={toggleInlinePreview}
          >
            {inlinePreview ? (
              <EyeOff className="dock-glyph" aria-hidden="true" />
            ) : (
              <Eye className="dock-glyph" aria-hidden="true" />
            )}
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
        )}
      </footer>
      ) : null}
      {inlinePreview ? (
        <div className="published-bottom-pocket-sampler" aria-hidden="true" />
      ) : null}
      {pendingDeleteBlock ? (
        <DeleteConfirmationModal
          title={`Delete this ${
            pendingDeleteBlock.type === "text"
              ? "text"
              : pendingDeleteBlock.type === "image"
                ? "photo"
                : pendingDeleteBlock.type === "video"
                  ? "video"
                  : "sticker"
          } block?`}
          cancelButtonRef={cancelDeleteButtonRef}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => {
            removeBlock(pendingDeleteBlock.id);
            setPendingDeleteId(null);
          }}
        />
      ) : null}
      {notice ? <div className="notice">{notice}</div> : null}
      </main>
    </>
  );
}
