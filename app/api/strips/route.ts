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
  title?: string;
  publishedAt?: number;
  cover?:
    | { kind: "image"; src: string; alt?: string }
    | {
        kind: "color";
        color: string;
        shape: "portrait" | "square" | "landscape";
      };
};

const OWNER_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const COVER_SHAPES = new Set(["portrait", "square", "landscape"]);
const MAX_COVER_BYTES = 20 * 1024 * 1024;

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

function decodeImageDataUrl(value: string) {
  const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=\s]+)$/.exec(value);
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  if (!contentType.startsWith("image/")) return null;

  let binary: string;
  try {
    binary = atob(match[2].replace(/\s/g, ""));
  } catch {
    return null;
  }
  if (binary.length > MAX_COVER_BYTES) return null;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, contentType };
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
  const title = (input.title ?? "").trim().slice(0, 80);
  const publishedAt = Number.isFinite(input.publishedAt)
    ? Math.round(input.publishedAt as number)
    : Date.now();
  if (!OWNER_PATTERN.test(ownerId) || !ID_PATTERN.test(id) || !input.cover) {
    return Response.json({ error: "Invalid Strip." }, { status: 400 });
  }

  let coverColor: string | null = null;
  let coverShape: string | null = null;
  let coverObjectKey: string | null = null;
  let coverAlt: string | null = null;

  if (input.cover.kind === "image") {
    const image = decodeImageDataUrl(input.cover.src);
    if (!image) {
      return Response.json({ error: "Invalid cover image." }, { status: 400 });
    }
    coverObjectKey = `covers/${ownerId}/${id}.${imageExtension(image.contentType)}`;
    coverAlt = (input.cover.alt ?? "Strip cover").slice(0, 160);
    await env.STRIP_MEDIA.put(coverObjectKey, image.bytes, {
      httpMetadata: { contentType: image.contentType },
    });
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
    await env.DB.prepare(
      `INSERT INTO strips (
        id, owner_id, title, cover_kind, cover_color, cover_shape,
        cover_object_key, cover_alt, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        publishedAt,
      )
      .run();
  } catch (error) {
    if (coverObjectKey) await env.STRIP_MEDIA.delete(coverObjectKey);
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
