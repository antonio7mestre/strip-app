import { env } from "cloudflare:workers";
import {
  readStripContent,
  writeStripContent,
} from "@/app/lib/strip-ending";
import { isSameOrigin, requireAuthUser } from "@/app/server/auth";
import { isAllowedStoredMediaContentType } from "@/app/server/media-security";

export const dynamic = "force-dynamic";

type StoredBlock =
  | {
      id: string;
      type: "text";
      content: string;
      height?: number;
      backgroundColor?: string;
      textColor?: string;
      fontStyle?: string;
      fontSize?: number;
      editedAt?: number;
    }
  | {
      id: string;
      type: "image" | "video";
      objectKey: string;
      alt: string;
      height?: number;
      audioEnabled?: boolean;
      hasAudio?: boolean;
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

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

function isMediaBlock(
  block: StoredBlock,
): block is Extract<StoredBlock, { type: "image" | "video" | "sticker" }> {
  return (
    block.type === "image" ||
    block.type === "video" ||
    block.type === "sticker"
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request." }, { status: 403 });
  }
  const auth = await requireAuthUser(request);
  if (!auth.user) return auth.response;
  const ownerId = auth.user.id;
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const strip = await env.DB.prepare(
    `SELECT owner_id, title, content_json
     FROM strips
     WHERE id = ?`,
  )
    .bind(id)
    .first<{ owner_id: string; title: string; content_json: string }>();
  if (!strip || strip.owner_id !== ownerId) {
    return new Response("Not found", { status: 404 });
  }

  const existingDraft = await env.DB.prepare(
    `SELECT id FROM drafts WHERE id = ? AND owner_id = ?`,
  )
    .bind(id, ownerId)
    .first<{ id: string }>();
  if (existingDraft) {
    return Response.json({ draft: { id }, reused: true });
  }

  const storedContent = readStripContent(strip.content_json);
  const blocks = storedContent.blocks as StoredBlock[];
  const clonedBlocks: StoredBlock[] = [];
  const clonedObjectKeys: string[] = [];

  try {
    for (const block of blocks) {
      if (!block || !ID_PATTERN.test(block.id)) continue;
      if (!isMediaBlock(block)) {
        if (block.type === "text") clonedBlocks.push(block);
        continue;
      }
      if (!block.objectKey) {
        throw new Error("Published media is missing.");
      }
      const source = await env.STRIP_MEDIA.get(block.objectKey);
      const expectedType = block.type === "video" ? "video" : "image";
      if (
        !source ||
        !isAllowedStoredMediaContentType(
          source.httpMetadata?.contentType,
          expectedType,
        )
      ) {
        throw new Error("Published media is missing.");
      }
      const objectKey = `drafts/${ownerId}/${id}/media/${block.id}`;
      await env.STRIP_MEDIA.put(objectKey, source.body, {
        httpMetadata: source.httpMetadata,
      });
      clonedObjectKeys.push(objectKey);
      clonedBlocks.push({ ...block, objectKey });
    }

    const now = Date.now();
    const coverImage = clonedBlocks.find((block) => block.type === "image");
    const firstText = clonedBlocks.find((block) => block.type === "text");
    const coverColor =
      firstText?.type === "text"
        ? firstText.backgroundColor ?? "#202020"
        : "#202020";
    await env.DB.prepare(
      `INSERT INTO drafts (
        id, owner_id, title, cover_kind, cover_color, cover_block_id,
        content_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        ownerId,
        strip.title,
        coverImage ? "image" : "color",
        coverColor,
        coverImage?.id ?? null,
        writeStripContent(clonedBlocks, storedContent.endingStyle),
        now,
        now,
      )
      .run();

    return Response.json({ draft: { id }, reused: false }, { status: 201 });
  } catch (error) {
    await Promise.all(
      clonedObjectKeys.map((objectKey) => env.STRIP_MEDIA.delete(objectKey)),
    );
    throw error;
  }
}
