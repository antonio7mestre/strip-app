import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!ID_PATTERN.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const row = await env.DB.prepare(
    `SELECT cover_object_key
     FROM strips
     WHERE id = ? AND cover_kind = 'image'`,
  )
    .bind(id)
    .first<{ cover_object_key: string | null }>();
  if (!row?.cover_object_key) {
    return new Response("Not found", { status: 404 });
  }

  const object = await env.STRIP_MEDIA.get(row.cover_object_key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: object.httpEtag,
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
