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
  GripHorizontal,
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
import { accountAppOrigin, baseAppOrigin, publishedStripUrl, routeFromLocation, workspaceRedirect } from "@/app/lib/app-routing";
import {
  DEFAULT_STRIP_ENDING_STYLE,
  type StripEndingStyle,
} from "@/app/lib/strip-ending";
import { MediaEdgeExtension } from "@/app/components/MediaEdgeExtension";
import { StripEndingSheet } from "@/app/components/StripEndingSheet";
import { StripEntrance } from "@/app/components/StripEntrance";
import { PreviewDock } from "@/app/components/PreviewDock";
import { StickerPicker } from "@/app/components/StickerPicker";
import { installPageColorDrag, pageColorPickerCenter } from "@/app/lib/page-color-picker";
import { samplePageColorAtPoint as sampleVisiblePageColor } from "@/app/lib/page-color-sampler";
import { initialPackStickerWidth, packStickerForSource, type StickerAsset } from "@/app/lib/sticker-pack";
import { StickerImage } from "@/app/components/StickerImage";
import { normalizeShapeColor, renderShapeSticker, SHAPE_STICKER_DEFAULT_COLOR, type ShapeSticker } from "@/app/lib/shape-stickers";
import { captureStickerPlacement, type StickerPlacement } from "@/app/lib/sticker-placement";
import { prepareStickerUploads } from "@/app/lib/sticker-upload";
import { prepareMediaFiles, mediaImportInsertionIndex, type MediaSize } from "@/app/lib/media-import";
import { createMediaImportFeedback, type MediaImportFeedback } from "@/app/lib/media-import-feedback";
import { revealImportedMedia } from "@/app/lib/media-import-reveal";
import { EditorEntrance } from "@/app/components/EditorEntrance";
import { AnimatedEllipsis } from "@/app/components/AnimatedEllipsis";
import { StackPickerArrows } from "@/app/components/StackPickerArrows";
import { useEditorEntrance } from "@/app/components/useEditorEntrance";
import { getReaderImageProps } from "@/app/lib/reader-image";
import { MediaImportPopup } from "@/app/components/MediaImportPopup";
import { isCoverMedia } from "@/app/lib/cover-media";
import type { StickerOrigin } from "@/app/lib/sticker-origin";
import { resizeStickerWidth, stickerHandleTransform } from "@/app/lib/sticker-sizing";
import { AuthLandingStrip, AUTH_LANDING_COLOR } from "@/app/components/AuthLandingStrip";
import { AuthCodeDelivery } from "@/app/components/AuthCodeDelivery";
import { OnboardingBackground } from "@/app/components/OnboardingBackground";
import { EmptyStripState } from "@/app/components/EmptyStripState";
import { ONBOARDING_BACKGROUND, backgroundOnboardingPending, rememberBackgroundOnboarding, syncOnboardingBackground } from "@/app/lib/onboarding-background";
import { startAuthStickerExit } from "@/app/lib/auth-sticker-exit";
import { HapticStartButton } from "@/app/components/HapticStartButton";
import { HapticActionButton } from "@/app/components/HapticActionButton";
import { ConfirmationDialog } from "@/app/components/ConfirmationDialog";
import AuthKeyboardButton from "@/app/components/AuthKeyboardButton";
import { installAuthFormViewport } from "@/app/lib/auth-form-viewport";
import { installPageZoomLock, shouldLockPageZoom } from "@/app/lib/page-zoom";
import { SharePosterPicker } from "@/app/components/SharePosterPicker";
import { STACK_SWIPE_THRESHOLD, stackSwipeProgress, stackSwipeTarget, stackCardStyle } from "@/app/lib/stack-picker";
import { useStoryPosters } from "@/app/components/useStoryPosters";
import { StoryShareSaveIcon } from "@/app/components/StoryShareSaveIcon";
import { StoryShareBackdrop } from "@/app/components/StoryShareBackdrop";
import { CopyStripLinkButton } from "@/app/components/CopyStripLinkButton";
import { StoryShareControls } from "@/app/components/StoryShareControls";
import { beginStoryShare, getStoryShareConfirmation, type StoryShareConfirmationData } from "@/app/lib/story-share";
import { COVER_MOVE_MS, COVER_DOCK_DROP_MS, captureCoverDock, captureCoverOrigin, type CoverOrigin, type CoverDockOrigin } from "@/app/lib/cover-entrance";
import { preparePreviewLayout, type PreviewLayoutTransition } from "@/app/lib/preview-layout";
import {
  installLeadingMediaTop,
  scrollAfterLeadingInsetChange,
} from "@/app/lib/leading-media-top";
import { installFooterSafeAreaColor } from "@/app/lib/footer-safe-area";
import { installReaderBottomAnchor } from "@/app/lib/reader-bottom-anchor";
import { installKeyboardDockPosition } from "@/app/lib/keyboard-dock";
import { installPublishKeyboardDock } from "@/app/lib/publish-keyboard-dock";
import { keyboardInsetForViewport } from "@/app/lib/keyboard-inset";
import { hasScreenfulOfContent, observeStripContent } from "@/app/lib/strip-minimum-content";
import { ProfileHeader, ProfileTools, profilePageStyle } from "@/app/components/ProfileEditor";
import { GradientColorPicker } from "@/app/components/GradientColorPicker";
import { DEFAULT_PROFILE, PROFILE_FONTS, PROFILE_FONT_CATALOG, profileFontWeight, profileCoverOutline, profileTitle, profileTextColor, type ProfileFont, type StripProfile } from "@/app/lib/profile";
import { normalizedFontSize } from "@/app/lib/font-sizing";
import { useStripProfile } from "@/app/components/useStripProfile";
import { ProfileReload, useProfileReloadLayout, useProfileReloadPresentation } from "@/app/components/ProfileReload";
import { ProfileNavigation, type ProfileView } from "@/app/components/ProfileNavigation";
import { LibraryDeleteButton } from "@/app/components/LibraryDeleteButton";
import { retainProfileBrowserTheme } from "@/app/lib/profile-browser-theme";
import { cachedCoverRatio, clearProfileReload, readProfileReload } from "@/app/lib/profile-reload";

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
  stickerOrigin?: StickerOrigin;
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
type FontStyle = ProfileFont;
type TextTool = "font" | "background" | "color";
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
  profileBackground?: string;
  profileTextColor?: string;
  profileFont?: StripProfile["font"];
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
type AuthUser = { id: string; phoneLabel: string; username: string | null };
type AuthStatus = "loading" | "signed-out" | "signed-in";
type PublicProfileState = {
  username: string;
  profile: StripProfile;
  strips: PublishedStripSummary[];
  status: "loading" | "ready" | "missing" | "error";
};
type AuthStep = "landing" | "phone" | "code" | "username" | "background";
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
const SHAPE_COLOR_STORAGE_KEY = "strip-shape-color-v1";
const DEFAULT_BACKGROUND = "#000000";
const DEFAULT_BLOCK_BACKGROUND = "#3155FF";
const DEFAULT_TEXT = "#FFFFFF";
const DEFAULT_FONT_SIZE = 18;
const MIN_FONT_SIZE = 14;
const MAX_FONT_SIZE = 72;
const FONT_SIZE_STEP = 2;
const PAGE_TRANSITION_DURATION_MS = 380;
const DOCK_TRANSITION_DURATION_MS = 300;
const PUBLISHED_LOADING_MINIMUM_MS = 3000;
const PUBLISHED_MEDIA_LOAD_TIMEOUT_MS = 15000;
const PREVIEW_MODE_NOTICE = "Preview mode, tap any block to edit";
const KEYBOARD_SCROLL_SETTLE_MS = 90;
const KEYBOARD_SCROLL_RELEASE_MS = 420;
const STICKER_MIN_VISIBLE_PX = 44;
const STICKER_ENDING_BUTTON_BUFFER_PX = 18;
const MIN_CROPPED_BLOCK_HEIGHT = 44;
const INLINE_PREVIEW_HISTORY_KEY = "stripInlinePreview";
const AUTH_CODE_LENGTH = 6;

const FONT_OPTIONS = PROFILE_FONTS.map((font) => ({
  label: font.label, value: font.id, family: font.family, weight: profileFontWeight(font.id),
}));

