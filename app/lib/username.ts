export const PUBLIC_DOMAIN = "striiip.com";
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;

const USERNAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "cdn",
  "dev",
  "draft",
  "drafts",
  "edit",
  "editor",
  "email",
  "ftp",
  "help",
  "home",
  "imap",
  "localhost",
  "login",
  "mail",
  "media",
  "ns1",
  "ns2",
  "pop",
  "preview",
  "root",
  "share",
  "signin",
  "signup",
  "smtp",
  "staging",
  "static",
  "status",
  "strip",
  "strips",
  "support",
  "system",
  "test",
  "webmail",
  "workers",
  "www",
]);

export type UsernameValidation =
  | { ok: true; username: string }
  | { ok: false; reason: "invalid" | "reserved"; error: string };

export function normalizeUsername(input: unknown) {
  return String(input ?? "").normalize("NFKC").trim().toLowerCase();
}

export function validateUsername(input: unknown): UsernameValidation {
  const username = normalizeUsername(input);
  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username)
  ) {
    return {
      ok: false,
      reason: "invalid",
      error: "Use 3–24 letters, numbers, or hyphens.",
    };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return {
      ok: false,
      reason: "reserved",
      error: "That username isn’t available.",
    };
  }
  return { ok: true, username };
}

export function usernameFromHostname(hostname: string) {
  const normalizedHost = hostname.toLowerCase().split(":")[0];
  const suffix = `.${PUBLIC_DOMAIN}`;
  if (!normalizedHost.endsWith(suffix)) return null;
  const candidate = normalizedHost.slice(0, -suffix.length);
  const validation = validateUsername(candidate);
  return validation.ok ? validation.username : null;
}
