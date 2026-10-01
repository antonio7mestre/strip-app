import { PUBLIC_DOMAIN, usernameFromHostname, validateUsername } from "./username";

export type AppRoute =
  | { kind: "library" }
  | { kind: "profile"; username: string }
  | { kind: "drafts" }
  | { kind: "history" }
  | { kind: "settings" }
  | { kind: "edit"; id: string }
  | { kind: "share"; id: string }
  | { kind: "published"; id: string; username?: string };

type AppLocation = { hostname: string; origin: string; pathname: string; search?: string; hash?: string };
type StripLink = { id: string; username?: string | null };

export function routeFromLocation(pathname: string, hostname: string): AppRoute {
  const edit = /^\/edit\/([a-zA-Z0-9_-]{8,128})\/?$/.exec(pathname);
  if (edit) return { kind: "edit", id: edit[1] };
  const share = /^\/share\/([a-zA-Z0-9_-]{8,128})\/?$/.exec(pathname);
  if (share) return { kind: "share", id: share[1] };
  const published = /^\/strip\/([a-zA-Z0-9_-]{8,128})\/?$/.exec(pathname);
  if (published) return { kind: "published", id: published[1] };
  if (/^\/drafts\/?$/.test(pathname)) return { kind: "drafts" };
  if (/^\/history\/?$/.test(pathname)) return { kind: "history" };
  if (/^\/settings\/?$/.test(pathname)) return { kind: "settings" };
  const username = usernameFromHostname(hostname);
  if (username && pathname === "/") return { kind: "profile", username };
  const vanity = /^\/([a-zA-Z0-9_-]{8,128})\/?$/.exec(pathname);
  if (username && vanity) return { kind: "published", id: vanity[1], username };
  return { kind: "library" };
}

export function isProductionAppHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === PUBLIC_DOMAIN || host === `www.${PUBLIC_DOMAIN}` || usernameFromHostname(host) !== null;
}

export function baseAppOrigin(location: Pick<AppLocation, "hostname" | "origin">) {
  return isProductionAppHost(location.hostname) ? `https://${PUBLIC_DOMAIN}` : location.origin;
}

export function accountAppOrigin(location: Pick<AppLocation, "hostname" | "origin">, username?: string | null) {
  if (!isProductionAppHost(location.hostname)) return location.origin;
  const valid = validateUsername(username);
  return valid.ok ? `https://${valid.username}.${PUBLIC_DOMAIN}` : baseAppOrigin(location);
}

export function publishedStripUrl(location: Pick<AppLocation, "hostname" | "origin">, strip: StripLink) {
  const id = encodeURIComponent(strip.id);
  const valid = validateUsername(strip.username);
  if (!isProductionAppHost(location.hostname)) return `${location.origin}/strip/${id}`;
  return valid.ok
    ? `${accountAppOrigin(location, valid.username)}/${id}`
    : `${baseAppOrigin(location)}/strip/${id}`;
}

// A public profile/reader is never redirected to the viewer's workspace.
// Private tools always belong to the verified account, not the host's name.
// Unknown identities go through sign-in on the base site, retaining deep links.
export function workspaceRedirect(location: AppLocation, username?: string | null) {
  if (!isProductionAppHost(location.hostname)) return null;
  const route = routeFromLocation(location.pathname, location.hostname);
  if (route.kind === "profile" || route.kind === "published") return null;
  const targetOrigin = accountAppOrigin(location, username);
  return targetOrigin === location.origin ? null
    : `${targetOrigin}${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
}
