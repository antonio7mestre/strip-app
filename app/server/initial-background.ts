import { env } from "cloudflare:workers";
import { DEFAULT_PROFILE } from "@/app/lib/profile";
import { usernameFromHostname } from "@/app/lib/username";
import { getAuthUser } from "@/app/server/auth";

const PROFILE_PATHS = ["/", "/drafts", "/history", "/settings"];
const color = (value: unknown) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value)
  ? value : DEFAULT_PROFILE.background;

/** Only the public background color reaches HTML, never session or profile data.
 * Await it before emitting the document so cold links and reloads paint alike. */
export async function initialPageBackground(headers: Headers): Promise<string | null> {
  const path = headers.get("x-strip-pathname");
  if (!path) return null;
  if (path === "/start") return "#304dff";
  const username = usernameFromHostname(headers.get("host") ?? "");
  const profilePage = PROFILE_PATHS.includes(path);
  try {
    // Public Strip entries reveal their actual media and sampled edge together.
    // The author's profile color is not an intermediate loading screen.
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
