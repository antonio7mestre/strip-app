import { env } from "cloudflare:workers";
import { requireAuthUser } from "@/app/server/auth";
import { applyPublicMediaSecurityHeaders } from "@/app/server/media-security";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireAuthUser(request);
  if (!auth.user) return auth.response;
  const row = await env.DB.prepare("SELECT photo_key FROM profiles WHERE user_id = ?")
    .bind(auth.user.id).first<{ photo_key: string | null }>();
  if (!row?.photo_key) return new Response(null, { status: 404 });
  const object = await env.STRIP_MEDIA.get(row.photo_key);
  if (!object) return new Response(null, { status: 404 });
  const headers = new Headers({ "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" });
  applyPublicMediaSecurityHeaders(headers);
  return new Response(object.body, { headers });
}
