import { env } from "cloudflare:workers";
import { DEFAULT_PROFILE } from "@/app/lib/profile";
import { usernameFromHostname } from "@/app/lib/username";
import { getAuthUser } from "@/app/server/auth";

const PROFILE_PATHS = ["/", "/drafts", "/history", "/settings"];
const ID = /^[a-zA-Z0-9_-]{8,128}$/;
const color = (value: unknown) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value)
  ? value : DEFAULT_PROFILE.background;

/** Only the public background color reaches HTML, never session or profile data.
 * Await it before emitting the document so cold links and reloads paint alike. */
export async function initialPageBackground(headers: Headers): Promise<string | null> {
  const path = headers.get("x-strip-pathname");
  if (!path) return null;
  const username = usernameFromHostname(headers.get("host") ?? "");
  const pieces = path.split("/").filter(Boolean);
  const profilePage = PROFILE_PATHS.includes(path);
  const id = pieces[0] === "strip" && pieces.length === 2 ? pieces[1]
    : username && !profilePage && pieces.length === 1 ? pieces[0] : null;
  try {
    if (id && ID.test(id)) {
      const row = await env.DB.prepare(
        `SELECT p.background, u.username FROM strips s
         LEFT JOIN profiles p ON p.user_id = s.owner_id
         LEFT JOIN users u ON u.id = s.owner_id WHERE s.id = ?`,
      ).bind(id).first<{ background: string | null; username: string | null }>();
      if (!row || (pieces.length === 1 && row.username !== username)) return null;
      return color(row.background);
    }
    if (!profilePage) return null;
    if (path === "/" && username) {
      const row = await env.DB.prepare(
        `SELECT p.background FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id WHERE u.username = ?`,
      ).bind(username).first<{ background: string | null }>();
      return row ? color(row.background) : null;
    }
    const user = await getAuthUser(new Request("https://striiip.com/", { headers }));
    if (!user || !user.username) return "#304dff";
    const row = await env.DB.prepare("SELECT background FROM profiles WHERE user_id = ?")
      .bind(user.id).first<{ background: string | null }>();
    return color(row?.background);
  } catch {
    // A presentation lookup must never prevent the existing app from loading.
    return null;
  }
}