const FONT_STACKS = Object.fromEntries(PROFILE_FONT_CATALOG.map((font) => [font.id, font.family])) as Record<FontStyle, string>;

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
  const ink = contrastColor(normalized);
  const withNeutralInk = (options: { label: string; value: string }[]) => [
    { label: ink === "#000000" ? "Black" : "White", value: ink },
    ...options.filter(({ value }) => value.toUpperCase() !== ink),
  ];
  if (TEXT_COLOR_PALETTES[normalized]) return withNeutralInk(TEXT_COLOR_PALETTES[normalized]);

  const [red, green, blue] = colorChannels(normalized);
  const nearestBackground = BACKGROUND_COLORS.reduce((nearest, option) => {
    const [optionRed, optionGreen, optionBlue] = colorChannels(option.value);
    const distance =
      (red - optionRed) ** 2 +
      (green - optionGreen) ** 2 +
      (blue - optionBlue) ** 2;
    return distance < nearest.distance ? { value: option.value, distance } : nearest;
  }, { value: DEFAULT_BACKGROUND, distance: Number.POSITIVE_INFINITY });

  return withNeutralInk(TEXT_COLOR_PALETTES[nearestBackground.value.toUpperCase()]);
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function publicStripUrl(strip: Pick<PublishedStripSummary, "id" | "username">) {
  return publishedStripUrl(window.location, strip);
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

function samplePageColorAtPoint(clientX: number, clientY: number) {
  return sampleVisiblePageColor(clientX, clientY, pageColorVideoFrames);
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
  onPublish,
  publishNeedsContent = false,
}: {
  primaryAction: "edit" | "create";
  primaryLabel: string;
  onPrimary: () => void;
  publishNeedsContent?: boolean;
} & ({ onShare: () => void; onPublish?: never } | { onPublish: () => void; onShare?: never })) {
  return (
    <div className={`strip-end-sheet-controls${onPublish ? " is-preview" : ""}`}>
      <button
        className="strip-end-sheet-primary"
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onPrimary();
        }}
      >
        {onPublish ? null : (
          <Pencil className={`strip-end-sheet-solid-pencil is-${primaryAction}`} aria-hidden="true" />
        )}
        <span>{primaryLabel}</span>
      </button>
      <HapticActionButton
        className={onPublish ? "strip-end-sheet-primary strip-end-sheet-publish" : "strip-end-sheet-share"}
        feedback={Boolean(onPublish) && publishNeedsContent}
        onClick={() => (onPublish ?? onShare)()}
        label={onPublish ? "Publish" : "Share this Strip"}
      >
        {onPublish ? "Publish" : <>
          {/* Phosphor share-fat-fill, MIT. See /licenses/phosphor-icons.txt. */}
          <svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M237.66,117.66l-80,80A8,8,0,0,1,144,192V152.23c-57.1,3.24-96.25,40.27-107.24,52h0a12,12,0,0,1-20.68-9.58c3.71-32.26,21.38-63.29,49.76-87.37,23.57-20,52.22-32.69,78.16-34.91V32a8,8,0,0,1,13.66-5.66l80,80A8,8,0,0,1,237.66,117.66Z" />
          </svg>
          <span>Share</span>
        </>}
      </HapticActionButton>
    </div>
  );
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
  const preparedItems = items.map(item => item.cover.kind === "image" && !item.cover.aspectRatio
    ? { ...item, cover: { ...item.cover, aspectRatio: cachedCoverRatio(item.id) } } as T : item);
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
    element.matches(".sticker-block, .is-height-cropping") ||
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
  const toolbarGap = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--editor-toolbar-gap"),
  ) || 16;
  const availableBottom = Math.min(
    viewportBottom - 20,
    dockIsVisible && dockBounds ? dockBounds.top - toolbarGap : viewportBottom - 20,
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
  onVideoAudio,
  videoMuted,
  surfaceColor,
  imageSrc,
  stickerRotation,
  showTopEdge = true,
  closing = false,
  mediaHandoff,
}: {
  index: number;
  count: number;
  onMove?: (direction: -1 | 1) => void;
  onRemove?: () => void;
  onTextTool?: (tool: TextTool) => void;
  activeTextTool?: TextTool | null;
  onHeightCrop?: () => void;
  onVideoAudio?: () => void;
  videoMuted?: boolean;
  surfaceColor?: string;
  imageSrc?: string;
  stickerRotation?: number;
  showTopEdge?: boolean;
  closing?: boolean;
  mediaHandoff?: "fade";
}) {
  // Preserve the entrance for this selection's lifetime. Clearing the import
  // flags must not restart the normal toolbar animation after the morph.
  const [mediaHandoffEntrance] = useState(mediaHandoff);
  const trayClass = onTextTool
    ? "is-text-tray"
    : onVideoAudio
      ? "is-video-tray"
      : onMove
        ? "is-media-tray"
        : "is-single-action-tray";
  const edgeRef = useRef<SVGSVGElement>(null);
  const [edgeWidth, setEdgeWidth] = useState(0);
  const trayWidth = onTextTool
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
      {onTextTool ? (
        <span className="block-controls-text-join" style={style} aria-hidden="true" />
      ) : null}
      <div
        className={`block-controls-reveal ${mediaHandoffEntrance ? `is-media-handoff is-media-handoff-${mediaHandoffEntrance}` : ""} ${closing ? "is-closing" : ""}`}
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
    const pausedVideos = Array.from(document.querySelectorAll<HTMLVideoElement>("video")).map(
      (video) => ({ video, wasPlaying: !video.paused }),
    );
    pausedVideos.forEach(({ video }) => {
      cachePageColorVideoFrame(video);
      video.pause();
    });
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
    const stopDragging = installPageColorDrag({
      onSample: sampleAtPoint,
      onDraggingChange: setPageColorDragging,
    });
    return () => {
      stopDragging();
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
    const { x, y } = pageColorPickerCenter(window);
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
          <GradientColorPicker color={activeColor} visible={visible}
            label={tool === "background" ? "Choose any background color" : "Choose any text color"}
            onChange={(color) => onChange(tool === "background" ? { backgroundColor: color } : { textColor: color })} />
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
                  style={{ fontFamily: option.family, fontWeight: option.weight, fontSize: normalizedFontSize(option.value, 16) }}
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
  intrinsicSize,
  entering = false,
  importReady = false,
  onLoadSettled,
  onHeight,
  controls,
  cropTop = 0,
  cropSourceHeight,
  cropEditing = false,
  croppedHeight,
  heightCropHandles,
  extendBottomEdge = false,
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
  intrinsicSize?: MediaSize;
  entering?: boolean;
  importReady?: boolean;
  onLoadSettled: (loaded: boolean) => void;
  onHeight?: (blockId: string, height: number) => void;
  controls?: ReactNode;
  cropTop?: number;
  cropSourceHeight?: number;
  cropEditing?: boolean;
  croppedHeight?: number;
  heightCropHandles?: ReactNode;
  extendBottomEdge?: boolean;
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
      className={`strip-block video-block ${entering ? `is-import-revealing${importReady ? " is-import-ready" : ""}` : ""} ${isEditing ? "is-editing" : ""} ${
        isEditing && isSelected ? "is-selected" : ""
      } ${croppedHeight !== undefined ? "is-height-cropped" : ""} ${
        heightCropHandles ? "is-height-cropping" : ""
      }`}
      data-block-id={block.id}
      aria-busy={!loadSettled}
      style={{
        ...(!loadSettled && reservedHeight && croppedHeight === undefined ? { minHeight: reservedHeight } : {}),
      } as CSSProperties}
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
            width={intrinsicSize?.width}
            height={intrinsicSize?.height}
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
              aspectRatio: intrinsicSize ? `auto ${intrinsicSize.width} / ${intrinsicSize.height}` : undefined,
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
      {extendBottomEdge ? (
        <MediaEdgeExtension
          src={block.src}
          cropTop={cropEditing ? 0 : cropTop}
          cropHeight={cropViewportHeight}
        />
      ) : null}
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
  const packAsset = packStickerForSource(block.src);
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
  const handleTransformRef = useRef<{
    pointerId: number; centerX: number; centerY: number;
    distance: number; angle: number; width: number; rotation: number;
    x: number; y: number; canvasWidth: number; canvasHeight: number;
  } | null>(null);
  const [isTransforming, setIsTransforming] = useState(false);

  useEffect(() => {
    if (
      activePointersRef.current.size === 0 &&
      !handleTransformRef.current &&
      !canvasTouchTransformRef.current &&
      !canvasTouchDragRef.current
    ) {
      liveBlockRef.current = block;
    }
  }, [block]);

  const renderedBlock =
    activePointersRef.current.size > 0 ||
    handleTransformRef.current ||
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
              element.classList.contains("image-block") ||
              element.classList.contains("video-block")),
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

  const finishHandleTransform = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (handleTransformRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    handleTransformRef.current = null;
    if (stickerElementRef.current) delete stickerElementRef.current.dataset.stickerDragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const current = liveBlockRef.current;
    onTransform({ x: current.x, y: current.y, width: current.width, rotation: current.rotation ?? 0 });
    setIsTransforming(false);
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
      if (stickerElementRef.current) delete stickerElementRef.current.dataset.stickerDragging;
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
        const width = resizeStickerWidth(transform.width * (distance / transform.distance));
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
      if (stickerElementRef.current) delete stickerElementRef.current.dataset.stickerDragging;
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
      delete event.currentTarget.dataset.stickerDragging;
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
        event.currentTarget.dataset.stickerDragging = "true";
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
          const width = resizeStickerWidth(transform.width * (distance / transform.distance));
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
      onLostPointerCapture={(event) => {
        if (activePointersRef.current.size === 0) delete event.currentTarget.dataset.stickerDragging;
      }}
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
          <StickerImage
            src={block.src}
            alt={block.alt}
            width={packAsset?.width}
            height={packAsset?.height}
            loading="eager"
            decoding="async"
            draggable={false}
            style={block.src.startsWith("/sticker-pack/") ? { filter: "brightness(1.06)" } : undefined}
            onSettled={(loaded) => {
              if (loaded) settleStickerWithinBounds();
              onLoadSettled?.(loaded);
            }}
          />
        )}
      </span>
      {isEditing && isSelected ? <span className="sticker-transform-orbit">
        <button
          type="button"
          className="sticker-transform-handle"
          aria-label="Resize and rotate sticker"
          title="Drag to resize and rotate. Arrow keys resize; Shift + arrows rotate."
          onClick={event => event.stopPropagation()}
          onPointerDown={event => {
            if (!window.matchMedia("(min-width: 900px)").matches || event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const sticker = stickerElementRef.current;
            const canvas = sticker?.closest<HTMLElement>(".strip-canvas");
            if (!sticker || !canvas) return;
            const bounds = sticker.getBoundingClientRect();
            const centerX = bounds.left + bounds.width / 2;
            const centerY = bounds.top + bounds.height / 2;
            const current = liveBlockRef.current;
            handleTransformRef.current = {
              pointerId: event.pointerId, centerX, centerY,
              distance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
              angle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
              x: current.x, y: current.y, width: current.width, rotation: current.rotation ?? 0,
              canvasWidth: Math.max(1, canvas.getBoundingClientRect().width),
              canvasHeight: Math.max(window.innerHeight, canvas.scrollHeight),
            };
            lowerBoundaryNoticeShownRef.current = false;
            sticker.dataset.stickerDragging = "true";
            event.currentTarget.setPointerCapture(event.pointerId);
            setIsTransforming(true);
          }}
          onPointerMove={event => {
            const origin = handleTransformRef.current;
            if (!origin || origin.pointerId !== event.pointerId) return;
            event.preventDefault();
            event.stopPropagation();
            const { width, rotation } = stickerHandleTransform(origin, event.clientX - origin.centerX, event.clientY - origin.centerY);
            previewTransform({
              x: clampStickerX(origin.x, width, rotation, origin.canvasWidth),
              y: clampStickerY(origin.y, width, rotation, origin.canvasWidth, origin.canvasHeight),
              width, rotation,
            });
          }}
          onPointerUp={finishHandleTransform}
          onPointerCancel={finishHandleTransform}
          onLostPointerCapture={finishHandleTransform}
          onKeyDown={event => {
            if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            const current = liveBlockRef.current;
            const direction = ["ArrowUp", "ArrowRight"].includes(event.key) ? 1 : -1;
            const width = event.shiftKey ? current.width : resizeStickerWidth(current.width + direction * 2);
            const rotation = (current.rotation ?? 0) + (event.shiftKey ? direction * 3 : 0);
            const canvas = stickerElementRef.current?.closest<HTMLElement>(".strip-canvas");
            if (!canvas) return;
            const canvasWidth = Math.max(1, canvas.getBoundingClientRect().width);
            const next = { width, rotation,
              x: clampStickerX(current.x, width, rotation, canvasWidth),
              y: clampStickerY(current.y, width, rotation, canvasWidth, Math.max(window.innerHeight, canvas.scrollHeight)),
            };
            previewTransform(next);
            onTransform(next);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M7 17 17 7M10 7h7v7M14 17H7v-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </span> : null}
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
  return <ConfirmationDialog id="delete-modal" title={title} description="This can't be undone."
    cancelLabel="Cancel" confirmLabel={pending ? "Deleting…" : "Delete"} pending={pending}
    cancelButtonRef={cancelButtonRef} onCancel={onCancel} onConfirm={onConfirm} />;
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
  const [mediaImportProgress, setMediaImportProgress] = useState<(MediaImportFeedback & { afterId: string | null }) | null>(null);
  const [importedMediaSizes, setImportedMediaSizes] = useState<Record<string, MediaSize>>({});
  const [mediaBatchRevealIds, setMediaBatchRevealIds] = useState<string[]>([]);
  const [mediaBatchRevealStarted, setMediaBatchRevealStarted] = useState(false);
  const mediaImportRequestRef = useRef<AbortController | null>(null);
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
  const [profileHostUsername, setProfileHostUsername] = useState<string | null>(null);
  const visitingProfileHost = profileHostUsername !== null && profileHostUsername !== authUser?.username;
  const stripProfile = useStripProfile(visitingProfileHost ? undefined : authUser?.id);
  const [publicProfile, setPublicProfile] = useState<PublicProfileState | null>(null);
  const visibleProfile = publicProfile?.profile ?? stripProfile.profile;
  const [authStep, setAuthStep] = useState<AuthStep>("landing");
  const [authBackground, setAuthBackground] = useState(ONBOARDING_BACKGROUND);
  const [authStickerRevealed, setAuthStickerRevealed] = useState(false);
  const authStickerExitRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { authStickerExitRef.current?.(); }, []);
  const [authTransitionDirection, setAuthTransitionDirection] =
    useState<PageTransitionDirection>("forward");
  const [authPhone, setAuthPhone] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authSendingCode, setAuthSendingCode] = useState(false);
  const [authCodeDeliveryFailed, setAuthCodeDeliveryFailed] = useState(false);
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
  const [openingCover, setOpeningCover] = useState<{
    strip: PublishedStripSummary; origin?: CoverOrigin; dock?: CoverDockOrigin; background: string; ink: string; font: StripProfile["font"];
  } | null>(null);
  const openingCoverRequestRef = useRef<AbortController | null>(null);
  useEffect(() => () => { openingCoverRequestRef.current?.abort(); }, []);
  const [openingDraftId, setOpeningDraftId] = useState<string | null>(null);
  const [openingPublishedEditor, setOpeningPublishedEditor] = useState(false);
  const publishedEditorRequestRef = useRef<AbortController | null>(null);
  useEffect(() => () => { publishedEditorRequestRef.current?.abort(); }, []);
  const [openedPublishedStrip, setOpenedPublishedStrip] =
    useState<PublishedStripDetail | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [currentDraftCreatedAt, setCurrentDraftCreatedAt] = useState(0);
  const [editingPublishedStripId, setEditingPublishedStripId] = useState<
    string | null
  >(null);
  const [publishing, setPublishing] = useState(false);
  const [view, setView] = useState<View>("library");
  const viewingPublicProfile = view === "library" && publicProfile !== null;
  const posters = useStoryPosters(view === "share" ? openedPublishedStrip : null);
  const { file: storyAssetFile, url: storyAssetUrl, loading: storyAssetLoading } = posters;
  const [storyShareSheetOpen, setStoryShareSheetOpen] = useState(false);
  const [storyShareConfirmation, setStoryShareConfirmation] = useState<StoryShareConfirmationData | null>(null);
  const [storyInstagramFile, setStoryInstagramFile] = useState<File | null>(null);
  const storyShareInFlightRef = useRef(false);
  const storyShareAttemptRef = useRef(0);
  const [libraryScrollInset, setLibraryScrollInset] = useState(0);
  const [instantLibraryNavigation, setInstantLibraryNavigation] = useState(false);
  const [initialRouteReady, setInitialRouteReady] = useState(false);
  const [legacyPageTransition, setLegacyPageTransition] =
    useState<LegacyPageTransitionSnapshot | null>(null);
  const [dockTransition, setDockTransition] =
    useState<DockTransitionSnapshot | null>(null);
  const [dockTransitionStarted, setDockTransitionStarted] = useState(false);
  const [editorDockEntering, setEditorDockEntering] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeRevision, setNoticeRevision] = useState(0);
  const [noticeShakeMessage, setNoticeShakeMessage] = useState("");
  const showActionNotice = (message: string) => {
    setNoticeShakeMessage(notice === message ? message : "");
    setNotice(message);
    setNoticeRevision(value => value + 1);
  };
  const [inlinePreview, setInlinePreview] = useState(false);
  useEffect(() => () => { mediaImportRequestRef.current?.abort(); }, [currentDraftId, view, inlinePreview, authStatus]);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [stickerPickerView, setStickerPickerView] = useState<"source" | "pack" | "page-color">("source");
  const [shapeStickerColor, setShapeStickerColor] = useState(() => {
    if (typeof window === "undefined") return SHAPE_STICKER_DEFAULT_COLOR;
    try {
      return normalizeShapeColor(localStorage.getItem(SHAPE_COLOR_STORAGE_KEY) ?? "")
        ?? SHAPE_STICKER_DEFAULT_COLOR;
    } catch { return SHAPE_STICKER_DEFAULT_COLOR; }
  });
  const stickerPlacementRef = useRef<StickerPlacement | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editingTextBlockId, setEditingTextBlockId] = useState<string | null>(null);
  const [activeTextTool, setActiveTextTool] = useState<TextTool | null>(null);
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
  const stripCanvasRef = useRef<HTMLDivElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const authPhoneInputRef = useRef<HTMLInputElement>(null);
  const authCodeInputRef = useRef<HTMLInputElement>(null);
  const coverStageRef = useRef<HTMLDivElement>(null);
  const coverInstructionRef = useRef<HTMLParagraphElement>(null);
  const coverSwipeStartYRef = useRef<number | null>(null);
  const coverDragProgressRef = useRef(0);
  const coverSwipeSuppressClickRef = useRef(false);
  const pageTransitionInFlightRef = useRef(false);
  const libraryScrollInsetRef = useRef(0);
  const leadingImageInsetRef = useRef(0);
  const leadingLayoutRef = useRef<{ view: string; inlinePreview: boolean } | null>(null);
  const skipLeadingImagePlacementOnReorderRef = useRef(false);
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
  const editorBackPathRef = useRef("/");
  const inlinePreviewScrollRef = useRef<number | null>(null);
  const previewLayoutRef = useRef<PreviewLayoutTransition | null>(null);
  const inlinePreviewHistoryEntryRef = useRef(false);
  const inlinePreviewRestorationRef = useRef<"auto" | "manual" | null>(null);
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
  const legacyDraftMigrationRef = useRef<Promise<boolean> | null>(null);
  const legacyOwnerIdRef = useRef("");
  const initialRouteHandledRef = useRef(false);
  const draftSaveTimerRef = useRef<number | null>(null);
  const draftSaveSequenceRef = useRef(0);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement>(null);
  const deletingDraftRef = useRef(false);
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
  const editorEntrance = useEditorEntrance(blocks, mediaLoadStatus, visibleProfile.font, stripProfile.loading);
  const imagesAreLoading = mediaImportProgress !== null || mediaBatchRevealIds.length > 0 || blocks.some(block =>
    (block.type === "image" || block.type === "video") && mediaLoadStatus[block.id] === undefined);
  const showEditorLoadingNotice = (message = "Strip is loading") => {
    try { navigator.vibrate?.(12); } catch { /* Physical feedback is optional. */ }
    showActionNotice(message);
  };
  useEffect(() => {
    if (!editorEntrance.active && notice === "Strip is loading") setNotice("");
    if (!imagesAreLoading && !mediaImportRequestRef.current && notice === "Images loading") setNotice("");
  }, [editorEntrance.active, imagesAreLoading, notice]);

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
  const firstVisibleBlock = view === "published" && openedPublishedStrip
      ? openedPublishedStrip.blocks.find((block) => block.type !== "sticker")
      : blocks.find((block) => block.type !== "sticker" &&
          (mediaBatchRevealStarted || !mediaBatchRevealIds.includes(block.id)));
  const hasStickerAnchorBlock = blocks.some(
    (block) => block.type !== "sticker",
  );
  const needsAuthUsername = !visitingProfileHost && authStatus === "signed-in" && Boolean(authUser && (!authUser.username || authStep === "username"));
  const needsAuthBackground = !visitingProfileHost && authStatus === "signed-in" && Boolean(authUser?.username) && authStep === "background";
  const authFlowStep = needsAuthUsername ? "username" : authStep;
  const authActiveInputRef = authFlowStep === "code" ? authCodeInputRef : authPhoneInputRef;
  useLayoutEffect(() => {
    if (needsAuthUsername && document.activeElement === authCodeInputRef.current) {
      authPhoneInputRef.current?.focus({ preventScroll: true });
    }
  }, [needsAuthUsername]);
  const topSafeAreaColor =
    needsAuthBackground ? authBackground : needsAuthUsername || (authenticationRequired && authStatus !== "signed-in")
      ? AUTH_LANDING_COLOR
      : view === "library" ||
    view === "drafts" ||
    view === "history" ||
    view === "settings"
      ? visibleProfile.background
      : view === "publish-setup" ||
    view === "title-setup" ||
    view === "share"
      ? DEFAULT_BACKGROUND
      : firstVisibleBlock?.type === "text"
      ? (firstVisibleBlock.backgroundColor ?? DEFAULT_BACKGROUND)
      : DEFAULT_BACKGROUND;
  const hasLeadingImage =
    firstVisibleBlock?.type === "image" || firstVisibleBlock?.type === "video";
  const hasLeadingText = firstVisibleBlock?.type === "text";
  const endingSurfaceColor = "#FFFFFF";
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
    view === "preview" || (view === "edit" && inlinePreview)
      ? endingSurfaceColor
      : null;

  const prepareInlinePreviewLayout = () => {
    previewLayoutRef.current = preparePreviewLayout(
      stripCanvasRef.current?.parentElement ?? null,
      previewLayoutRef.current,
      COVER_DOCK_DROP_MS,
    );
  };
  useEffect(() => () => { previewLayoutRef.current?.cancel(); }, []);

  const authFormIsVisible = needsAuthUsername ||
    (authenticationRequired && authStatus !== "signed-in" && authStep !== "landing");
  useLayoutEffect(() => {
    if (!authFormIsVisible) return;
    return installAuthFormViewport();
  }, [authFormIsVisible]);

  const homeIsVisible = initialRouteReady && (authStatus === "signed-in" || viewingPublicProfile) && !needsAuthUsername && !needsAuthBackground &&
    ["library", "drafts", "history", "settings"].includes(view);
  const profilePageIsLoading = homeIsVisible && (viewingPublicProfile
    ? publicProfile.status === "loading"
    : stripProfile.loading || (view === "library" ? libraryLoading : view === "drafts" ? draftsLoading : view === "history" ? historyLoading : false));
  useProfileReloadLayout({ ready: homeIsVisible && !profilePageIsLoading,
    owner: viewingPublicProfile ? `public:${publicProfile.username}` : libraryOwnerId,
    background: visibleProfile.background, view, editing: stripProfile.editing, opening: openingCover !== null });
  useProfileReloadPresentation({ ready: homeIsVisible && (viewingPublicProfile ? publicProfile.status !== "loading" : !stripProfile.loading && !stripProfile.loadFailed),
    owner: viewingPublicProfile ? `public:${publicProfile.username}` : libraryOwnerId,
    username: publicProfile?.username ?? authUser?.username ?? null, profile: visibleProfile, editing: stripProfile.editing });
  useLayoutEffect(() => {
    if (!initialRouteReady || profilePageIsLoading) return;
    const root = document.documentElement;
    const restoringTheme = root.classList.contains("profile-reload-pending");
    root.classList.remove("profile-reload-pending");
    if (restoringTheme) {
      root.style.setProperty("--top-safe-area-color", topSafeAreaColor);
      root.style.backgroundColor = topSafeAreaColor;
      document.getElementById("strip-theme-color")?.setAttribute("content", topSafeAreaColor);
    }
    if (!homeIsVisible) root.style.removeProperty("--profile-reload-background");
  }, [initialRouteReady, homeIsVisible, profilePageIsLoading, topSafeAreaColor]);
  useEffect(() => {
    if (view !== "library") stripProfile.cancel();
  }, [view, stripProfile.cancel]);
  useLayoutEffect(() => {
    if (!homeIsVisible) return;
    return retainProfileBrowserTheme();
  }, [homeIsVisible]);

  useEffect(() => {
    setPublishedMinimumReadyKey(null);
    if (!publishedStripLoadKey) return;

    const timeout = window.setTimeout(() => {
      setPublishedMinimumReadyKey(publishedStripLoadKey);
    }, PUBLISHED_LOADING_MINIMUM_MS);
    return () => window.clearTimeout(timeout);
  }, [publishedStripLoadKey]);

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
    inlinePreviewScrollRef.current = null;
    inlinePreviewHistoryEntryRef.current = false;
    inlinePreviewBasePathRef.current = null;
    if (inlinePreviewRestorationRef.current !== null) {
      history.scrollRestoration = inlinePreviewRestorationRef.current;
      inlinePreviewRestorationRef.current = null;
    }
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
      if (root.classList.contains("page-color-dragging")) return;
      if (window.scrollY < lockedScrollTop) setLockedScrollTop();
    };
    const handleTouchStart = (event: TouchEvent) => {
      lastTouchY = root.classList.contains("page-color-dragging") ? null : event.touches[0]?.clientY ?? null;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (root.classList.contains("page-color-dragging")) return;
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
      if (root.classList.contains("page-color-dragging")) return;
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

  const pageZoomLocked = shouldLockPageZoom({
    view,
    authenticationRequired,
    authStatus,
    needsUsername: needsAuthUsername || needsAuthBackground,
  });
  useLayoutEffect(() => {
    if (!pageZoomLocked) return;
    return installPageZoomLock();
  }, [pageZoomLocked]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const landingIsVisible = authenticationRequired && authStatus !== "signed-in" && authStep === "landing";
    const stripIsVisible =
      landingIsVisible || view === "edit" || view === "preview" || view === "published";

    const calculateLeadingImageOffset = () => {
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

      if (
        !stripIsVisible ||
        !(landingIsVisible || hasLeadingImage || (hasLeadingText &&
          (view === "published" || view === "preview" || (view === "edit" && inlinePreview)))) ||
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
    const previousLayout = leadingLayoutRef.current;
    const switchingInlineReader = view === "edit" && previousLayout?.view === "edit" &&
      previousLayout.inlinePreview !== inlinePreview;
    leadingLayoutRef.current = { view, inlinePreview };
    leadingImageInsetRef.current = offset;
    const ownsReloadScroll =
      initialRouteReady &&
      stripIsVisible &&
      root.dataset.stripReloadScroll === "manual";
    const skipInitialAnchor =
      skipLeadingImagePlacementOnReorderRef.current && !ownsReloadScroll;
    skipLeadingImagePlacementOnReorderRef.current = false;

    const removeLeadingMediaTop = installLeadingMediaTop({
      inset: offset,
      resetScroll: !switchingInlineReader && !skipInitialAnchor && (offset > 0 || ownsReloadScroll),
      ownsReloadScroll,
    });
    // Rebase the existing handoff against the real content origin, after all
    // reader safe-area styles apply. Extend its held scroll range first so a
    // text-first Strip at the bottom cannot clamp before the footer settles.
    const originChange = switchingInlineReader ? previewLayoutRef.current?.rebase() ?? 0 : 0;
    if (originChange !== 0) {
      if (inlinePreviewScrollRef.current !== null) {
        inlinePreviewScrollRef.current = Math.max(0, inlinePreviewScrollRef.current + originChange);
      }
      if (inlinePreviewExitLockRef.current) {
        inlinePreviewExitLockRef.current.scrollTop = Math.max(0, inlinePreviewExitLockRef.current.scrollTop + originChange);
      }
      const target = inlinePreviewScrollRef.current ?? inlinePreviewExitLockRef.current?.scrollTop;
      if (target !== undefined && target !== null) {
        window.scrollTo({ top: target, left: 0, behavior: "auto" });
      }
    }

    return () => {
      removeLeadingMediaTop();
      leadingImageInsetRef.current = 0;
    };
  }, [authenticationRequired, authStatus, authStep, hasLeadingImage, hasLeadingText, initialRouteReady, inlinePreview, view]);

  // Measure after the leading inset is updated, so text-first readers include
  // their final safe-area geometry before the toolbar clearance settles.
  useLayoutEffect(() => {
    if (view === "edit") previewLayoutRef.current?.start(inlinePreview);
    else { previewLayoutRef.current?.cancel(); previewLayoutRef.current = null; }
  }, [inlinePreview, view]);

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
      if (inlinePreviewRestorationRef.current !== null) {
        history.scrollRestoration = inlinePreviewRestorationRef.current;
        inlinePreviewRestorationRef.current = null;
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
    const root = document.documentElement;
    // The footer's layout effect already chose the visible edge. A later
    // passive top-color effect must not overwrite that decision on route load.
    if (root.classList.contains("profile-reload-pending")) return;
    if (!root.matches(".published-bottom-canvas-active, .published-bottom-sheet-canvas-active, .published-bottom-pocket-active, .preview-bottom-canvas-active")) {
      document.querySelector<HTMLMetaElement>("#strip-theme-color")?.setAttribute(
        "content",
        topSafeAreaColor,
      );
    }
    root.style.setProperty("--top-safe-area-color", topSafeAreaColor);
    root.style.backgroundColor = topSafeAreaColor;
  }, [topSafeAreaColor]);

  useLayoutEffect(() => {
    if (!homeIsVisible) return;
    const root = document.documentElement;
    root.style.setProperty("--profile-page-background", visibleProfile.background);
    root.classList.add("profile-page-active");
    return () => {
      root.classList.remove("profile-page-active");
      root.style.removeProperty("--profile-page-background");
    };
  }, [homeIsVisible, view, visibleProfile.background]);

  useEffect(() => {
    if (!viewingPublicProfile || !publicProfile) return;
    const previousTitle = document.title;
    document.title = `${profileTitle(publicProfile.profile, publicProfile.username)} | Strip`;
    return () => { document.title = previousTitle; };
  }, [viewingPublicProfile, publicProfile]);


  useLayoutEffect(() => installFooterSafeAreaColor({
    enabled: (view === "published" && publishedContentCanReveal) || cleanViewBottomSurfaceColor !== null,
    sheet: document.querySelector<HTMLElement>(cleanViewBottomSurfaceColor !== null
      ? ".is-inline-preview .strip-ending-card, .preview-mode .strip-ending-card"
      : ".published-mode .published-bottom-sheet"),
    topColor: topSafeAreaColor,
    bottomColor: endingSurfaceColor,
    defaultColor: DEFAULT_BACKGROUND,
    activeClassName: cleanViewBottomSurfaceColor !== null
      ? "preview-bottom-canvas-active"
      : "published-bottom-sheet-canvas-active",
  }), [cleanViewBottomSurfaceColor, publishedContentCanReveal, topSafeAreaColor, view, endingSurfaceColor]);

  useLayoutEffect(() => installReaderBottomAnchor(
    (view === "published" && publishedContentCanReveal) || cleanViewBottomSurfaceColor !== null,
  ), [view, publishedContentCanReveal, cleanViewBottomSurfaceColor]);

  // The onboarding canvas owns both Safari edges, after inactive footer cleanup.
  // Keep this scoped to signup so published and editor dock behavior is unchanged.
  useLayoutEffect(() => {
    if (needsAuthBackground) syncOnboardingBackground(authBackground);
  }, [needsAuthBackground, authBackground]);

  useLayoutEffect(installKeyboardDockPosition, []);

  useLayoutEffect(() => {
    if (view !== "title-setup") return;
    return installPublishKeyboardDock(
      document.querySelector<HTMLElement>(".title-setup-dock"),
      document.querySelector<HTMLInputElement>(".title-question-field input"),
    );
  }, [view]);

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
      // Fixed forms do not need the editor canvas's delayed scroll restoration.
      // A second scroll during keyboard dismissal can move their covered dock.
      if (activeElement?.closest(".auth-shell, .title-setup-mode")) return false;
      return (
        (activeElement instanceof HTMLElement && activeElement.isContentEditable) ||
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
      const keyboardInset = keyboardInsetForViewport(layoutHeight, viewport.height, textIsFocused);
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
    setProfileHostUsername(usernameFromHostname(window.location.hostname));
    let sessionRequest = 0;
    const refreshSession = () => {
      const requestId = ++sessionRequest;
      void fetch("/api/auth/session", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Session request failed");
          const data = (await response.json()) as { user?: AuthUser | null };
          if (controller.signal.aborted || requestId !== sessionRequest) return;
          const cached = readProfileReload();
          const publicOwner = `public:${usernameFromHostname(window.location.hostname)}`;
          if (cached && cached.owner !== data.user?.id && cached.owner !== publicOwner) clearProfileReload();
          if (data.user) {
            if (backgroundOnboardingPending(data.user.id)) setAuthStep("background");
            setAuthUser(data.user);
            setLibraryOwnerId(data.user.id);
            setAuthStatus("signed-in");
          } else {
            setAuthUser(null);
            setLibraryOwnerId("");
            setPublishedStrips([]);
            setDraftStrips([]);
            setViewedStrips([]);
            setAuthStatus("signed-out");
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || requestId !== sessionRequest) return;
          setAuthUser(null);
          setLibraryOwnerId("");
          setPublishedStrips([]);
          setDraftStrips([]);
          setViewedStrips([]);
          setAuthStatus("signed-out");
          setAuthError("Couldn’t check your sign-in. Try again.");
        })
        .finally(() => {
          if (!controller.signal.aborted && requestId === sessionRequest) setLoaded(true);
        });
    };
    const recheckRestoredSession = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // A different domain may have signed out or switched accounts while
      // Safari kept this page alive in its Back cache. Revalidate before paint.
      flushSync(() => {
        setAuthStatus("loading");
        setInitialRouteReady(false);
      });
      refreshSession();
    };
    refreshSession();
    window.addEventListener("pageshow", recheckRestoredSession);
    return () => {
      controller.abort();
      window.removeEventListener("pageshow", recheckRestoredSession);
    };
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
    if (!libraryOwnerId || visitingProfileHost) return;
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
  }, [libraryOwnerId, visitingProfileHost]);

  useEffect(() => {
    if (!libraryOwnerId || visitingProfileHost) return;
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
  }, [libraryOwnerId, visitingProfileHost]);

  useEffect(() => {
    if (!libraryOwnerId || visitingProfileHost) return;
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
  }, [libraryOwnerId, visitingProfileHost]);

  const migrateLegacyDraft = (): Promise<boolean> => {
    if (legacyDraftMigrationRef.current) return legacyDraftMigrationRef.current;
    if (!libraryOwnerId || visitingProfileHost || !legacyDraftBlocksRef.current) return Promise.resolve(true);
    const legacyBlocks = legacyDraftBlocksRef.current;
    const id = makeId();
    const createdAt = Date.now();
    const migration = prepareStickerUploads(legacyBlocks).then((uploadBlocks) => fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        title: "",
        blocks: uploadBlocks,
        endingStyle: DEFAULT_STRIP_ENDING_STYLE,
        createdAt,
        updatedAt: createdAt,
      }),
    }))
      .then(async (response) => {
        if (!response.ok) throw new Error("Legacy draft migration failed");
        const data = (await response.json()) as { draft: DraftStripSummary };
        setDraftStrips((current) => [
          data.draft,
          ...current.filter((draft) => draft.id !== data.draft.id),
        ]);
        legacyDraftBlocksRef.current = null;
        try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* Already saved on the server. */ }
        return true;
      })
      .catch(() => {
        return false;
      })
      .finally(() => { legacyDraftMigrationRef.current = null; });
    legacyDraftMigrationRef.current = migration;
    return migration;
  };

  useEffect(() => {
    if (!loaded) return;
    void migrateLegacyDraft();
  }, [libraryOwnerId, loaded, visitingProfileHost]);

  useEffect(() => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    if (
      !loaded ||
      editorEntrance.active ||
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
      void prepareStickerUploads(blocks).then((uploadBlocks) => {
        if (sequence !== draftSaveSequenceRef.current) return null;
        return fetch("/api/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: currentDraftId,
            title: stripTitle,
            blocks: uploadBlocks,
            endingStyle,
            createdAt,
            updatedAt,
          }),
        });
      })
        .then(async (response) => {
          if (!response) return;
          if (!response.ok) throw new Error("Draft save failed");
          const data = (await response.json()) as { draft: DraftStripSummary };
          if (sequence !== draftSaveSequenceRef.current) return;
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
    editorEntrance.active,
    stripTitle,
  ]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), notice === PREVIEW_MODE_NOTICE ? 3000 : 2600);
    return () => window.clearTimeout(timeout);
  }, [notice, noticeRevision]);

  useEffect(() => {
    if (view === "share") return;
    storyShareAttemptRef.current++;
    storyShareInFlightRef.current = false;
    setStoryShareSheetOpen(false);
    setStoryShareConfirmation(null);
    setStoryInstagramFile(null);
  }, [view]);

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
      // Keep whichever bottom tools were open. The native keyboard covers
      // their existing position instead of swapping or dismissing the dock.
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
        inheritedStyle?.backgroundColor ?? stripProfile.profile.background;
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
    if (files.length === 0 || mediaImportRequestRef.current || pageTransitionInFlightRef.current) return;
    const controller = new AbortController();
    mediaImportRequestRef.current = controller;
    const insertionAfterId = selectedBlockId;
    const feedback = createMediaImportFeedback({
      signal: controller.signal,
      onProgress: progress => {
        if (!controller.signal.aborted && mediaImportRequestRef.current === controller) setMediaImportProgress({ ...progress, afterId: insertionAfterId });
      },
    });
    setNotice("");
    try {
      const { media, failed } = await prepareMediaFiles(files, {
        signal: controller.signal,
        onProgress: feedback.report,
      });
      await feedback.finish();
      if (controller.signal.aborted || mediaImportRequestRef.current !== controller) return;
      if (media.length === 0) {
        setNotice("Couldn’t add these files. Try different photos or videos.");
        return;
      }
      const canvasWidth = stripCanvasRef.current?.getBoundingClientRect().width ?? window.innerWidth;
      const sizes: Record<string, MediaSize> = {};
      const mediaBlocks: Array<ImageBlock | VideoBlock> = media.map(item => {
        const id = makeId();
        sizes[id] = { width: item.width, height: item.height };
        return { id, type: item.type, src: item.src, alt: item.alt,
          height: Math.max(1, canvasWidth * item.height / item.width),
          ...(item.type === "video" ? { audioEnabled: true } : {}) };
      });
      // Decode the whole mounted batch without changing the visible canvas.
      // The popup fades away as the ready photos fade in together.
      flushSync(() => {
        setImportedMediaSizes(current => ({ ...current, ...sizes }));
        setMediaLoadStatus(current => ({ ...current,
          ...Object.fromEntries(mediaBlocks.filter(block => block.type === "image").map(block => [block.id, "loaded" as const])),
        }));
        setBlocks(current => {
          const next = [...current];
          next.splice(mediaImportInsertionIndex(current, insertionAfterId), 0, ...mediaBlocks);
          return next;
        });
        setMediaBatchRevealIds(mediaBlocks.map(block => block.id));
        setMediaBatchRevealStarted(false);
        setEditingTextBlockId(null);
        setActiveTextTool(null);
      });
      await revealImportedMedia(stripCanvasRef.current, mediaBlocks.map(block => block.id), {
        signal: controller.signal,
        onReveal: () => {
          if (controller.signal.aborted || mediaImportRequestRef.current !== controller) return;
          flushSync(() => {
            setSelectedBlockId(mediaBlocks[0].id);
            setMediaBatchRevealStarted(true);
          });
        },
      });
      if (controller.signal.aborted || mediaImportRequestRef.current !== controller) return;
      // Selection and its attached controls travel with the first photo. Only
      // scroll it into view after the geometry has settled.
      if (!suppressSelectedBlockAutoFocusRef.current) focusSelectedBlockWithToolbar(mediaBlocks[0].id);
      if (failed > 0) setNotice("Some files couldn’t be added. The rest are ready.");
    } catch {
      if (!controller.signal.aborted && mediaImportRequestRef.current === controller) {
        setNotice("Couldn’t add these files. Try again.");
      }
    } finally {
      feedback.dispose();
      if (mediaImportRequestRef.current === controller) {
        mediaImportRequestRef.current = null;
        setMediaImportProgress(null);
        setMediaBatchRevealIds([]);
        setMediaBatchRevealStarted(false);
      }
    }
  };

  const placeSticker = (
    src: string,
    alt: string,
    mediaType: "image" | "video" = "image",
    stickerOrigin: StickerOrigin = "upload",
  ) => {
    if (!hasStickerAnchorBlock) {
      setNotice("Add a text or image block before adding a sticker.");
      return;
    }
    const placement = stickerPlacementRef.current ?? captureStickerPlacement();
    if (!placement) {
      setNotice("Add a text or image block before adding a sticker.");
      return;
    }
    stickerPlacementRef.current = null;
    const id = makeId();
    setBlocks((current) => [
      ...current,
      {
        id,
        type: "sticker",
        src,
        alt,
        mediaType,
        stickerOrigin,
        ...placement,
        // Keep newly added tall pack objects proportional on the canvas, too.
        // Existing user-resized stickers retain their saved dimensions.
        width: initialPackStickerWidth(placement.width, packStickerForSource(src)),
      },
    ]);
    setSelectedBlockId(id);
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

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      placeSticker(
        reader.result,
        file.name.replace(/\.[^/.]+$/, ""),
        mediaType,
      );
      setStickerPickerOpen(false);
    };
    reader.onerror = () => setNotice("Couldn’t add that sticker. Try again.");
    reader.readAsDataURL(file);
  };

  const addStickerFromPack = (sticker: StickerAsset) => {
    placeSticker(sticker.src, sticker.name, "image", "pack");
    setStickerPickerOpen(false);
  };

  const addStickerFromShape = async (shape: ShapeSticker, color: string) => {
    try {
      const source = await renderShapeSticker(shape, color);
      placeSticker(source, `${shape.name} shape`, "image", "shape");
      setStickerPickerOpen(false);
    } catch {
      setNotice("Couldn’t add that shape. Try again.");
      setStickerPickerOpen(false);
    }
  };

  useEffect(() => {
    try { localStorage.setItem(SHAPE_COLOR_STORAGE_KEY, shapeStickerColor); }
    catch { /* The current session still remembers its shape color. */ }
  }, [shapeStickerColor]);

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
    const leadingInsetBeforeReorder = leadingImageInsetRef.current;
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
      const mediaWillLeaveTop =
        (blocks[0]?.type === "image" || blocks[0]?.type === "video") &&
        nextTopBlock?.type !== "image" && nextTopBlock?.type !== "video";
      skipLeadingImagePlacementOnReorderRef.current = mediaWillBecomeTop || mediaWillLeaveTop;
    }

    flushSync(() => {
      setBlocks((current) => {
        const next = [...current];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
    });

    const restoreViewport = () => {
      const top = scrollAfterLeadingInsetChange(
        scrollTop,
        leadingInsetBeforeReorder,
        leadingImageInsetRef.current,
      );
      window.scrollTo({ top, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = top;
      document.body.scrollTop = top;
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
  const [hasRequiredContent, setHasRequiredContent] = useState(false);
  useLayoutEffect(() => {
    if (view !== "edit" && view !== "preview") return;
    return observeStripContent(stripCanvasRef.current, blocks, setHasRequiredContent);
  }, [blocks, view, inlinePreview, loaded, initialRouteReady, authStatus]);
  const selectedBlockIndex = blocks.findIndex((block) => block.id === selectedBlockId);
  const selectedBlock = selectedBlockIndex >= 0 ? blocks[selectedBlockIndex] : undefined;
  const [overlappingStickerIds, setOverlappingStickerIds] = useState<string[]>([]);
  useLayoutEffect(() => {
    if (
      view !== "edit" ||
      inlinePreview ||
      !selectedBlockId ||
      mediaImportRequestRef.current ||
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
    if (
      view !== "edit" ||
      !selected ||
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
        ...(selectedElement && selectedIsText
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
    (block): block is ImageBlock | StickerBlock => isCoverMedia(block),
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
        : currentControls?.classList.contains("dock-action-controls")
          ? "dock-action-controls"
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

  const switchLibraryView = (nextView: ProfileView) => {
    const root = document.documentElement;
    // The four tabs already have their data in memory. Swap in the tap, keep
    // Safari's current scroll canvas, and never queue an entrance animation.
    const preservedScrollTop = Math.max(0, window.scrollY);
    cancelDockTransitionSchedule();
    root.classList.remove("strip-page-transitioning", "strip-standard-page-entering");
    libraryScrollInsetRef.current = preservedScrollTop;
    flushSync(() => {
      setLegacyPageTransition(null);
      setDockTransition(null);
      setDockTransitionStarted(false);
      setInstantLibraryNavigation(true);
      setLibraryScrollInset(preservedScrollTop);
      setView(nextView);
    });
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
    storyShareAttemptRef.current++;
    storyShareInFlightRef.current = false;
    setStoryShareSheetOpen(false);
    // Keep the Copy link button activated when returning from Instagram.
    setStoryShareConfirmation(previous => previous?.copied === null ? null : previous);
    pageTransitionInFlightRef.current = false;
    openingCoverRequestRef.current?.abort();
    openingCoverRequestRef.current = null;
    publishedEditorRequestRef.current?.abort();
    publishedEditorRequestRef.current = null;
    mediaImportRequestRef.current?.abort();
    setOpeningCover(null);
    cancelDockTransitionSchedule();
    setOpeningStripId(null);
    setOpeningDraftId(null);
    setLegacyPageTransition(null);
    setOpeningPublishedEditor(false);
    editorEntrance.cancel();
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
    if (!inlinePreview && !hasScreenfulOfContent(stripCanvasRef.current, blocks)) {
      showActionNotice("Add more content to preview your Strip");
      return;
    }
    if (!inlinePreview) setNotice("");

    inlinePreviewScrollRef.current = window.scrollY;
    const consumesPreviewHistory =
      inlinePreview && inlinePreviewHistoryEntryRef.current;
    if (!inlinePreview) {
      // Mark the EDIT entry manual before pushing preview. Changing only the
      // preview entry on exit is too late: Back can restore the old bottom for
      // a frame before our current-position lock runs.
      inlinePreviewRestorationRef.current ??= history.scrollRestoration;
      history.scrollRestoration = "manual";
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
    prepareInlinePreviewLayout();
    flushSync(() => {
      setActiveTextTool(null);
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

  useEffect(() => {
    if (inlinePreview) showActionNotice(PREVIEW_MODE_NOTICE);
    else setNotice(current => current === PREVIEW_MODE_NOTICE ? "" : current);
  }, [inlinePreview]);

  const restoreInlinePreviewExitScroll = (scrollTop: number) => {
    window.scrollTo({ top: scrollTop, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = scrollTop;
    document.body.scrollTop = scrollTop;
  };

  const releaseInlinePreviewExitLock = () => {
    const lock = inlinePreviewExitLockRef.current;
    if (!lock) return;
    if (inlinePreviewExitFrameRef.current !== null) window.cancelAnimationFrame(inlinePreviewExitFrameRef.current);
    if (inlinePreviewExitSettleFrameRef.current !== null) window.cancelAnimationFrame(inlinePreviewExitSettleFrameRef.current);
    if (inlinePreviewExitTimerRef.current !== null) window.clearTimeout(inlinePreviewExitTimerRef.current);
    inlinePreviewExitFrameRef.current = null;
    inlinePreviewExitSettleFrameRef.current = null;
    restoreInlinePreviewExitScroll(lock.scrollTop);
    history.scrollRestoration = lock.scrollRestoration;
    inlinePreviewRestorationRef.current = null;
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
        scrollRestoration: inlinePreviewRestorationRef.current ?? history.scrollRestoration,
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

    if (inlinePreviewHistoryEntryRef.current) {
      window.history.back();
      return;
    }

    prepareInlinePreviewLayout();
    flushSync(() => {
      setInlinePreview(false);
      setSelectedBlockId(blockId);
      setEditingTextBlockId(null);
      setActiveTextTool(null);
    });
    restoreInlinePreviewExitScroll(inlinePreviewScrollRef.current);
    inlinePreviewSelectionRef.current = null;
    settleInlinePreviewExitLock();
  };

  const continueToPublish = () => {
    if (pageTransitionInFlightRef.current) return;
    if (!hasScreenfulOfContent(stripCanvasRef.current, blocks)) {
      showActionNotice("Add more content to publish your Strip");
      return;
    }
    setNotice("");
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
    // Let desktop action cards receive their normal click. Capturing the
    // pointer on the stage retargets the click away from the photo/color card.
    if (event.pointerType === "mouse" && event.target instanceof Element &&
        event.target.closest(".cover-add-option, .cover-pick-color-option")) return;
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
    const progress = stackSwipeProgress(startY, event.clientY, activeIndex, coverChoices.length);
    coverDragProgressRef.current = progress;
    coverSwipeSuppressClickRef.current = Math.abs(progress) >= STACK_SWIPE_THRESHOLD;
    setCoverDragProgress(progress);
  };

  const finishCoverSwipe = () => {
    const progress = coverDragProgressRef.current;
    coverSwipeStartYRef.current = null;
    const activeIndex = Math.max(0, coverChoices.findIndex(choice => choice.key === activeCoverKey));
    const targetIndex = stackSwipeTarget(activeIndex, progress, coverChoices.length);
    if (targetIndex !== activeIndex) selectCoverAt(targetIndex);
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
    if (authPending || authStickerExitRef.current) return;
    // Focus a dedicated OTP input during the original tap, before sending the
    // SMS. Changing autocomplete on the already-focused phone field can leave
    // Safari's native input session using its old telephone AutoFill traits.
    flushSync(() => {
      setAuthPending(true);
      setAuthSendingCode(true);
      setAuthCodeDeliveryFailed(false);
      setAuthError("");
      setAuthDevelopmentCode("");
      setAuthTransitionDirection("forward");
      setAuthStep("code");
      setAuthCode("");
    });
    authCodeInputRef.current?.focus({ preventScroll: true });
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
      // An SMS can arrive before this response. Never erase an autofilled code.
      setAuthResendSeconds(30);
    } catch (error) {
      setAuthCodeDeliveryFailed(true);
      setAuthError(error instanceof Error ? error.message : "Couldn’t send a code.");
    } finally {
      setAuthSendingCode(false);
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
      setAuthStep(data.user.username && backgroundOnboardingPending(data.user.id) ? "background" : "landing");
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
    // Back from Background reviews the already-reserved address. Do not try
    // claiming it twice, and preserve the color they have just chosen.
    if (authUser?.username) {
      setAuthStep("background");
      authPhoneInputRef.current?.blur();
      return;
    }
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
      // Stay on the base origin until the new profile's color is saved.
      rememberBackgroundOnboarding(claimedUser.id);
      setAuthBackground(ONBOARDING_BACKGROUND);
      setAuthStep("background");
      authPhoneInputRef.current?.blur();
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

  const finishBackgroundOnboarding = async () => {
    if (!await stripProfile.saveBackground(authBackground)) return;
    rememberBackgroundOnboarding(null);
    setAuthStep("landing");
    initialRouteHandledRef.current = false;
    setInitialRouteReady(false);
  };

  const returnBackgroundToUsername = () => {
    if (stripProfile.pending) return;
    setAuthTransitionDirection("backward");
    setAuthUsername(authUser?.username ?? "");
    setAuthUsernameError("");
    setAuthStep("username");
  };

  const editSignInPhone = () => {
    flushSync(() => {
      setAuthStickerRevealed(false);
      setAuthTransitionDirection("backward");
      setAuthStep("phone");
      setAuthCode("");
      setAuthResendSeconds(0);
      setAuthError("");
      setAuthDevelopmentCode("");
    });
    authPhoneInputRef.current?.focus({ preventScroll: true });
  };

  const returnUsernameToPhone = async () => {
    if (authPending) return;
    setAuthPending(true);
    setAuthUsernameError("");
    try {
      // End the verified session before allowing a different phone number.
      // Keep the current number and the fixed form canvas throughout the move.
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) throw new Error("Couldn’t go back. Try again.");
      clearProfileReload();
      flushSync(() => {
        setAuthUser(null);
        setLibraryOwnerId("");
        setPublishedStrips([]);
        setDraftStrips([]);
        setViewedStrips([]);
        setAuthStatus("signed-out");
        setAuthenticationRequired(true);
        setAuthUsername("");
        setAuthStickerRevealed(false);
        setAuthTransitionDirection("backward");
        setAuthStep("phone");
        setAuthCode("");
        setAuthResendSeconds(0);
        setAuthError("");
        setAuthDevelopmentCode("");
        setInitialRouteReady(true);
      });
      authPhoneInputRef.current?.focus({ preventScroll: true });
    } catch (error) {
      setAuthUsernameError(error instanceof Error ? error.message : "Couldn’t go back. Try again.");
    } finally {
      setAuthPending(false);
    }
  };

  const beginSignIn = () => {
    if (authStickerExitRef.current) return;
    authStickerExitRef.current = startAuthStickerExit(() => {
      flushSync(() => {
        setAuthStickerRevealed(true);
        setAuthTransitionDirection("forward");
        setAuthStep("phone");
        setAuthError("");
        setAuthDevelopmentCode("");
      });
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      // Still inside the original tap: iOS can open the keyboard during the fade.
      authPhoneInputRef.current?.focus({ preventScroll: true });
    }, () => {
      authStickerExitRef.current = null;
    });
  };

  const returnToAuthLanding = () => {
    authStickerExitRef.current?.();
    authStickerExitRef.current = null;
    setAuthStickerRevealed(false);
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
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) throw new Error("Couldn’t sign out. Try again.");
      clearProfileReload();
      rememberBackgroundOnboarding(null);
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
      const signedOutOrigin = baseAppOrigin(window.location);
      if (signedOutOrigin !== window.location.origin) {
        setInitialRouteReady(false);
        window.location.replace(`${signedOutOrigin}/`);
        return;
      }
      setBrowserPath("/", true);
      setView("library");
      initialRouteHandledRef.current = false;
      setInitialRouteReady(false);
    } catch {
      setNotice("Couldn’t sign out. Try again.");
    } finally {
      setAuthPending(false);
    }
  };

  const resetEditorEntry = () => {
    // Do not autosave an old canvas under the incoming draft's id.
    draftSaveSequenceRef.current++;
    setCurrentDraftId(null);
    setBlocks([]);
    setMediaLoadStatus({});
    setSelectedBlockId(null);
    setEditingTextBlockId(null);
    setActiveTextTool(null);
    setHeightCropSession(null);
    setStickerPickerOpen(false);
    setInlinePreview(false);
    setOpeningCover(null);
    setNotice("");
    setEditorDockEntering(false);
    setViewInstantly("edit", 0, false);
  };

  const startEditorEntry = () => {
    const request = editorEntrance.start();
    resetEditorEntry();
    return request;
  };

  useLayoutEffect(() => {
    if (routeFromLocation(window.location.pathname, window.location.hostname).kind === "edit") startEditorEntry();
  }, []);

  const beginNewStrip = () => {
    if (authStatus !== "signed-in") {
      setAuthenticationRequired(true);
      return;
    }
    // An empty new Strip has no saved content to fetch or decode.
    editorBackPathRef.current = window.location.pathname;
    editorEntrance.cancel();
    resetEditorEntry();
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
    setOpenedPublishedStrip(null);
    setBrowserPath(`/edit/${encodeURIComponent(draftId)}`);
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
    editorBackPathRef.current = window.location.pathname;
    setOpeningDraftId(draft.id);
    pageTransitionInFlightRef.current = true;
    const request = startEditorEntry();
    try {
      const response = await fetch(
        `/api/drafts/${encodeURIComponent(draft.id)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Draft request failed");
      const data = (await response.json()) as { draft: DraftStripDetail };
      if (!editorEntrance.isCurrent(request)) return;
      setCurrentDraftId(data.draft.id);
      setCurrentDraftCreatedAt(data.draft.createdAt);
      setEditingPublishedStripId(data.draft.publishedStripId ?? null);
      setBlocks(data.draft.blocks);
      setEndingStyle(data.draft.endingStyle ?? DEFAULT_STRIP_ENDING_STYLE);
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
      editorEntrance.resolve(request);
    } catch {
      if (!editorEntrance.isCurrent(request)) return;
      setOpeningDraftId(null);
      pageTransitionInFlightRef.current = false;
      editorEntrance.cancel();
      setViewInstantly("drafts", 0, false);
      setNotice("Couldn’t open this draft. Try again.");
    } finally {
      if (editorEntrance.isCurrent(request)) {
        setOpeningDraftId(null);
        pageTransitionInFlightRef.current = false;
      }
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
    switchLibraryView(nextView);
  };

  const openDraftLibrary = () => openLibrarySection("drafts");
  const openHistory = () => openLibrarySection("history");
  const openSettings = () => openLibrarySection("settings");
  const returnToLibrary = () => openLibrarySection("library");

  const openPublishedStrip = async (strip: PublishedStripSummary, button: HTMLElement) => {
    if ((!libraryOwnerId && !publicProfile) || openingStripId || pageTransitionInFlightRef.current) return;
    pageTransitionInFlightRef.current = true;
    const destination = new URL(publicStripUrl(strip));
    if (destination.origin !== window.location.origin) {
      // History can include other people's Strips. Open on their domain;
      // your own covers stay in this document for the continuous loader.
      window.location.assign(destination.href);
      return;
    }
    const cover = button.querySelector<HTMLElement>(".library-cover");
    const origin = captureCoverOrigin(cover ?? null);
    const controller = new AbortController();
    openingCoverRequestRef.current = controller;
    const dock = captureCoverDock(document.querySelector<HTMLElement>(".library-mode .app-navigation-dock"));
    const publishedPath = destination.pathname;
    // Safari snapshots the outgoing entry here. Save the untouched library,
    // before its cover becomes the loading poster, so Back never replays it.
    setBrowserPath(publishedPath);
    flushSync(() => {
      setOpeningStripId(strip.id);
      setOpeningCover({ strip, origin, dock, background: visibleProfile.background, ink: profileTextColor(visibleProfile), font: visibleProfile.font });
      setOpenedPublishedStrip(null);
      setPublishedCoverSettledKey(null);
      setPublishedLoaderDismissedKey(null);
      setMediaLoadStatus({});
    });
    const timeout = window.setTimeout(() => controller.abort(), PUBLISHED_MEDIA_LOAD_TIMEOUT_MS);
    try {
      // Fetch while the existing home cover moves. Keep the same overlay mounted
      // when the reader appears underneath it, rather than navigating away.
      const [data] = await Promise.all([
        fetch(`/api/strips/${encodeURIComponent(strip.id)}`, { cache: "no-store", signal: controller.signal })
          .then(async response => {
            if (!response.ok) throw new Error("Published Strip request failed");
            return await response.json() as { strip: PublishedStripDetail };
          }),
        new Promise<void>(resolve => window.setTimeout(resolve, COVER_MOVE_MS + 40)),
      ]);
      if (controller.signal.aborted || openingCoverRequestRef.current !== controller) return;
      setViewedStrips(current => [{ ...strip, viewedAt: Date.now() }, ...current.filter(item => item.id !== strip.id)]);
      flushSync(() => {
        setOpenedPublishedStrip(data.strip);
        setView("published");
      });
    } catch {
      if (openingCoverRequestRef.current !== controller) return;
      setOpeningCover(null);
      setOpeningStripId(null);
      setNotice("Couldn’t open this Strip. Try again.");
      if (window.location.pathname === publishedPath) {
        // Consume the entry reserved for this request. Keep the click gate
        // closed until popstate, so a retry cannot race this pending Back.
        window.history.back();
      } else {
        pageTransitionInFlightRef.current = false;
      }
    } finally {
      window.clearTimeout(timeout);
      if (openingCoverRequestRef.current === controller) openingCoverRequestRef.current = null;
    }
  };

  const returnToLibraryFromPublished = async () => {
    if (pageTransitionInFlightRef.current) return;
    pageTransitionInFlightRef.current = true;
    try {
      setBrowserPath("/");
      // Use the same route resolver as browser Back, including direct-link
      // visits where the public profile has not been fetched yet.
      window.dispatchEvent(new PopStateEvent("popstate"));
    } finally {
      pageTransitionInFlightRef.current = false;
    }
  };

  useEffect(() => {
    // Username is still part of the focused sign-in flow. Applying the route
    // here resets scroll under the keyboard before onboarding is complete.
    if (needsAuthBackground) return;
    if (authStatus === "loading" || needsAuthUsername || initialRouteHandledRef.current) return;
    initialRouteHandledRef.current = true;
    let cancelled = false;
    let routeRequestId = 0;

    const applyRoute = async (): Promise<void> => {
      const requestId = ++routeRequestId;
      const routeIsCurrent = () => !cancelled && requestId === routeRequestId;
      let leavingForCanonicalRoute = false;
      try {
        const route = routeFromLocation(
          window.location.pathname,
          window.location.hostname,
        );
        const workspaceUrl = workspaceRedirect(window.location, authStatus === "signed-in" ? authUser?.username : null);
        if (workspaceUrl) {
          // Browser storage is origin-scoped. Preserve any pre-account local
          // draft on the server before leaving the old main-site origin.
          if (!await migrateLegacyDraft()) {
            setNotice("Couldn’t save your existing draft. Refresh to try again.");
            return;
          }
          if (!routeIsCurrent()) return;
          leavingForCanonicalRoute = true;
          setInitialRouteReady(false);
          window.location.replace(workspaceUrl);
          return;
        }
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
            if (!routeIsCurrent()) return;
            const destination = new URL(publicStripUrl(data.strip));
            if (destination.origin !== window.location.origin) {
              leavingForCanonicalRoute = true;
              setInitialRouteReady(false);
              window.location.replace(`${destination.href}${window.location.search}${window.location.hash}`);
              return;
            }
            if (destination.pathname !== window.location.pathname) {
              window.history.replaceState({}, "", `${destination.pathname}${window.location.search}${window.location.hash}`);
            }
            setPublishedCoverSettledKey(null);
            setPublishedLoaderDismissedKey(null);
            setOpenedPublishedStrip(data.strip);
            setView("published");
            window.scrollTo({ top: 0, behavior: "auto" });
          } catch {
            if (!routeIsCurrent()) return;
            setBrowserPath("/", true);
            setNotice("Couldn’t open this Strip.");
            await applyRoute();
          }
          return;
        }

        if (route.kind === "profile") {
          // The same public URL becomes the full workspace only for its
          // verified owner. Other visitors never fetch private profile data.
          if (authStatus === "signed-in" && authUser?.username === route.username) {
            setPublicProfile(null);
            setAuthenticationRequired(false);
            setView("library");
            setOpenedPublishedStrip(null);
            window.scrollTo({ top: 0, behavior: "auto" });
            return;
          }
          setAuthenticationRequired(false);
          setView("library");
          setOpenedPublishedStrip(null);
          window.scrollTo({ top: 0, behavior: "auto" });
          const placeholder: PublicProfileState = {
            username: route.username, profile: DEFAULT_PROFILE, strips: [], status: "loading",
          };
          setPublicProfile((current) => current?.username === route.username && current.status === "ready" ? current : placeholder);
          try {
            const response = await fetch(`/api/profiles/${encodeURIComponent(route.username)}`, { cache: "no-store" });
            if (!routeIsCurrent()) return;
            if (response.status === 404) {
              setPublicProfile({ ...placeholder, status: "missing" });
              return;
            }
            if (!response.ok) throw new Error("Public profile request failed");
            const data = await response.json() as Omit<PublicProfileState, "status">;
            const strips = await prepareLibrarySummaries(data.strips);
            if (!routeIsCurrent()) return;
            setPublicProfile({ ...data, strips, status: "ready" });
          } catch {
            if (routeIsCurrent()) setPublicProfile({ ...placeholder, status: "error" });
          }
          return;
        }

        setPublicProfile(null);

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
          const editorRequest = startEditorEntry();
          try {
            const response = await fetch(
              `/api/drafts/${encodeURIComponent(route.id)}`,
              { cache: "no-store" },
            );
            if (!routeIsCurrent()) return;
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
              if (!routeIsCurrent()) return;
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
            setOpenedPublishedStrip(null);
            editorEntrance.resolve(editorRequest);
            window.scrollTo({ top: 0, behavior: "auto" });
          } catch {
            if (routeIsCurrent()) {
              editorEntrance.cancel();
              setBrowserPath("/drafts", true);
              setView("drafts");
              setNotice("Couldn’t open this draft. Try again.");
            }
          }
          return;
        }

        try {
          const response = await fetch(`/api/strips/${encodeURIComponent(route.id)}`, {
            cache: "no-store",
          });
          if (!response.ok) throw new Error("Published route request failed");
          const data = (await response.json()) as { strip: PublishedStripDetail };
          if (!routeIsCurrent()) return;
          setOpenedPublishedStrip(data.strip);
          setView("share");
          window.scrollTo({ top: 0, behavior: "auto" });
        } catch {
          if (!routeIsCurrent()) return;
          setBrowserPath("/", true);
          setNotice("Couldn’t open this Strip.");
          await applyRoute();
        }
      } finally {
        if (routeIsCurrent() && !leavingForCanonicalRoute) setInitialRouteReady(true);
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
        prepareInlinePreviewLayout();
        flushSync(() => {
          setInlinePreview(false);
          if (selectedPreviewBlockId) {
            setSelectedBlockId(selectedPreviewBlockId);
          }
          setEditingTextBlockId(null);
          setActiveTextTool(null);
        });
        restoreInlinePreviewExitScroll(inlinePreviewExitLockRef.current?.scrollTop ?? scrollTop);
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
        if (inlinePreviewExitLockRef.current) releaseInlinePreviewExitLock();
        inlinePreviewRestorationRef.current ??= history.scrollRestoration;
        history.scrollRestoration = "manual";
        inlinePreviewHistoryEntryRef.current = true;
        inlinePreviewBasePathRef.current = window.location.pathname;
        inlinePreviewScrollRef.current = window.scrollY;
        prepareInlinePreviewLayout();
        flushSync(() => {
          setActiveTextTool(null);
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
      initialRouteHandledRef.current = false;
      window.removeEventListener("popstate", handlePopState);
    };
  }, [authStatus, libraryOwnerId, needsAuthUsername, needsAuthBackground, authUser?.username]);

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
      const uploadBlocks = await prepareStickerUploads(blocks);
      const response = await fetch("/api/strips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: stripId,
          draftId: currentDraftId,
          title: stripTitle.trim(),
          publishedAt,
          cover: publishedCover,
          blocks: uploadBlocks,
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
    storyShareAttemptRef.current++;
    setStoryShareConfirmation(null);
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
    const attempt = ++storyShareAttemptRef.current;
    setStoryShareConfirmation({ image: null, copied: null });
    const stripUrl = publicStripUrl(openedPublishedStrip);
    try {
      await navigator.clipboard.writeText(stripUrl);
      if (storyShareAttemptRef.current !== attempt) return;
      setStoryShareConfirmation({ image: null, copied: true });
      if (view !== "share") setNotice("Strip link copied.");
    } catch {
      if (storyShareAttemptRef.current !== attempt) return;
      setStoryShareConfirmation({ image: null, copied: false });
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
      `${accountAppOrigin(window.location, authUser?.username)}/edit/${encodeURIComponent(makeId())}`,
    );
  };

  const editPublishedStripFromReader = async () => {
    if (
      authStatus !== "signed-in" ||
      !openedPublishedStrip?.viewerIsOwner ||
      pageTransitionInFlightRef.current
    ) {
      return;
    }
    pageTransitionInFlightRef.current = true;
    const strip = openedPublishedStrip;
    editorBackPathRef.current = window.location.pathname;
    const controller = new AbortController();
    publishedEditorRequestRef.current = controller;
    setOpeningPublishedEditor(true);
    const editorRequest = startEditorEntry();
    try {
      const response = await fetch(
        `/api/strips/${encodeURIComponent(strip.id)}/draft`,
        { method: "POST", signal: controller.signal },
      );
      if (!response.ok) throw new Error("Published draft request failed");
      const data = (await response.json()) as { draft: { id: string } };
      if (controller.signal.aborted || publishedEditorRequestRef.current !== controller) return;
      const draftResponse = await fetch(`/api/drafts/${encodeURIComponent(data.draft.id)}`, {
        cache: "no-store", signal: controller.signal,
      });
      if (!draftResponse.ok) throw new Error("Draft request failed");
      const { draft } = (await draftResponse.json()) as { draft: DraftStripDetail };
      if (controller.signal.aborted || publishedEditorRequestRef.current !== controller) return;
      const workspaceOrigin = accountAppOrigin(window.location, authUser?.username);
      const editorPath = `/edit/${encodeURIComponent(draft.id)}`;
      if (workspaceOrigin !== window.location.origin) {
        window.location.assign(`${workspaceOrigin}${editorPath}`);
        return;
      }
      // Mount only the real draft. Its actual images, videos, stickers and
      // fonts settle behind the entrance before the canvas can be revealed.
      setBrowserPath(editorPath);
      flushSync(() => {
        setCurrentDraftId(draft.id);
        setCurrentDraftCreatedAt(draft.createdAt);
        setEditingPublishedStripId(draft.publishedStripId ?? strip.id);
        setBlocks(draft.blocks);
        setEndingStyle(draft.endingStyle ?? DEFAULT_STRIP_ENDING_STYLE);
        setStripTitle(draft.title);
        setSelectedBlockId(null);
        setEditingTextBlockId(null);
        setActiveTextTool(null);
        setHeightCropSession(null);
        setStickerPickerOpen(false);
        setSelectedCover("");
        setActiveCoverKey("");
        setCustomCoverSrc(null);
        setCustomCoverColors([]);
        setCoverColorShape("square");
        setOpenedPublishedStrip(null);
        setOpeningPublishedEditor(false);
      });
      editorEntrance.resolve(editorRequest);
    } catch {
      if (controller.signal.aborted || publishedEditorRequestRef.current !== controller) return;
      setOpeningPublishedEditor(false);
      editorEntrance.cancel();
      setOpenedPublishedStrip(strip);
      setViewInstantly("published", 0, false);
      setNotice("Couldn’t open this Strip for editing. Try again.");
    } finally {
      if (publishedEditorRequestRef.current === controller) {
        publishedEditorRequestRef.current = null;
        pageTransitionInFlightRef.current = false;
      }
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
  };

  const shareStoryToInstagram = async () => {
    if (storyShareInFlightRef.current || !openedPublishedStrip) return;
    if (!storyAssetFile) {
      setNotice(storyAssetLoading ? "Finishing your share image…" : "Try again.");
      return;
    }
    const shareData: ShareData = { files: [storyAssetFile] };
    const desktopShare = window.matchMedia("(min-width: 900px)").matches;
    const attempt = ++storyShareAttemptRef.current;
    storyShareInFlightRef.current = true;
    setStoryShareConfirmation(null);
    setStoryInstagramFile(null);
    setNotice("");
    try {
      const { copied, finished } = beginStoryShare(shareData, publicStripUrl(openedPublishedStrip), {
        open: () => flushSync(() => {
          setNotice("");
          setStoryShareSheetOpen(true);
        }),
        close: () => {
          if (storyShareAttemptRef.current === attempt) setStoryShareSheetOpen(false);
        },
        download: () => {
          if (storyShareAttemptRef.current === attempt) downloadStoryAsset();
        },
      }, desktopShare ? { clipboard: navigator.clipboard } : navigator);
      const result = await finished;
      if (result !== "cancelled") posters.remember(storyAssetFile);
      if (storyShareAttemptRef.current === attempt) {
        if (result !== "cancelled" && !desktopShare) setStoryInstagramFile(storyAssetFile);
        setStoryShareConfirmation(getStoryShareConfirmation(result, null));
      }
      // A slow clipboard permission response must not leave the backdrop stuck.
      void copied.then(success => {
        if (storyShareAttemptRef.current !== attempt) return;
        setStoryShareConfirmation(getStoryShareConfirmation(result, success));
      });
    } catch {
      if (storyShareAttemptRef.current === attempt) setNotice("Couldn’t share this poster. Try again.");
    } finally {
      if (storyShareAttemptRef.current === attempt) {
        storyShareInFlightRef.current = false;
        setStoryShareSheetOpen(false);
      }
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
        mediaHandoff={mediaBatchRevealStarted && mediaBatchRevealIds[0] === block.id ? "fade" : undefined}
      />
    );
  };

  const handlePreviewEndingEdit = () => {
    if (view === "edit" && inlinePreview) {
      // Consume the preview history entry exactly as Back does, only once.
      if (inlinePreviewExitLockRef.current) return;
      setNotice("");
      toggleInlinePreview();
    } else if (view === "preview") {
      setNotice("");
      changeViewWithDockTransition("edit");
    }
  };

  const handlePreviewEndingPublish = () => {
    if (view === "preview" || (view === "edit" && inlinePreview)) {
      continueToPublish();
    }
  };

  const renderStrip = (
    isEditing: boolean,
    sourceBlocks: StripBlock[] = blocks,
  ) => {
    const mediaBlockIds = sourceBlocks.flatMap((block) =>
      block.type === "image" || block.type === "video" ? [block.id] : [],
    );
    const shouldLoadMedia = (blockId: string) => {
      if (importedMediaSizes[blockId]) return true;
      const mediaIndex = mediaBlockIds.indexOf(blockId);
      if (!isEditing) return mediaIndex >= 0;
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
    const showsEndingCard = !isEditing && view !== "published";
    const trailingFlowBlock = [...sourceBlocks]
      .reverse()
      .find((block) => block.type !== "sticker");
    const endingFollowsMedia =
      showsEndingCard &&
      (trailingFlowBlock?.type === "image" || trailingFlowBlock?.type === "video");
    const endingFollowsText = showsEndingCard && trailingFlowBlock?.type === "text";
    const canvasMinHeight = !isEditing && stickerFloor > 0 ? `${stickerFloor}px` : undefined;

    return (
      <>
      <div
        ref={stripCanvasRef}
        className={`strip-canvas ${isEditing && mediaBatchRevealIds.length ? "is-media-handoff" : ""} ${showsEndingCard ? "has-ending-card" : ""} ${
          endingFollowsMedia ? "has-trailing-media" : ""
        } ${endingFollowsText ? "has-trailing-text" : ""}`}
        style={canvasMinHeight ? { minHeight: canvasMinHeight } : undefined}
      >
        {(sourceBlocks.length === 0 || (!mediaBatchRevealStarted && mediaBatchRevealIds.length > 0 && sourceBlocks.every(block => mediaBatchRevealIds.includes(block.id)))) && isEditing ? (
          <div className="empty-strip">
            <EmptyStripState kind="editor" />
          </div>
        ) : null}

        {sourceBlocks.map((block, index) => {
        const heightCrop =
          block.type === "image" || block.type === "video"
            ? resolveBlockHeightCrop(block, isEditing ? heightCropSession : null)
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
                setSelectedBlockId(block.id);
                setActiveTextTool(null);
              }}
              style={{
                backgroundColor,
                color: textColor,
                fontFamily: FONT_STACKS[block.fontStyle ?? "sans"],
                "--text-font-weight": block.fontStyle ? profileFontWeight(block.fontStyle) : undefined,
                "--text-base-size": `${block.fontSize ?? DEFAULT_FONT_SIZE}px`,
              } as CSSProperties}
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
                      style={{ fontSize: normalizedFontSize(block.fontStyle ?? "sans", block.fontSize ?? DEFAULT_FONT_SIZE) }}
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
                      style={{ fontSize: normalizedFontSize(block.fontStyle ?? "sans", block.fontSize ?? DEFAULT_FONT_SIZE) }}
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
              className={`strip-block image-block ${isEditing && mediaBatchRevealIds.includes(block.id) ? `is-import-revealing${mediaBatchRevealStarted ? " is-import-ready" : ""}` : ""} ${isEditing ? "is-editing" : ""} ${
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
              style={{
                ...(mediaLoadStatus[block.id] === undefined && block.height && heightCrop?.height === undefined ? { minHeight: block.height } : {}),
              } as CSSProperties}
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
                    width={importedMediaSizes[block.id]?.width}
                    height={importedMediaSizes[block.id]?.height}
                    {...(shouldLoadMedia(block.id)
                      ? isEditing ? { src: block.src } : getReaderImageProps(block.src)
                      : {})}
                    alt={block.alt}
                    draggable={isEditing ? false : undefined}
                    onDragStart={event => { if (isEditing) event.preventDefault(); }}
                    loading="eager"
                    decoding="async"
                    style={
                      mediaLoadStatus[block.id] === "error"
                        ? { display: "none" }
                        : !isEditing
                          ? undefined
                          : {
                              aspectRatio: importedMediaSizes[block.id]
                                ? `auto ${importedMediaSizes[block.id].width} / ${importedMediaSizes[block.id].height}`
                                : undefined,
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
                            !importedMediaSizes[block.id] &&
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
              {!isEditing && trailingFlowBlock?.id === block.id ? (
                <MediaEdgeExtension
                  src={block.src}
                  cropTop={heightCrop?.isEditing ? 0 : heightCrop?.top}
                  cropHeight={cropViewportHeight}
                />
              ) : null}
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
                setNotice("Keep stickers inside your Strip.")
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
            extendBottomEdge={!isEditing && trailingFlowBlock?.id === block.id}
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
            loadBeforeReveal={!isEditing || editorEntrance.active}
            reservedHeight={block.height}
            intrinsicSize={importedMediaSizes[block.id]}
            entering={isEditing && mediaBatchRevealIds.includes(block.id)}
            importReady={mediaBatchRevealStarted}
            cropTop={heightCrop?.top}
            cropSourceHeight={heightCrop?.sourceHeight}
            cropEditing={heightCrop?.isEditing}
            croppedHeight={heightCrop?.height}
            onLoadSettled={(loadedSuccessfully) => {
              settleMediaLoad(block.id, loadedSuccessfully);
              if (
                isEditing &&
                loadedSuccessfully &&
                !importedMediaSizes[block.id] &&
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
      </div>
        {showsEndingCard ? (
          <StripEndingSheet
            preview
            username={authUser?.username}
            cornerColor={endingFollowsText ? trailingFlowBlock.backgroundColor ?? DEFAULT_BACKGROUND : undefined}
          >
            <StripEndActions
              primaryAction="edit"
              primaryLabel="Edit Strip"
              onPrimary={handlePreviewEndingEdit}
              onPublish={handlePreviewEndingPublish}
              publishNeedsContent={!hasRequiredContent}
            />
          </StripEndingSheet>
        ) : null}
      </>
    );
  };

  const desktopBackLabel = view === "title-setup" ? "Back to cover"
    : view === "publish-setup" ? "Back to editor"
    : view === "preview" || (view === "edit" && inlinePreview) ? "Back to editor"
    : view === "edit" ? "Back"
    : view === "share" ? "Back to Strip"
    : ["published", "drafts", "history", "settings"].includes(view) ? "Back to profile"
    : null;
  const handleDesktopBack = () => {
    if (publishing || storyShareSheetOpen) return;
    if (view === "title-setup") return returnToCoverSetup();
    if (view === "publish-setup") return returnFromPublishSetup();
    if (view === "preview" || (view === "edit" && inlinePreview)) return handlePreviewEndingEdit();
    if (view === "edit") {
      // Keep imports and the existing autosave intact. An entrance fetch can
      // be cancelled safely, but selected media must finish being added.
      if (mediaImportRequestRef.current || mediaImportProgress || mediaBatchRevealIds.length) {
        showEditorLoadingNotice("Images loading");
        return;
      }
      if (pageTransitionInFlightRef.current && !editorEntrance.active) return;
      resetTransientNavigationState();
      setEditingTextBlockId(null);
      setActiveTextTool(null);
      setStickerPickerOpen(false);
      setHeightCropSession(null);
      setBrowserPath(editorBackPathRef.current);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    if (view === "share" && openedPublishedStrip) {
      if (pageTransitionInFlightRef.current) return;
      const destination = new URL(publicStripUrl(openedPublishedStrip));
      if (destination.origin !== window.location.origin) {
        window.location.assign(destination.href);
        return;
      }
      setBrowserPath(destination.pathname);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    if (view === "published") {
      void returnToLibraryFromPublished();
      return;
    }
    returnToLibrary();
  };
  const desktopBackControl = desktopBackLabel && typeof document !== "undefined" ? createPortal(
    <button className="desktop-back-button" type="button" onClick={handleDesktopBack}
      aria-label={desktopBackLabel} title={desktopBackLabel} disabled={publishing || storyShareSheetOpen}>
      <ArrowLeft aria-hidden="true" strokeWidth={2.3} />
    </button>, document.body, "desktop-back-control",
  ) : null;

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


  const entranceStrip = openingCover?.strip ?? openedPublishedStrip;
  const coverEntranceLayer = entranceStrip && (openingCover || publishedLoaderIsVisible) && typeof document !== "undefined"
    ? createPortal(
      <StripEntrance key={entranceStrip.id}
        cover={entranceStrip.cover}
        title={entranceStrip.title}
        origin={openingCover?.origin}
        dock={openingCover?.dock}
        backgroundColor={openingCover?.background ?? openedPublishedStrip?.profileBackground}
        inkColor={openingCover?.ink ?? openedPublishedStrip?.profileTextColor}
        profileFont={openingCover?.font ?? openedPublishedStrip?.profileFont}
        requestPending={view !== "published"}
        settledAssets={publishedAssetIds.filter(id => mediaLoadStatus[id] !== undefined).length +
          (entranceStrip.cover.kind === "image" && publishedCoverReady ? 1 : 0)}
        totalAssets={publishedAssetIds.length + (entranceStrip.cover.kind === "image" ? 1 : 0)}
        revealing={view === "published" && publishedLoaderPhase === "revealing"}
        onCoverSettled={() => setPublishedCoverSettledKey(entranceStrip.id)}
        onExitComplete={() => {
          setPublishedLoaderDismissedKey(entranceStrip.id);
          setOpeningCover(null);
          setOpeningStripId(null);
          pageTransitionInFlightRef.current = false;
        }}
      />, document.body, "strip-cover-entrance") : null;

  if (needsAuthBackground) return <OnboardingBackground color={authBackground}
    onChange={setAuthBackground} onContinue={() => void finishBackgroundOnboarding()}
    onBack={returnBackgroundToUsername}
    pending={stripProfile.pending} loading={stripProfile.loading || stripProfile.loadFailed}
    error={stripProfile.error} onRetry={stripProfile.retry} />;

  const navigateProfilePage = (destination: ProfileView) => {
    if (destination === "library") void returnToLibrary();
    else if (destination === "drafts") void openDraftLibrary();
    else if (destination === "history") void openHistory();
    else void openSettings();
  };
  const reloadProfileProps = {
    view: initialRouteReady && (view === "library" || view === "drafts" || view === "history" || view === "settings") ? view : undefined,
    controller: stripProfile,
    owner: authStatus === "loading" ? undefined : visitingProfileHost ? `public:${profileHostUsername}` : libraryOwnerId || undefined,
    profile: viewingPublicProfile ? (publicProfile.status === "ready" ? publicProfile.profile : undefined)
      : authStatus === "signed-in" && !visitingProfileHost && !stripProfile.loading && !stripProfile.loadFailed ? stripProfile.profile : undefined,
    username: publicProfile?.username ?? (visitingProfileHost ? profileHostUsername : authUser?.username),
    publicView: authStatus === "loading" ? undefined : visitingProfileHost || viewingPublicProfile,
    onNavigate: authStatus === "signed-in" && !visitingProfileHost ? navigateProfilePage : undefined,
    onNew: authStatus === "signed-in" && !visitingProfileHost ? beginNewStrip : undefined,
  };
  if (!initialRouteReady && !needsAuthUsername && !(view === "edit" && editorEntrance.active)) {
    return <ProfileReload {...reloadProfileProps} />;
  }
  if (profilePageIsLoading) return <ProfileReload {...reloadProfileProps} />;

  if (needsAuthUsername || (authenticationRequired && authStatus !== "signed-in")) {
    return (
      <main className={`app-shell auth-mode${authFlowStep === "landing" ? " auth-landing-mode" : " auth-signin-mode"}`}>
        <section
          className={`auth-shell auth-step-${authFlowStep} auth-transition-${authTransitionDirection}${authFlowStep === "phone" && authStickerRevealed ? " auth-sticker-revealed" : ""}`}
          aria-labelledby="auth-heading"
        >
          {authFlowStep === "landing" ? (
            <AuthLandingStrip />
          ) : (
            <>
              <header className="auth-flow-header">
                <AuthKeyboardButton
                  inputRef={authActiveInputRef}
                  keepKeyboard={authFlowStep !== "phone"}
                  className="auth-back-button"
                  type="button"
                  onClick={needsAuthUsername ? () => void returnUsernameToPhone() : authFlowStep === "code" ? editSignInPhone : returnToAuthLanding}
                  aria-label={authFlowStep !== "phone" ? "Change phone number" : "Back"}
                  disabled={authPending}
                >
                  <ArrowLeft aria-hidden="true" strokeWidth={2.8} />
                </AuthKeyboardButton>
              </header>

              <div className="auth-flow-stage">
                <div className="auth-flow-copy">
                  <h1 id="auth-heading">
                    {needsAuthUsername ? "Username" : authFlowStep === "phone" ? "Phone number" : "Confirmation"}
                  </h1>
                  <p id="auth-entry-hint">
                    {needsAuthUsername ? "3–24 letters, numbers or hyphens." : authFlowStep === "phone"
                      ? "Enter your phone number"
                      : <AuthCodeDelivery sending={authSendingCode} failed={authCodeDeliveryFailed} phone={authPhone.trim()} />}
                  </p>
                </div>

                  <form
                    id={`auth-${authFlowStep}-form`}
                    className={`auth-form auth-flow-form${authFlowStep === "code" ? " auth-confirmation-form" : ""}`}
                    onSubmit={needsAuthUsername ? claimUsername : authFlowStep === "phone" ? requestSignInCode : verifySignInCode}
                  >
                    <label htmlFor={authFlowStep === "code" ? "auth-code" : "auth-entry"}>{needsAuthUsername ? "Username" : authFlowStep === "phone" ? "Phone number" : "Verification code"}</label>
                    <div className={`auth-entry-field ${authFlowStep === "code" ? "auth-code-field" : "auth-phone-field"}`}>
                      {authFlowStep === "code" ? <div className="auth-code-cells" aria-hidden="true">
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
                      </div> : null}
                      {/* Keep both native inputs mounted. Transfer focus in the tap,
                          without blurring or recreating either editing surface. */}
                      <input
                        id="auth-entry"
                        ref={authPhoneInputRef}
                        className={`auth-phone-input${authFlowStep === "code" ? " auth-entry-inactive" : ""}`}
                        aria-hidden={authFlowStep === "code"}
                        tabIndex={authFlowStep === "code" ? -1 : 0}
                        type="text"
                        inputMode={needsAuthUsername ? "text" : "tel"}
                        readOnly={needsAuthUsername && Boolean(authUser?.username)}
                        autoComplete={needsAuthUsername ? "username" : "tel"}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        minLength={needsAuthUsername ? 3 : undefined}
                        maxLength={needsAuthUsername ? 24 : undefined}
                        required={needsAuthUsername}
                        aria-describedby={needsAuthUsername ? "auth-entry-hint username-url" : "auth-entry-hint"}
                        placeholder={needsAuthUsername ? "yourname" : authFlowStep === "phone" ? "Phone number" : undefined}
                        value={needsAuthUsername ? authUsername : authPhone}
                        onChange={(event) => {
                          if (authPending) return;
                          if (needsAuthUsername) {
                            setAuthUsername(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24));
                            setAuthUsernameError("");
                          } else if (authFlowStep === "phone") setAuthPhone(event.target.value.slice(0, 24));
                          setAuthError("");
                        }}
                        aria-busy={authPending}
                      />
                      <input
                        id="auth-code"
                        name="verification-code"
                        ref={authCodeInputRef}
                        className={`auth-code-native${authFlowStep !== "code" ? " auth-entry-inactive" : ""}`}
                        aria-hidden={authFlowStep !== "code"}
                        tabIndex={authFlowStep === "code" ? 0 : -1}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]*"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        aria-describedby="auth-entry-hint"
                        value={authCode}
                        onChange={(event) => {
                          if (authFlowStep !== "code" || (authPending && !authSendingCode)) return;
                          setAuthCode(event.target.value.replace(/\D/g, "").slice(0, AUTH_CODE_LENGTH));
                          setAuthError("");
                        }}
                      />
                    </div>
                    <div className="auth-flow-actions">
                      {needsAuthUsername ? <p id="username-url" className="auth-username-url">
                        {authUsername || "you"}.{PUBLIC_DOMAIN}
                      </p> : null}
                      {authFlowStep === "code" ? <AuthKeyboardButton
                        inputRef={authActiveInputRef}
                        className="auth-resend-button"
                        type="button"
                        onClick={() => void requestSignInCode()}
                        disabled={authPending || authResendSeconds > 0}
                      >
                        {authResendSeconds > 0
                          ? `Resend code in 0:${String(authResendSeconds).padStart(2, "0")}`
                          : "Resend code"}
                      </AuthKeyboardButton> : null}
                      <AuthKeyboardButton inputRef={authActiveInputRef} className="auth-continue-button" type="submit"
                        disabled={authPending || (needsAuthUsername ? authUsername.length < 3 : authFlowStep === "phone" ? !authPhone.trim() : authCode.length !== AUTH_CODE_LENGTH)}>
                        {authPending && !authSendingCode ? (needsAuthUsername ? "Saving…" : "Checking…") : "Continue"}
                      </AuthKeyboardButton>
                    </div>
                    {(needsAuthUsername ? authUsernameError : authError) ? (
                      <p className="auth-error" role="alert">{needsAuthUsername ? authUsernameError : authError}</p>
                    ) : null}
                    {authDevelopmentCode ? (
                      <p className="auth-dev-note">Local code: {authDevelopmentCode}</p>
                    ) : null}
                  </form>
              </div>
            </>
          )}
          {authFlowStep === "landing" ? <footer className="composer-dock auth-action-dock">
            <div className="dock-controls dock-controls-current auth-action-controls">
                <>
                  <HapticStartButton onStart={beginSignIn} />
                  <p className="auth-action-terms">
                    By continuing, you agree to our Terms &amp; Privacy Policy.
                  </p>
                </>
            </div>
          </footer> : null}
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
          : publicProfile?.strips ?? publishedStrips;
    const libraryColumns = [
      libraryItems.filter((_, index) => index % 2 === 0),
      libraryItems.filter((_, index) => index % 2 === 1),
    ];
    const libraryItemOrder = new Map(
      libraryItems.map((item, index) => [item.id, index]),
    );
    const pendingDraftDelete = draftStrips.find(
      (draft) => draft.id === pendingDraftDeleteId,
    );

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
      const coverOutline = strip.cover.kind === "color"
        ? profileCoverOutline(strip.cover.color, visibleProfile.background) : undefined;
      const coverStyle: CSSProperties | undefined =
        strip.cover.kind === "color"
          ? { backgroundColor: strip.cover.color,
              ...(coverOutline ? { boxShadow: `inset 0 0 0 2px ${coverOutline}` } : {}) }
          : strip.cover.aspectRatio
            ? { aspectRatio: String(strip.cover.aspectRatio) }
            : undefined;
      return (
        <div
          className={`library-card is-library-card-entering ${openingStripId === strip.id ? "is-opening-cover" : ""}`}
          key={strip.id}
          data-library-id={strip.id}
          style={{ "--library-item-order": Math.min(itemOrder, 8) } as CSSProperties}
        >
          <HapticActionButton
            className="library-card-open-button"
            feedback={stripProfile.editing}
            onClick={(target) => {
              if (stripProfile.editing) {
                stripProfile.showError("Save changes to access Strips");
                return;
              }
              isDraft
                ? void openDraft(strip)
                : void openPublishedStrip(strip, target);
            }}
            disabled={
              isDraft ? openingDraftId === strip.id : openingStripId === strip.id
            }
            label={`Open ${cardTitle}`}
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
          </HapticActionButton>
          {isDraft ? (
            <LibraryDeleteButton
              coverColor={strip.cover.kind === "color" ? strip.cover.color : undefined}
              imageSrc={strip.cover.kind === "image" ? strip.cover.src : undefined}
              onClick={() => setPendingDraftDeleteId(strip.id)}
              disabled={
                deletingDraftId !== null || openingDraftId === strip.id
              }
              label={`Delete ${cardTitle} draft`}
            />
          ) : null}
        </div>
      );
    };

    return (
      <>
        {coverEntranceLayer}
        {legacyTransitionLayer}
        {desktopBackControl}
        <main
          inert={openingCover !== null}
          className={`app-shell library-mode profile-theme-mode ${instantLibraryNavigation ? "is-instant-navigation" : ""} ${view === "library" ? "profile-mode" : ""} ${viewingPublicProfile ? "public-profile-mode" : ""} ${stripProfile.editing ? "is-profile-editing" : ""} ${openingCover ? "is-opening-strip" : ""} ${
            isDraftLibrary ? "drafts-library-mode" : ""
          } ${isHistory ? "history-library-mode" : ""} ${
            isSettings ? "settings-mode" : ""
          }`}
          style={profilePageStyle({ profile: visibleProfile, editing: !viewingPublicProfile && stripProfile.editing })}
        >
          <section
            className={`strip-library ${legacyPageEnterClass}`}
            style={
              {
                "--library-tab-scroll-inset": `${libraryScrollInsetRef.current}px`,
              } as CSSProperties
            }
          >
            {view === "library" ? <ProfileHeader controller={stripProfile} username={publicProfile?.username ?? authUser?.username ?? null} publicProfile={publicProfile?.profile} /> : <header className="library-header">
              <div className="profile-name">
                <h1>
                  {isSettings
                    ? "Settings"
                    : isDraftLibrary
                      ? "Drafts"
                      : isHistory
                        ? "History"
                        : "STRIP"}
                </h1>
                <div className="profile-meta-row">
                  <p className="profile-handle">
                    {isSettings
                      ? "Your account and app details."
                      : isDraftLibrary
                        ? "Pick up where you left off."
                        : "Revisit the Strips you’ve opened."}
                  </p>
                </div>
              </div>
            </header>}
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
            ) : viewingPublicProfile && publicProfile.status !== "ready" ? (
              <div className="profile-empty-state" role="status">
                <strong>{publicProfile.status === "missing" ? "This profile isn’t here." : "Couldn’t load this profile."}</strong>
                <p>{publicProfile.status === "missing" ? "Check the username and try again." : "Try refreshing in a moment."}</p>
                {publicProfile.status === "error" ? <button type="button" onClick={() => window.location.reload()}>Try again</button> : null}
              </div>
            ) : viewingPublicProfile && libraryItems.length === 0 ? (
              <div className="profile-empty-state"><strong>No Strips yet.</strong><p>Published Strips will appear here.</p></div>
            ) : view === "library" && libraryItems.length === 0 ? (
              <EmptyStripState kind="profile" editing={stripProfile.editing} />
            ) : (isHistory || isDraftLibrary) && libraryItems.length === 0 ? (
              <div className="library-empty-state" role="status">
                <strong>{isDraftLibrary ? "No drafts yet." : "No viewing history yet."}</strong>
                <span>{isDraftLibrary ? "Strips you’re working on will appear here." : "Strips you open will appear here."}</span>
              </div>
            ) : (
              <div
                className="library-grid"
                aria-label={
                  isDraftLibrary
                    ? "Your drafts"
                    : isHistory
                      ? "Your viewed Strips"
                      : "Published Strips"
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

          {!viewingPublicProfile && !isSettings && !stripProfile.editing ? (
            <button
              className="library-add-button"
              type="button"
              onClick={beginNewStrip}
              aria-label="Create a new Strip"
            >
              <Plus aria-hidden="true" />
            </button>
          ) : null}

          {/* Remove the fixed surface entirely: Safari retains its white
              edge paint even with visibility:hidden or an offscreen transform. */}
          {!viewingPublicProfile && !openingCover ? <footer
            key="persistent-composer-dock"
            className={`composer-dock app-navigation-dock ${view === "library" && stripProfile.editing ? "profile-editor-dock" : ""}`}
          >
            {view === "library" && stripProfile.editing ? <ProfileTools controller={stripProfile} /> : <>{dockTransitionLayer}
            <ProfileNavigation className={currentDockControlsClass} view={view} onNavigate={navigateProfilePage} /></>}
          </footer> : null}
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
    const storyInstagramReady = Boolean(!storyShareSheetOpen && !storyAssetLoading && storyAssetFile && storyInstagramFile === storyAssetFile);
    return (
      <>
        <link rel="preload" as="image" href="/apple-messages.jpg" />
        {legacyTransitionLayer}
        {desktopBackControl}
        <main className="app-shell share-mode" inert={storyShareSheetOpen} data-story-ready={storyInstagramReady}>
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
              <h1 id="share-heading">Pick your story poster</h1>
            </header>

            <SharePosterPicker previews={posters.previews} index={posters.index} onSelect={posters.select} designs={posters.designs} />

            <div className="poster-picker-meta">
              {posters.error ? <button type="button" className="poster-retry" onClick={posters.retry}>{posters.error}</button> : null}
              <div className="share-link-anchor">
                <CopyStripLinkButton copied={storyShareConfirmation?.copied} onCopy={() => void copyPublishedStripLink()} />
              </div>
            </div>
          </section>

          <footer className="composer-dock share-dock publish-flow-dock">
            <StoryShareControls
              instagramReady={storyInstagramReady}
              shareLabel={storyAssetLoading ? <>Preparing<AnimatedEllipsis /></> : "Share"}
              disabled={storyAssetLoading || !storyAssetFile || storyShareSheetOpen}
              onBack={() => void returnToLibrary()}
              onShare={() => void shareStoryToInstagram()}
            />
          </footer>
          {notice ? <div className="notice">{notice}</div> : null}
        </main>
        {typeof document !== "undefined" ? createPortal(
          <StoryShareBackdrop open={storyShareSheetOpen}>
            <div className="story-share-hint">
              <div className="story-share-option">
                <StoryShareSaveIcon />
                <p>Save to post</p>
              </div>
              <span className="story-share-or">or</span>
              <div className="story-share-option">
                {/* Official Apple Messages artwork: apps.apple.com/app/id1146560473. */}
                <img className="story-share-messages-icon" src="/apple-messages.jpg" width="56" height="56" alt="" />
                <p>Send to friends</p>
              </div>
            </div>
          </StoryShareBackdrop>,
          document.body,
        ) : null}
      </>
    );
  }

  if (view === "title-setup") {
    return (
      <>
        {legacyTransitionLayer}
        {desktopBackControl}
        <main className="app-shell title-setup-mode title-dock-canvas">
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
        {notice ? <div className="notice">{notice}</div> : null}
        {/* Keep the form and its covered tools in the same opaque canvas. */}
        <footer
          key="persistent-composer-dock"
          className="composer-dock title-setup-dock publish-flow-dock"
        >
          {dockTransitionLayer}
          <div className={`${currentDockControlsClass} dock-action-controls`} key={`dock-controls:${view}`}>
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
              {publishing ? <span>Publishing<AnimatedEllipsis /></span> : "Publish"}
            </button>
          </div>
        </footer>
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
      const cardChoice = coverChoices[index];
      return stackCardStyle({
        relativePosition, dragProgress: coverDragProgress,
        cardHeight: getCoverHeight(cardChoice, effectiveSelectedHeight),
        cardWidth: getCoverWidth(cardChoice, 420),
        selectedHeight: effectiveSelectedHeight,
        stageHeight: measuredStageHeight, centerPercent: coverCenterPercent,
      });
    };
    return (
      <>
        {legacyTransitionLayer}
        {desktopBackControl}
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
            <div className="cover-selector-frame" style={{ "--picker-card-width": `${effectiveSelectedWidth}px` } as CSSProperties}>
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
                        if (choice.kind === "add" && (isSelected || window.matchMedia("(hover: hover) and (pointer: fine)").matches)) {
                          if (!isSelected) selectCoverAt(index);
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
              <StackPickerArrows index={selectedCoverIndex} count={coverChoices.length} label="cover"
                top={coverCenterPercent} onSelect={selectCoverAt} />
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
          <span className="cover-instruction-mobile">Swipe up to pick a cover</span>
          <span className="cover-instruction-desktop">Select cover</span>
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
          <div className={`${currentDockControlsClass} dock-action-controls`} key={`dock-controls:${view}`}>
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
              aria-label="Next: add a title"
              disabled={!publishSetupHasCover}
            >
              Next
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
        "--ending-background": "#FFFFFF",
        "--ending-corner-color": publishedEndsWithText
          ? trailingPublishedBlock.backgroundColor ?? DEFAULT_BACKGROUND
          : undefined,
        "--ending-foreground": "#000000",
        "--ending-button": "#000000",
        "--ending-button-foreground": "#FFFFFF",
      } as CSSProperties;
      return (
        <>
          {coverEntranceLayer}
          {legacyTransitionLayer}
          {desktopBackControl}
          <main
            className={`app-shell reader-mode published-mode is-strip-reader ${
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
              inert={!publishedContentCanReveal || openingPublishedEditor}
            >
              {renderStrip(false, publishedBlocks)}
              <StripEndingSheet
                username={openedPublishedStrip?.username}
                cornerColor={publishedEndsWithText ? trailingPublishedBlock.backgroundColor ?? DEFAULT_BACKGROUND : undefined}
              >
                <StripEndActions
                  primaryAction={publishedViewerCanEdit ? "edit" : "create"}
                  primaryLabel={
                    publishedViewerCanEdit
                      ? "Edit Strip"
                      : "Make a Strip"
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
              </StripEndingSheet>
            </article>
            {notice ? <div className="notice">{notice}</div> : null}
          </main>
        </>
      );
    }
    return (
      <>
        {legacyTransitionLayer}
        {desktopBackControl}
        <main
          className={`app-shell reader-mode preview-mode is-strip-reader ${
            hasLeadingImage ? "has-leading-image" : ""
          } ${hasLeadingText ? "has-leading-text" : ""}`}
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
          {renderStrip(false, publishedBlocks)}
        </article>
        {notice ? <div className={`notice${notice === noticeShakeMessage ? " is-repeated" : ""}`} role="status" key={noticeRevision}>{notice}</div> : null}
        </main>
      </>
    );
  }

  return (
    <>
      {legacyTransitionLayer}
      {desktopBackControl}
      {!inlinePreview && mediaImportProgress?.visible && typeof document !== "undefined" ? createPortal(
        <MediaImportPopup progress={mediaImportProgress} revealing={mediaBatchRevealStarted} />,
        document.body,
      ) : null}
      <main
        aria-busy={editorEntrance.active || undefined}
        onClickCapture={(event) => {
          if (!editorEntrance.active && !imagesAreLoading && !mediaImportRequestRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          showEditorLoadingNotice(editorEntrance.active ? "Strip is loading" : "Images loading");
        }}
        onKeyDownCapture={(event) => {
          if ((!editorEntrance.active && !imagesAreLoading && !mediaImportRequestRef.current) || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) showEditorLoadingNotice(editorEntrance.active ? "Strip is loading" : "Images loading");
        }}
        className={`app-shell editor-mode ${editorEntrance.active ? `is-editor-loading${editorEntrance.phase === "revealing" ? " is-editor-revealing" : ""}` : ""} ${inlinePreview ? "is-inline-preview is-strip-reader" : ""} ${
          selectedBlockIndex >= 0 ? "has-block-toolbar" : ""
        } ${editingTextBlockId ? "is-typing" : ""} ${
          hasLeadingImage ? "has-leading-image" : ""
        } ${inlinePreview && hasLeadingText ? "has-leading-text" : ""} ${heightCropSession ? "is-height-cropping" : ""}`}
      >
      <div
        className={`top-safe-area-anchor ${legacyPageEnterClass}`}
        style={{ backgroundColor: topSafeAreaColor }}
        aria-hidden="true"
      />
      <div
        className={`editor-canvas ${legacyPageEnterClass}`}
        inert={editorEntrance.active}
        aria-hidden={editorEntrance.active || undefined}
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

      {editorEntrance.active ? <EditorEntrance key={editorEntrance.request} profile={visibleProfile} profilePending={stripProfile.loading}
        owner={authUser?.id} percent={editorEntrance.percent}
        onCountComplete={() => editorEntrance.completeCount(editorEntrance.request!)}
        revealing={editorEntrance.phase === "revealing"} /> : null}

      {!inlinePreview && !heightCropSession && selectedBlock?.type === "text" ? (
        <TextStyleSelector
          block={selectedBlock}
          tool={activeTextTool ?? lastTextTool}
          visible={activeTextTool !== null}
          onChange={(change) => updateTextStyle(selectedBlock.id, change)}
          onBack={() => setActiveTextTool(null)}
        />
      ) : null}

      <PreviewDock preview={inlinePreview}>
      <footer
        key="persistent-composer-dock"
        className={`composer-dock main-composer-dock ${
          editorDockEntering ? "is-entering-editor" : ""
        } ${activeTextTool ? "is-shifted" : ""} ${
          heightCropSession ? "is-height-cropping" : ""
        } ${stickerPickerOpen ? `is-sticker-picker-open is-sticker-picker-${stickerPickerView}` : ""}`}
        style={{
          "--sticker-dock-visible-height": stickerPickerOpen
            ? stickerPickerView !== "source"
              ? "min(78dvh, 720px)"
              : "80px"
            : "var(--dock-visible-height)",
          height:
            "calc(var(--sticker-dock-visible-height) + var(--dock-bleed) + var(--dock-surface-extra) + env(safe-area-inset-bottom) + var(--dock-browser-extension))",
          minHeight: 0,
          alignItems: stickerPickerOpen ? "flex-start" : undefined,
          transition:
            "--sticker-dock-visible-height 360ms cubic-bezier(0.22, 0.86, 0.28, 1), transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 160ms ease",
        } as CSSProperties}
      >
        {dockTransitionLayer}
        <input
          ref={stickerInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*,video/*"
          onChange={addSticker}
          aria-label="Choose a sticker image or video"
        />
        {heightCropSession ? (
          <div
            className={`${currentDockControlsClass} dock-action-controls height-crop-dock-controls`}
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
        ) : stickerPickerOpen ? (
          <StickerPicker
            open
            onClose={() => {
              stickerPlacementRef.current = null;
              setStickerPickerOpen(false);
            }}
            onViewChange={setStickerPickerView}
            onPhotoVideo={() => {
              stickerInputRef.current?.click();
            }}
            onSticker={addStickerFromPack}
            onShape={(shape, color) => void addStickerFromShape(shape, color)}
            shapeColor={shapeStickerColor}
            onShapeColorChange={setShapeStickerColor}
            samplePageColor={samplePageColorAtPoint}
          />
        ) : (
        <div className={currentDockControlsClass} key={`dock-controls:${view}`}>
          <button
            className="dock-icon-button dock-tool-button"
            type="button"
            onClick={addText}
            aria-label="Add text"
          >
            <Type className="dock-glyph" aria-hidden="true" />
          </button>
          <button
            className="dock-icon-button dock-tool-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Add photo or video"
            aria-busy={mediaImportProgress !== null || undefined}
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
          <HapticActionButton
            className="dock-icon-button dock-tool-button"
            feedback={!hasStickerAnchorBlock}
            label="Add sticker"
            onClick={() => {
              if (!hasStickerAnchorBlock) {
                showActionNotice("Add a text or image block before adding a sticker.");
                return;
              }
              setStickerPickerView("source");
              stickerPlacementRef.current = captureStickerPlacement();
              setStickerPickerOpen(true);
            }}
          >
            <Sticker className="dock-glyph" aria-hidden="true" />
          </HapticActionButton>
          <span className="dock-divider" aria-hidden="true" />
          <HapticActionButton
            className="dock-icon-button preview-toggle-button"
            label="Preview Strip"
            pressed={false}
            feedback={!hasRequiredContent}
            onClick={toggleInlinePreview}
          >
            <Eye className="dock-glyph" aria-hidden="true" />
          </HapticActionButton>
          <HapticActionButton
            className="dock-icon-button publish-icon-button publish-strip-button"
            onClick={continueToPublish}
            feedback={!hasRequiredContent}
            label="Next: choose a cover"
          >
            Next
          </HapticActionButton>
        </div>
        )}
      </footer>
      </PreviewDock>
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
      {notice ? <div className={`notice${notice === noticeShakeMessage ? " is-repeated" : ""}`} role="status" key={noticeRevision}>{notice}</div> : null}
      </main>
    </>
  );
}
