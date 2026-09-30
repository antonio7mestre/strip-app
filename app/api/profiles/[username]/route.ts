import { env } from "cloudflare:workers";
import { validateUsername } from "@/app/lib/username";
import { DEFAULT_PROFILE } from "@/app/lib/profile";

export const dynamic = "force-dynamic";

type PublicProfileRow = {
  username: string;
  title: string | null;
  font: string | null;
  background: string | null;
  accent: string | null;
};
type PublicCoverRow = {
  id: string;
  title: string;
  cover_kind: "image" | "color";
  cover_color: string | null;
  cover_shape: "portrait" | "square" | "landscape" | null;
  cover_alt: string | null;
  published_at: number;
};

/** Public appearance and published covers only. Never reuse the private library API. */
export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  const { username: input } = await context.params;
  const validation = validateUsername(input);
  const headers = { "Cache-Control": "no-store" };
  const missing = () => Response.json({ error: "Profile not found." }, { status: 404, headers });
  if (!validation.ok) return missing();

  const row = await env.DB.prepare(
    `SELECT u.username, p.title, p.font, p.background, p.accent
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.username = ?`,
  ).bind(validation.username).first<PublicProfileRow>();
  if (!row) return missing();

  const { results } = await env.DB.prepare(
    `SELECT s.id, s.title, s.cover_kind, s.cover_color, s.cover_shape, s.cover_alt, s.published_at
     FROM strips s JOIN users u ON u.id = s.owner_id
     WHERE u.username = ? ORDER BY s.published_at DESC, s.id DESC`,
  ).bind(row.username).all<PublicCoverRow>();

  return Response.json({
    username: row.username,
    profile: {
      title: row.title ?? DEFAULT_PROFILE.title,
      font: row.font ?? DEFAULT_PROFILE.font,
      background: row.background ?? DEFAULT_PROFILE.background,
      accent: row.accent ?? DEFAULT_PROFILE.accent,
      // Photos were removed from profiles. Do not expose the private photo endpoint.
      photoUrl: null,
      revision: 0,
    },
    strips: results.map((strip: PublicCoverRow) => ({
      id: strip.id, username: row.username, title: strip.title, publishedAt: strip.published_at,
      cover: strip.cover_kind === "image"
        ? { kind: "image", src: `/api/strips/${encodeURIComponent(strip.id)}/cover`, alt: strip.cover_alt ?? "Strip cover" }
        : { kind: "color", color: strip.cover_color ?? "#2147D9", shape: strip.cover_shape ?? "square" },
    })),
  }, { headers });
}
