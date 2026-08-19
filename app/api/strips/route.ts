import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type StoredStripRow = {
  id: string;
  title: string;
  cover_kind: "image" | "color";
  cover_color: string | null;
  cover_shape: "portrait" | "square" | "landscape" | null;
  cover_object_key: string | null;
  cover_alt: string | null;
  published_at: number;
};

type PublishRequest = {
  ownerId?: string;
  id?: string;
  draftId?: string | null;
  title?: string;
  publishedAt?: number;
  cover?:
    | { kind: "image"; src: string; alt?: string }
    | {
        kind: "color";
        color: string;
        shape: "portrait" | "square" | "landscape";
      };
  blocks?: PublishBlock[];
};

type PublishBlock =
  | {
      id: string;
      type: "text";
      content: string;
      backgroundColor?: string;
      textColor?: string;
      fontStyle?: string;
      fontSize?: number;
      editedAt?: number;
  }
  | { id: string; type: "image" | "video"; src: string; alt: string }
  | {
      id: string;
      type: "sticker";
      src: string;
      alt: string;
      x: number;
      y: number;
      width: number;
    };

type StoredContentBlock =
  | Exclude<PublishBlock, { type: "image" | "video" | "sticker" }>
  | {
      id: string;
      type: "image" | "video";
      objectKey: string;
      alt: string;
    }
  | {
      id: string;
      type: "sticker";
      objectKey: string;
      alt: string;
      x: number;
      y: number;
      width: number;
    };

const OWNER_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const COVER_SHAPES = new Set(["portrait", "square", "landscape"]);
const MAX_COVER_BYTES = 20 * 1024 * 1024;
const MAX_MEDIA_BYTES = 80 * 1024 * 1024;
const MAX_BLOCKS = 100;

function imageCoverPath(ownerId: string, stripId: string) {
  return `/api/strips/${encodeURIComponent(stripId)}/cover?ownerId=${encodeURIComponent(ownerId)}`;
}

function serializeRow(row: StoredStripRow, ownerId: string) {
  return {
    id: row.id,
    title: row.title,
    publishedAt: row.published_at,
    cover:
      row.cover_kind === "image"
        ? {
            kind: "image" as const,
            src: imageCoverPath(ownerId, row.id),
            alt: row.cover_alt ?? "Strip cover",
          }
        : {
            kind: "color" as const,
            color: row.cover_color ?? "#2147D9",
            shape: COVER_SHAPES.has(row.cover_shape ?? "")
              ? row.cover_shape
              : "square",
          },
  };
}

function decodeMediaDataUrl(
  value: string,
  expectedType: "image" | "video",
  maxBytes: number,
) {
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=\s]+)$/.exec(value);
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  if (!contentType.startsWith(`${expectedType}/`)) return null;

  let binary: string;
  try {
    binary = atob(match[2].replace(/\s/g, ""));
  } catch {
    return null;
  }
  if (binary.length > maxBytes) return null;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, contentType };
}

function draftMediaBlockId(value: string, draftId: string) {
  try {
    const url = new URL(value, "https://strip.local");
    const prefix = `/api/drafts/${encodeURIComponent(draftId)}/media/`;
    if (!url.pathname.startsWith(prefix)) return null;
    const blockId = decodeURIComponent(url.pathname.slice(prefix.length));
    return ID_PATTERN.test(blockId) ? blockId : null;
  } catch {
    return null;
  }
}

function prepareContentBlocks(
  ownerId: string,
  stripId: string,
  draftId: string | null,
  inputBlocks: PublishBlock[],
) {
  if (inputBlocks.length > MAX_BLOCKS) return null;
  const uploads: Array<{
    objectKey: string;
    bytes: Uint8Array;
    contentType: string;
  }> = [];
  const copies: Array<{ sourceObjectKey: string; objectKey: string }> = [];
  const storedBlocks: StoredContentBlock[] = [];

  for (const block of inputBlocks) {
    if (!ID_PATTERN.test(block.id)) return null;
    if (block.type === "text") {
      storedBlocks.push({
        id: block.id,
        type: "text",
        content: String(block.content ?? "").slice(0, 100_000),
        backgroundColor: block.backgroundColor,
        textColor: block.textColor,
        fontStyle: block.fontStyle,
        fontSize: block.fontSize,
        editedAt: block.editedAt,
      });
      continue;
    }

    const objectKey = `strips/${ownerId}/${stripId}/media/${block.id}`;
    const media = decodeMediaDataUrl(
      block.src,
      block.type === "video" ? "video" : "image",
      MAX_MEDIA_BYTES,
    );
    if (media) {
      uploads.push({ objectKey, ...media });
    } else {
      const sourceBlockId = draftId
        ? draftMediaBlockId(block.src, draftId)
        : null;
      if (!draftId || sourceBlockId !== block.id) return null;
      copies.push({
        sourceObjectKey: `drafts/${ownerId}/${draftId}/media/${block.id}`,
        objectKey,
      });
    }
    if (block.type === "sticker") {
      storedBlocks.push({
        id: block.id,
        type: "sticker",
        objectKey,
        alt: String(block.alt ?? "").slice(0, 160),
        x: Math.min(100, Math.max(0, Number(block.x) || 50)),
        y: Math.max(0, Number(block.y) || 0),
        width: Math.min(80, Math.max(8, Number(block.width) || 30)),
      });
    } else {
      storedBlocks.push({
        id: block.id,
        type: block.type,
        objectKey,
        alt: String(block.alt ?? "").slice(0, 160),
      });
    }
  }

  return { uploads, copies, storedBlocks };
}

function imageExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/avif") return "avif";
  return "jpg";
}

export async function GET(request: Request) {
  const ownerId = new URL(request.url).searchParams.get("ownerId") ?? "";
  if (!OWNER_PATTERN.test(ownerId)) {
    return Response.json({ error: "Invalid owner." }, { status: 400 });
  }

  const result = await env.DB.prepare(
    `SELECT id, title, cover_kind, cover_color, cover_shape,
      cover_object_key, cover_alt, published_at
     FROM strips
     WHERE owner_id = ?
     ORDER BY published_at DESC`,
  )
    .bind(ownerId)
    .all<StoredStripRow>();

  return Response.json({
    strips: result.results.map((row: StoredStripRow) => serializeRow(row, ownerId)),
  });
}

export async function POST(request: Request) {
  let input: PublishRequest;
  try {
    input = (await request.json()) as PublishRequest;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const ownerId = input.ownerId ?? "";
  const id = input.id ?? "";
  const draftId = input.draftId ?? null;
  const title = (input.title ?? "").trim().slice(0, 80);
  const publishedAt = Number.isFinite(input.publishedAt)
    ? Math.round(input.publishedAt as number)
    : Date.now();
  if (
    !OWNER_PATTERN.test(ownerId) ||
    !ID_PATTERN.test(id) ||
    (draftId !== null && !ID_PATTERN.test(draftId)) ||
    !input.cover
  ) {
    return Response.json({ error: "Invalid Strip." }, { status: 400 });
  }
  const preparedContent = prepareContentBlocks(
    ownerId,
    id,
    draftId,
    Array.isArray(input.blocks) ? input.blocks : [],
  );
  if (!preparedContent) {
    return Response.json({ error: "Invalid Strip content." }, { status: 400 });
  }

  let coverColor: string | null = null;
  let coverShape: string | null = null;
  let coverObjectKey: string | null = null;
  let coverCopySourceKey: string | null = null;
  let coverAlt: string | null = null;
  const uploadedObjectKeys: string[] = [];

  if (input.cover.kind === "image") {
    const image = decodeMediaDataUrl(input.cover.src, "image", MAX_COVER_BYTES);
    const sourceBlockId =
      !image && draftId ? draftMediaBlockId(input.cover.src, draftId) : null;
    if (!image && !sourceBlockId) {
      return Response.json({ error: "Invalid cover image." }, { status: 400 });
    }
    coverObjectKey = image
      ? `covers/${ownerId}/${id}.${imageExtension(image.contentType)}`
      : `covers/${ownerId}/${id}`;
    coverCopySourceKey = sourceBlockId
      ? `drafts/${ownerId}/${draftId}/media/${sourceBlockId}`
      : null;
    coverAlt = (input.cover.alt ?? "Strip cover").slice(0, 160);
  } else {
    const color = input.cover.color.trim().toUpperCase();
    if (!color || color === "#000" || color === "#000000") {
      return Response.json({ error: "Invalid cover color." }, { status: 400 });
    }
    coverColor = color.slice(0, 64);
    coverShape = COVER_SHAPES.has(input.cover.shape)
      ? input.cover.shape
      : "square";
  }

  try {
    if (coverObjectKey && input.cover.kind === "image") {
      const image = decodeMediaDataUrl(input.cover.src, "image", MAX_COVER_BYTES);
      if (image) {
        await env.STRIP_MEDIA.put(coverObjectKey, image.bytes, {
          httpMetadata: { contentType: image.contentType },
        });
      } else if (coverCopySourceKey) {
        const source = await env.STRIP_MEDIA.get(coverCopySourceKey);
        if (!source?.httpMetadata?.contentType?.startsWith("image/")) {
          throw new Error("Missing draft cover image.");
        }
        await env.STRIP_MEDIA.put(coverObjectKey, source.body, {
          httpMetadata: source.httpMetadata,
        });
      }
      uploadedObjectKeys.push(coverObjectKey);
    }
    for (const upload of preparedContent.uploads) {
      await env.STRIP_MEDIA.put(upload.objectKey, upload.bytes, {
        httpMetadata: { contentType: upload.contentType },
      });
      uploadedObjectKeys.push(upload.objectKey);
    }
    for (const copy of preparedContent.copies) {
      const source = await env.STRIP_MEDIA.get(copy.sourceObjectKey);
      if (!source) throw new Error("Missing draft media.");
      await env.STRIP_MEDIA.put(copy.objectKey, source.body, {
        httpMetadata: source.httpMetadata,
      });
      uploadedObjectKeys.push(copy.objectKey);
    }
    await env.DB.prepare(
      `INSERT INTO strips (
        id, owner_id, title, cover_kind, cover_color, cover_shape,
        cover_object_key, cover_alt, content_json, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        ownerId,
        title,
        input.cover.kind,
        coverColor,
        coverShape,
        coverObjectKey,
        coverAlt,
        JSON.stringify(preparedContent.storedBlocks),
        publishedAt,
      )
      .run();
  } catch (error) {
    await Promise.all(
      uploadedObjectKeys.map((objectKey) => env.STRIP_MEDIA.delete(objectKey)),
    );
    throw error;
  }

  const row: StoredStripRow = {
    id,
    title,
    cover_kind: input.cover.kind,
    cover_color: coverColor,
    cover_shape: coverShape as StoredStripRow["cover_shape"],
    cover_object_key: coverObjectKey,
    cover_alt: coverAlt,
    published_at: publishedAt,
  };
  return Response.json({ strip: serializeRow(row, ownerId) }, { status: 201 });
}
