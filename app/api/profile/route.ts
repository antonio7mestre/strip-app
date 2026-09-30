import { env } from "cloudflare:workers";
import { isSameOrigin, requireAuthUser, consumeRateLimit } from "@/app/server/auth";
import { validateProfile, profileColorsReadable, PROFILE_COLOR_ERROR } from "@/app/lib/profile";
import { decodeProfilePhoto, readProfileInput, serializeProfile, type ProfileRow } from "@/app/server/profile";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const auth = await requireAuthUser(request);
  if (!auth.user) return auth.response;
  try {
    const row = await env.DB.prepare("SELECT * FROM profiles WHERE user_id = ?")
      .bind(auth.user.id).first<ProfileRow>();
    return Response.json({ profile: serializeProfile(row) }, { headers });
  } catch {
    return Response.json({ error: "Could not load your profile. Try again." }, { status: 503, headers });
  }
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request." }, { status: 403, headers });
  const auth = await requireAuthUser(request);
  if (!auth.user) return auth.response;
  let input: unknown;
  try { input = await readProfileInput(request); }
  catch { return Response.json({ error: "Use a smaller photo and try again." }, { status: 400, headers }); }
  const profile = validateProfile(input);
  if (!profile) return Response.json({ error: "Check your profile and try again." }, { status: 400, headers });
  if (!profileColorsReadable(profile)) return Response.json({ error: PROFILE_COLOR_ERROR }, { status: 400, headers });
  const photo = (input as Record<string, unknown>).photo;
  const bytes = photo === undefined || photo === null ? null : decodeProfilePhoto(photo);
  if (photo !== undefined && photo !== null && !bytes) {
    return Response.json({ error: "Choose another profile photo." }, { status: 400, headers });
  }
  if (!await consumeRateLimit(`profile:${auth.user.id}`, 30, 60_000)) {
    return Response.json({ error: "Give it a moment, then save again." }, { status: 429, headers });
  }
  let uploadedKey: string | null = null;
  let saved = false;
  try {
    const existing = await env.DB.prepare("SELECT * FROM profiles WHERE user_id = ?")
      .bind(auth.user.id).first<ProfileRow>();
    if ((existing?.revision ?? 0) !== profile.revision) {
      return Response.json({ error: "Your profile changed elsewhere. Reload before saving." }, { status: 409, headers });
    }
    let photoKey = existing?.photo_key ?? null;
    if (bytes) {
      uploadedKey = `profiles/${auth.user.id}/${crypto.randomUUID()}.jpg`;
      await env.STRIP_MEDIA.put(uploadedKey, bytes, { httpMetadata: { contentType: "image/jpeg" } });
      photoKey = uploadedKey;
    } else if (photo === null) photoKey = null;
    const revision = profile.revision + 1;
    const result = await env.DB.prepare(`INSERT INTO profiles
      (user_id, title, font, background, accent, photo_key, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET title=excluded.title, font=excluded.font,
        background=excluded.background, accent=excluded.accent, photo_key=excluded.photo_key,
        revision=excluded.revision WHERE profiles.revision = ?`)
      .bind(auth.user.id, profile.title, profile.font, profile.background, profile.accent, photoKey, revision, profile.revision).run();
    if (result.meta.changes !== 1) {
      return Response.json({ error: "Your profile changed elsewhere. Reload before saving." }, { status: 409, headers });
    }
    saved = true;
    if (existing?.photo_key && existing.photo_key !== photoKey) {
      // A cleanup failure must not turn a successful save into a failed one.
      await env.STRIP_MEDIA.delete(existing.photo_key).catch(() => console.error("Profile photo cleanup failed"));
    }
    return Response.json({ profile: serializeProfile({ ...profile, photo_key: photoKey, revision }) }, { headers });
  } catch {
    return Response.json({ error: "Could not save your profile. Try again." }, { status: 503, headers });
  } finally {
    if (uploadedKey && !saved) await env.STRIP_MEDIA.delete(uploadedKey).catch(() => console.error("Profile photo cleanup failed"));
  }
}
