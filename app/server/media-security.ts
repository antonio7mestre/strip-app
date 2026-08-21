export type StoredMediaType = "image" | "video";

const ACTIVE_IMAGE_MIME_MARKERS = ["svg", "xml"];

export function isAllowedStoredMediaContentType(
  value: string | undefined,
  expectedType: StoredMediaType,
) {
  if (!value) return false;
  const contentType = value.split(";", 1)[0].trim().toLowerCase();
  if (!contentType.startsWith(`${expectedType}/`)) return false;
  return (
    expectedType !== "image" ||
    !ACTIVE_IMAGE_MIME_MARKERS.some((marker) => contentType.includes(marker))
  );
}

export function applyPublicMediaSecurityHeaders(headers: Headers) {
  headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
  headers.set("X-Content-Type-Options", "nosniff");
}
