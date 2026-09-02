import { env } from "cloudflare:workers";
import {
  readStripContent,
  writeStripContent,
  type StripEndingStyle,
} from "@/app/lib/strip-ending";
import { isSameOrigin, requireAuthUser } from "@/app/server/auth";
import { isAllowedStoredMediaContentType } from "@/app/server/media-security";

export const dynamic = "force-dynamic";

type DraftBlock =
  | {
      id: string;
      type: "text";
      content: string;
      height?: number;
      cropTop?: number;
      cropBottom?: number;
      backgroundColor?: string;
      textColor?: string;
      fontStyle?: string;
      fontSize?: number;
      editedAt?: number;
  }
  | {
      id: string;
      type: "image" | "video";
      src: string;
      alt: string;
      height?: number;
      cropTop?: number;
      cropBottom?: number;
      audioEnabled?: boolean;
      hasAudio?: boolean;
    }
  | {
      id: string;
      type: "sticker";
      src: string;
      alt: string;
      mediaType?: "image" | "video";
      x: number;
      y: number;
      width: number;
    };

type StoredDraftBlock =
  | Exclude<DraftBlock, { type: "image" | "video" | "sticker" }>
  | {
      id: string;
      type: "image" | "video";
      objectKey: string;
      alt: string;
      height?: number;
      cropTop?: number;
      cropBottom?: number;
      audioEnabled?: boolean;
      hasAudio?: boolean;
    }
  | {
      id: string;
      type: "sticker";
      objectKey: string;
      alt: string;
      mediaType?: "image" | "video";
      x: number;
      y: number;
      width: number;
    };

type StoredDraftRow = {
  id: string;
  title: string;
  cover_kind: "image" | "color";
  cover_color: string | null;
  cover_block_id: string | null;
  created_at: number;
  updated_at: number;
};

type DraftRequest = {
  id?: string;
  title?: string;
  createdAt?: number;
  updatedAt?: number;
  blocks?: DraftBlock[];
  endingStyle?: StripEndingStyle;
};

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

function finiteNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
const MAX_MEDIA_BYTES = 80 * 1024 * 1024;
const MAX_BLOCKS = 100;

function draftMediaPath(draftId: string, blockId: string) {
  return `/api/drafts/${encodeURIComponent(draftId)}/media/${encodeURIComponent(blockId)}`;
}

function serializeRow(row: StoredDraftRow) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cover:
      row.cover_kind === "image" && row.cover_block_id
        ? {
            kind: "image" as const,
            src: draftMediaPath(row.id, row.cover_block_id),
            alt: "Draft cover",
          }
        : {
            kind: "color" as const,
            color: row.cover_color ?? "#202020",
            shape: "square" as const,
          },
  };
}

function decodeMediaDataUrl(
  value: string,
  expectedType: "image" | "video",
) {
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=\s]+)$/.exec(value);
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  if (!isAllowedStoredMediaContentType(contentType, expectedType)) return null;

  let binary: string;
  try {
    binary = atob(match[2].replace(/\s/g, ""));
  } catch {
    return null;
  }
  if (binary.length > MAX_MEDIA_BYTES) return null;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, contentType };
}

function isExistingDraftMediaPath(
  value: string,
  draftId: string,
  blockId: string,
) {
  try {
    const url = new URL(value, "https://strip.local");
    return (
      url.pathname ===
      `/api/drafts/${encodeURIComponent(draftId)}/media/${encodeURIComponent(blockId)}`
    );
  } catch {
    return false;
  }
}

function prepareDraftBlocks(
  ownerId: string,
  draftId: string,
  inputBlocks: DraftBlock[],
) {
  if (inputBlocks.length > MAX_BLOCKS) return null;
  const uploads: Array<{
    objectKey: string;
    bytes: Uint8Array;
    contentType: string;
  }> = [];
  const storedBlocks: StoredDraftBlock[] = [];

  for (const block of inputBlocks) {
    if (!ID_PATTERN.test(block.id)) return null;
    if (block.type === "text") {
      storedBlocks.push({
        id: block.id,
        type: "text",
        content: String(block.content ?? "").slice(0, 100_000),
        ...(finiteNumber(block.height, 0) > 0
          ? { height: Math.min(20_000, finiteNumber(block.height, 0)) }
          : {}),
        ...(finiteNumber(block.cropTop, 0) > 0
          ? { cropTop: Math.min(20_000, finiteNumber(block.cropTop, 0)) }
          : {}),
        ...(finiteNumber(block.cropBottom, 0) > 0
          ? { cropBottom: Math.min(20_000, finiteNumber(block.cropBottom, 0)) }
          : {}),
        backgroundColor: block.backgroundColor,
        textColor: block.textColor,
        fontStyle: block.fontStyle,
        fontSize: block.fontSize,
        editedAt: block.editedAt,
      });
      continue;
    }

    const objectKey = `drafts/${ownerId}/${draftId}/media/${block.id}`;
    const expectedType =
      block.type === "video" ||
      (block.type === "sticker" && block.mediaType === "video")
        ? "video"
        : "image";
    const media = decodeMediaDataUrl(
      block.src,
      expectedType,
    );
    if (media) {
      uploads.push({ objectKey, ...media });
    } else if (!isExistingDraftMediaPath(block.src, draftId, block.id)) {
      return null;
    }
    if (block.type === "sticker") {
      storedBlocks.push({
        id: block.id,
        type: "sticker",
        objectKey,
        alt: String(block.alt ?? "").slice(0, 160),
        mediaType: block.mediaType === "video" ? "video" : "image",
        x: finiteNumber(block.x, 50),
        y: Math.max(0, finiteNumber(block.y, 0)),
        width: Math.min(80, Math.max(8, finiteNumber(block.width, 30))),
      });
    } else {
      storedBlocks.push({
        id: block.id,
        type: block.type,
        objectKey,
        alt: String(block.alt ?? "").slice(0, 160),
        ...(finiteNumber(block.height, 0) > 0
          ? { height: Math.min(20_000, finiteNumber(block.height, 0)) }
          : {}),
        ...(finiteNumber(block.cropTop, 0) > 0
          ? { cropTop: Math.min(20_000, finiteNumber(block.cropTop, 0)) }
          : {}),
        ...(finiteNumber(block.cropBottom, 0) > 0
          ? { cropBottom: Math.min(20_000, finiteNumber(block.cropBottom, 0)) }
          : {}),
        ...(block.type === "video"
          ? {
              audioEnabled: block.audioEnabled !== false,
              ...(typeof block.hasAudio === "boolean"
                ? { hasAudio: block.hasAudio }
                : {}),
            }
          : {}),
      });
    }
  }

  return { uploads, storedBlocks };
}

