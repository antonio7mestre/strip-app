import { env } from "cloudflare:workers";
import { requireAuthUser } from "@/app/server/auth";
import { ensureViewHistorySchema } from "@/app/server/view-history";

export const dynamic = "force-dynamic";

type ViewedStripRow = {
  id: string;
  username: string | null;
  title: string;
  cover_kind: "image" | "color";
  cover_color: string | null;
  cover_shape: "portrait" | "square" | "landscape" | null;
  cover_alt: string | null;
  published_at: number;
  viewed_at: number;
};

const COVER_SHAPES = new Set(["portrait", "square", "landscape"]);

function coverPath(stripId: string) {
  return `/api/strips/${encodeURIComponent(stripId)}/cover`;
}

function serializeHistoryRow(row: ViewedStripRow) {
  return {
    id: row.id,
    username: row.username,
    title: row.title,
    publishedAt: row.published_at,
    viewedAt: row.viewed_at,
    cover:
      row.cover_kind === "image"
        ? {
            kind: "image" as const,
            src: coverPath(row.id),
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

export async function GET(request: Request) {
  const auth = await requireAuthUser(request);
  if (auth.response) return auth.response;

  await ensureViewHistorySchema();
  const result = await env.DB.prepare(
    `SELECT s.id, u.username, s.title, s.cover_kind, s.cover_color,
      s.cover_shape, s.cover_alt, s.published_at, h.viewed_at
     FROM viewed_strips h
     JOIN strips s ON s.id = h.strip_id
     LEFT JOIN users u ON u.id = s.owner_id
     WHERE h.user_id = ?
     ORDER BY h.viewed_at DESC
     LIMIT 100`,
  )
    .bind(auth.user.id)
    .all<ViewedStripRow>();

  return Response.json({
    history: (result.results ?? []).map(serializeHistoryRow),
  });
}
