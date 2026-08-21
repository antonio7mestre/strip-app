import { env } from "cloudflare:workers";
import { createElement } from "react";
import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/i;

type CoverRow = {
  cover_kind: "image" | "color";
  cover_color: string | null;
  cover_shape: "portrait" | "square" | "landscape" | null;
  cover_object_key: string | null;
};

function colorCoverDimensions(shape: CoverRow["cover_shape"]) {
  if (shape === "portrait") return { width: 960, height: 1200 };
  if (shape === "landscape") return { width: 1200, height: 800 };
  return { width: 1200, height: 1200 };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const row = await env.DB.prepare(
    `SELECT cover_kind, cover_color, cover_shape, cover_object_key
     FROM strips
     WHERE id = ?`,
  )
    .bind(id)
    .first<CoverRow>();
  if (!row) return new Response("Not found", { status: 404 });

  if (row.cover_kind === "color") {
    const color =
      row.cover_color && HEX_COLOR_PATTERN.test(row.cover_color)
        ? row.cover_color
        : "#2147D9";
    const dimensions = colorCoverDimensions(row.cover_shape);
    return new ImageResponse(
      createElement("div", {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: color,
        },
      }),
      {
        ...dimensions,
        headers: {
          "Cache-Control": "public, max-age=31536000, immutable",
          ETag: `"color-${color.slice(1).toLowerCase()}-${row.cover_shape ?? "square"}"`,
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  if (!row.cover_object_key) return new Response("Not found", { status: 404 });
  const object = await env.STRIP_MEDIA.get(row.cover_object_key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: object.httpEtag,
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