function storedMediaObjectKeys(value: string | null) {
  if (!value) return [];
  const { blocks } = readStripContent(value);
  return blocks.flatMap((block) => {
    if (
      !block ||
      typeof block !== "object" ||
      !("type" in block) ||
      !("objectKey" in block) ||
      (block.type !== "image" &&
        block.type !== "video" &&
        block.type !== "sticker") ||
      typeof block.objectKey !== "string"
    ) {
      return [];
    }
    return [block.objectKey];
  });
}

export async function GET(request: Request) {
  const auth = await requireAuthUser(request);
  if (!auth.user) return auth.response;
  const ownerId = auth.user.id;

  const result = await env.DB.prepare(
    `SELECT id, title, cover_kind, cover_color, cover_block_id,
      created_at, updated_at
     FROM drafts
     WHERE owner_id = ?
     ORDER BY updated_at DESC`,
  )
    .bind(ownerId)
    .all<StoredDraftRow>();

  return Response.json({
    drafts: result.results.map((row: StoredDraftRow) => serializeRow(row)),
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request." }, { status: 403 });
  }
  const auth = await requireAuthUser(request);
  if (!auth.user) return auth.response;
  let input: DraftRequest;
  try {
    input = (await request.json()) as DraftRequest;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const ownerId = auth.user.id;
  const id = input.id ?? "";
  if (!ID_PATTERN.test(id)) {
    return Response.json({ error: "Invalid draft." }, { status: 400 });
  }
  const inputBlocks = Array.isArray(input.blocks) ? input.blocks : [];
  if (inputBlocks.length === 0) {
    return Response.json({ error: "Empty drafts are not stored." }, { status: 400 });
  }
  const prepared = prepareDraftBlocks(ownerId, id, inputBlocks);
  if (!prepared) {
    return Response.json({ error: "Invalid draft content." }, { status: 400 });
  }

  const existing = await env.DB.prepare(
    `SELECT owner_id, content_json, created_at
     FROM drafts
     WHERE id = ?`,
  )
    .bind(id)
    .first<{ owner_id: string; content_json: string; created_at: number }>();
  if (existing && existing.owner_id !== ownerId) {
    return Response.json({ error: "Draft already exists." }, { status: 409 });
  }

  const now = Date.now();
  const createdAt = existing?.created_at ??
    (Number.isFinite(input.createdAt) ? Math.round(input.createdAt as number) : now);
  const updatedAt = Number.isFinite(input.updatedAt)
    ? Math.round(input.updatedAt as number)
    : now;
  const title = (input.title ?? "").trim().slice(0, 80);
  const coverImage = prepared.storedBlocks.find((block) => block.type === "image");
  const firstText = prepared.storedBlocks.find((block) => block.type === "text");
  const coverKind = coverImage ? "image" : "color";
  const coverBlockId = coverImage?.id ?? null;
  const coverColor =
    firstText?.type === "text" ? firstText.backgroundColor ?? "#202020" : "#202020";
  const existingEndingStyle = existing
    ? readStripContent(existing.content_json).endingStyle
    : undefined;
  const contentJson = writeStripContent(
    prepared.storedBlocks,
    input.endingStyle ?? existingEndingStyle,
  );

  for (const upload of prepared.uploads) {
    await env.STRIP_MEDIA.put(upload.objectKey, upload.bytes, {
      httpMetadata: { contentType: upload.contentType },
    });
  }

  await env.DB.prepare(
    `INSERT INTO drafts (
      id, owner_id, title, cover_kind, cover_color, cover_block_id,
      content_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      cover_kind = excluded.cover_kind,
      cover_color = excluded.cover_color,
      cover_block_id = excluded.cover_block_id,
      content_json = excluded.content_json,
      updated_at = excluded.updated_at
    WHERE drafts.owner_id = excluded.owner_id
      AND excluded.updated_at >= drafts.updated_at`,
  )
    .bind(
      id,
      ownerId,
      title,
      coverKind,
      coverColor,
      coverBlockId,
      contentJson,
      createdAt,
      updatedAt,
    )
    .run();

  const retainedKeys = new Set(storedMediaObjectKeys(contentJson));
  const removedKeys = storedMediaObjectKeys(existing?.content_json ?? null).filter(
    (objectKey) => !retainedKeys.has(objectKey),
  );
  await Promise.all(removedKeys.map((objectKey) => env.STRIP_MEDIA.delete(objectKey)));

  return Response.json({
    draft: serializeRow(
      {
        id,
        title,
        cover_kind: coverKind,
        cover_color: coverColor,
        cover_block_id: coverBlockId,
        created_at: createdAt,
        updated_at: updatedAt,
      },
    ),
  });
}
