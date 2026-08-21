import { env } from "cloudflare:workers";
import { PUBLIC_DOMAIN } from "@/app/lib/username";

export { normalizeUsername, validateUsername } from "@/app/lib/username";
export type { UsernameValidation } from "@/app/lib/username";

export const SESSION_COOKIE = "strip_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const MAX_SESSION_COOKIE_CANDIDATES = 4;
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

type AuthSession = {
  user: AuthUser;
  token: string;
  expiresAt: number;
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

function cookieValuesFromRequest(request: Request, name: string) {
  const values: string[] = [];
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      values.push(decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      // A malformed cookie must not prevent a different valid session cookie
      // from being used during the host-only to shared-domain migration.
    }
  }
  return Array.from(new Set(values))
    .filter((value) => value.length >= 32 && value.length <= 256)
    .slice(-MAX_SESSION_COOKIE_CANDIDATES)
    .reverse();
}

function sharedCookieDomain(request: Request) {
  const hostname = new URL(request.url).hostname
    .toLowerCase()
    .replace(/\.$/, "");
  if (hostname === PUBLIC_DOMAIN) return `.${PUBLIC_DOMAIN}`;

  const labels = hostname.split(".");
  return labels.length === 3 && labels.slice(1).join(".") === PUBLIC_DOMAIN
    ? `.${PUBLIC_DOMAIN}`
    : null;
}

function serializeSessionCookie(
  token: string,
  request: Request,
  maxAgeSeconds: number,
  domain: string | null,
) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const domainAttribute = domain ? `; Domain=${domain}` : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(
    token,
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(
    0,
    Math.floor(maxAgeSeconds),
  )}${domainAttribute}${secure}`;
}

function refreshedSessionCookies(request: Request, session: AuthSession) {
  const remainingSeconds = Math.max(
    1,
    Math.ceil((session.expiresAt - Date.now()) / 1000),
  );
  return [
    serializeSessionCookie(
      session.token,
      request,
      remainingSeconds,
      sharedCookieDomain(request),
    ),
  ];
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

async function readAuthSession(request: Request): Promise<AuthSession | null> {
  const tokens = cookieValuesFromRequest(request, SESSION_COOKIE);
  if (tokens.length === 0) return null;
  const now = Date.now();

  for (const token of tokens) {
    const tokenHash = await sha256(token);
    const row = await env.DB.prepare(
      `SELECT s.user_id, s.last_seen_at, s.expires_at, u.phone_e164, u.username
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
      .bind(tokenHash, now)
      .first<{
        user_id: string;
        last_seen_at: number;
        expires_at: number;
        phone_e164: string;
        username: string | null;
      }>();
    if (!row) continue;

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
      user: {
        id: row.user_id,
        phoneE164: row.phone_e164,
        phoneLabel: phoneLabel(row.phone_e164),
        username: row.username,
      },
      token,
      expiresAt: row.expires_at,
    };
  }

  return null;
}

export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  return (await readAuthSession(request))?.user ?? null;
}

export async function getAuthUserWithSessionRefresh(request: Request) {
  const session = await readAuthSession(request);
  return {
    user: session?.user ?? null,
    cookies: session ? refreshedSessionCookies(request, session) : [],
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
  return serializeSessionCookie(
    token,
    request,
    SESSION_TTL_MS / 1000,
    sharedCookieDomain(request),
  );
}

export function clearSessionCookies(request: Request) {
  const sharedDomain = sharedCookieDomain(request);
  return Array.from(
    new Set([
      serializeSessionCookie("", request, 0, null),
      ...(sharedDomain
        ? [serializeSessionCookie("", request, 0, sharedDomain)]
        : []),
    ]),
  );
}

export async function deleteCurrentSession(request: Request) {
  const tokens = cookieValuesFromRequest(request, SESSION_COOKIE);
  if (tokens.length === 0) return;
  await env.DB.batch(
    await Promise.all(
      tokens.map(async (token) =>
        env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(
          await sha256(token),
        ),
      ),
    ),
  );
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
