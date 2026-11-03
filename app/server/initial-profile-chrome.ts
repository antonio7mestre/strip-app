import { getAuthUser } from "@/app/server/auth";
import { usernameFromHostname } from "@/app/lib/username";
import { PROFILE_PATHS } from "@/app/lib/profile-reload";
import type { InitialProfileChrome } from "@/app/components/InitialProfileChrome";

/** Include the existing toolbar in the first HTML paint on both sides of the
 * account-domain handoff. This is presentation only, never authorization. */
export async function initialProfileChrome(headers: Headers): Promise<InitialProfileChrome | null> {
  const path = headers.get("x-strip-pathname");
  if (!path || !PROFILE_PATHS.includes(path)) return null;
  try {
    const user = await getAuthUser(new Request("https://striiip.com/", { headers }));
    const hostUsername = usernameFromHostname(headers.get("host") ?? "");
    return { path, showTools: Boolean(user?.username && (!hostUsername || hostUsername === user.username)),
      ...(!user && !hostUsername && path === "/" ? { showLanding: true } : {}) };
  } catch { return { path, showTools: false }; }
}
