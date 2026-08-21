import {
  checkPhoneVerification,
  consumeRateLimit,
  createSession,
  isLocalAuthRequest,
  isSameOrigin,
  normalizePhone,
  upsertVerifiedUser,
} from "@/app/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request." }, { status: 403 });
  }
  let input: { phone?: unknown; code?: unknown; legacyOwnerId?: unknown };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const phone = normalizePhone(input.phone);
  const code = String(input.code ?? "").replace(/\D/g, "");
  if (!phone || !/^\d{4,10}$/.test(code)) {
    return Response.json({ error: "Enter the code we sent." }, { status: 400 });
  }

  const allowed = await consumeRateLimit(
    `verify:${phone}`,
    8,
    10 * 60 * 1000,
  );
  if (!allowed) {
    return Response.json(
      { error: "Too many attempts. Request a new code in a few minutes." },
      { status: 429 },
    );
  }

  const result = await checkPhoneVerification(phone, code);
  const localApproval =
    !result.configured && isLocalAuthRequest(request) && code === "000000";
  if (!localApproval && (!result.configured || !result.ok || result.status !== "approved")) {
    return Response.json(
      { error: "That code isn’t right. Try again." },
      { status: result.configured ? 400 : 503 },
    );
  }

  const userId = await upsertVerifiedUser(phone, input.legacyOwnerId);
  const cookie = await createSession(userId, request);
  return Response.json(
    { user: { id: userId, phoneLabel: `••• ••• ${phone.slice(-4)}` } },
    { headers: { "Set-Cookie": cookie, "Cache-Control": "no-store" } },
  );
}
