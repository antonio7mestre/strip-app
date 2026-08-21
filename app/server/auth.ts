import { env } from "cloudflare:workers";

export { normalizeUsername, validateUsername } from "@/app/lib/username";
export type { UsernameValidation } from "@/app/lib/username";

export const SESSION_COOKIE = "strip_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const OWNER_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

export type AuthUser = {
  id: string;
  phoneE164: string;
  phoneLabel: string;
  username: string | null;
};

type AuthEnvironment = {
  TWILIO_API_KEY?: string;
  TWILIO_API_SECRET?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
};

function authEnvironment() {
  return env as unknown as AuthEnvironment;
}

function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return btoa(String.fromCharCode(...value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function cookiesFromRequest(request: Request) {
  const values = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) values.set(key, decodeURIComponent(value));
  }
  return values;
}

export function phoneLabel(phoneE164: string) {
  const visible = phoneE164.slice(-4);
  return `••• ••• ${visible}`;
}

export function normalizePhone(input: unknown) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const normalized = raw.startsWith("+")
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : digits.length === 11 && digits.startsWith("1")
        ? `+${digits}`
        : null;
  return normalized && /^\+[1-9]\d{7,14}$/.test(normalized)
    ? normalized
    : null;
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const token = cookiesFromRequest(request).get(SESSION_COOKIE);
  if (!token || token.length < 32) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT s.user_id, s.last_seen_at, u.phone_e164, u.username
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(tokenHash, now)
    .first<{
      user_id: string;
      last_seen_at: number;
      phone_e164: string;
      username: string | null;
    }>();
  if (!row) return null;

  if (now - row.last_seen_at > SESSION_TOUCH_INTERVAL_MS) {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?",
      ).bind(now, tokenHash),
      env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(
        now,
        row.user_id,
      ),
    ]);
  }
  return {
    id: row.user_id,
    phoneE164: row.phone_e164,
    phoneLabel: phoneLabel(row.phone_e164),
    username: row.username,
  };
}

export async function requireAuthUser(request: Request) {
  const user = await getAuthUser(request);
  return user
    ? { user, response: null }
    : {
        user: null,
        response: Response.json(
          { error: "Sign in to continue." },
          { status: 401 },
        ),
      };
}

export async function createSession(userId: string, request: Request) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO auth_sessions (
        token_hash, user_id, created_at, last_seen_at, expires_at
      ) VALUES (?, ?, ?, ?, ?)`,
    ).bind(tokenHash, userId, now, now, now + SESSION_TTL_MS),
    env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now),
  ]);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(
    SESSION_TTL_MS / 1000,
  )}${secure}`;
}

export function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function deleteCurrentSession(request: Request) {
  const token = cookiesFromRequest(request).get(SESSION_COOKIE);
  if (!token) return;
  await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
    .bind(await sha256(token))
    .run();
}

export async function consumeRateLimit(
  key: string,
  maximum: number,
  windowMs: number,
) {
  const rateKey = await sha256(key);
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT window_started_at, count FROM auth_rate_limits WHERE rate_key = ?",
  )
    .bind(rateKey)
    .first<{ window_started_at: number; count: number }>();
  if (!row || now - row.window_started_at >= windowMs) {
    await env.DB.prepare(
      `INSERT INTO auth_rate_limits (rate_key, window_started_at, count)
       VALUES (?, ?, 1)
       ON CONFLICT(rate_key) DO UPDATE SET
         window_started_at = excluded.window_started_at,
         count = 1`,
    )
      .bind(rateKey, now)
      .run();
    return true;
  }
  if (row.count >= maximum) return false;
  await env.DB.prepare(
    "UPDATE auth_rate_limits SET count = count + 1 WHERE rate_key = ?",
  )
    .bind(rateKey)
    .run();
  return true;
}

function twilioCredentials() {
  const values = authEnvironment();
  const username = values.TWILIO_API_KEY || values.TWILIO_ACCOUNT_SID;
  const password = values.TWILIO_API_SECRET || values.TWILIO_AUTH_TOKEN;
  const serviceSid = values.TWILIO_VERIFY_SERVICE_SID;
  return username && password && serviceSid
    ? { username, password, serviceSid }
    : null;
}

export function isLocalAuthRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

async function twilioRequest(
  path: "Verifications" | "VerificationCheck",
  values: Record<string, string>,
) {
  const credentials = twilioCredentials();
  if (!credentials) return { configured: false, ok: false, status: "" };
  const body = new URLSearchParams(values);
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(
      credentials.serviceSid,
    )}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(
          `${credentials.username}:${credentials.password}`,
        )}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  let data: { status?: string } = {};
  try {
    data = (await response.json()) as { status?: string };
  } catch {
    data = {};
  }
  return {
    configured: true,
    ok: response.ok,
    status: data.status ?? "",
  };
}

export async function startPhoneVerification(phoneE164: string) {
  return twilioRequest("Verifications", { To: phoneE164, Channel: "sms" });
}

export async function checkPhoneVerification(phoneE164: string, code: string) {
  return twilioRequest("VerificationCheck", { To: phoneE164, Code: code });
}

export async function upsertVerifiedUser(
  phoneE164: string,
  legacyOwnerId: unknown,
) {
  const now = Date.now();
  const existing = await env.DB.prepare(
    "SELECT id, username FROM users WHERE phone_e164 = ?",
  )
    .bind(phoneE164)
    .first<{ id: string; username: string | null }>();
  if (existing) {
    await env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?")
      .bind(now, existing.id)
      .run();
    return existing;
  }

  const requestedLegacyId = String(legacyOwnerId ?? "");
  let id = `usr_${randomToken(18)}`;
  if (OWNER_PATTERN.test(requestedLegacyId)) {
    const claimed = await env.DB.prepare("SELECT id FROM users WHERE id = ?")
      .bind(requestedLegacyId)
      .first<{ id: string }>();
    if (!claimed) id = requestedLegacyId;
  }
  await env.DB.prepare(
    `INSERT INTO users (id, phone_e164, created_at, last_seen_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(id, phoneE164, now, now)
    .run();
  return { id, username: null };
}
