import {
  consumeRateLimit,
  isLocalAuthRequest,
  isSameOrigin,
  normalizePhone,
  startPhoneVerification,
} from "@/app/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request." }, { status: 403 });
  }
  let input: { phone?: unknown };
  try {
    input = (await request.json()) as { phone?: unknown };
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const phone = normalizePhone(input.phone);
  if (!phone) {
    return Response.json(
      { error: "Enter a valid phone number." },
      { status: 400 },
    );
  }

  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const [phoneAllowed, ipAllowed] = await Promise.all([
    consumeRateLimit(`start:phone:${phone}`, 5, 10 * 60 * 1000),
    consumeRateLimit(`start:ip:${ip}`, 12, 10 * 60 * 1000),
  ]);
  if (!phoneAllowed || !ipAllowed) {
    return Response.json(
      { error: "Too many codes requested. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const result = await startPhoneVerification(phone);
  if (!result.configured && isLocalAuthRequest(request)) {
    return Response.json({ ok: true, developmentCode: "000000" });
  }
  if (!result.configured) {
    return Response.json(
      { error: "Text sign-in is not configured yet." },
      { status: 503 },
    );
  }
  if (!result.ok || result.status !== "pending") {
    return Response.json(
      { error: "We couldn’t send that code. Check the number and try again." },
      { status: 502 },
    );
  }
  return Response.json({ ok: true });
}
