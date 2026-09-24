import { env } from "cloudflare:workers";
import { isSameOrigin, requireAuthUser } from "@/app/server/auth";
import { GenerationError, generateStripPlan, parseGenerationPhotos, readBoundedJson } from "@/app/server/generate-strip";
import { MAX_GENERATION_BODY_BYTES } from "@/app/lib/generated-strip";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Invalid request." }, 403);
  const auth = await requireAuthUser(request);
  if (!auth.user) return auth.response;
  // Secrets are runtime bindings, never NEXT_PUBLIC values or client inputs.
  const key = "OPENAI_API_KEY" in env && typeof env.OPENAI_API_KEY === "string" ? env.OPENAI_API_KEY : "";
  const model = "OPENAI_STRIP_MODEL" in env && typeof env.OPENAI_STRIP_MODEL === "string" ? env.OPENAI_STRIP_MODEL : "gpt-5.4-mini";
  if (!key) return json({ error: "Generate isn’t ready yet. You can start from scratch for now." }, 503);
  try {
    const photos = parseGenerationPhotos(await readBoundedJson(request, MAX_GENERATION_BODY_BYTES));
    // Atomic per-account budgets, shared between Worker instances. Never use
    // an isolate-local Map to protect a paid endpoint.
    for (const [windowMs, maximum, label] of [[60_000, 2, "minute"], [86_400_000, 20, "day"]] as const) {
      const now = Date.now();
      const count = await env.DB.prepare(`INSERT INTO auth_rate_limits (rate_key, window_started_at, count)
        VALUES (?, ?, 1) ON CONFLICT(rate_key) DO UPDATE SET
        count = CASE WHEN window_started_at <= ? THEN 1 ELSE count + 1 END,
        window_started_at = CASE WHEN window_started_at <= ? THEN excluded.window_started_at ELSE window_started_at END
        WHERE window_started_at <= ? OR count < ? RETURNING count`)
        .bind(`generate:${label}:${auth.user.id}`, now, now - windowMs, now - windowMs, now - windowMs, maximum)
        .first<{ count: number }>();
      if (!count) return json({ error: label === "minute" ? "Give it a minute, then try again." : "You’ve made lots today. Try again tomorrow." }, 429);
    }
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
    const plan = await generateStripPlan(photos, key, model, signal);
    return json({ plan });
  } catch (error) {
    if (error instanceof GenerationError) return json({ error: error.message }, error.status);
    if (request.signal.aborted) return json({ error: "Generation cancelled." }, 499);
    return json({ error: "Couldn’t finish your Strip. Your photos are still here. Try again." }, 502);
  }
}
