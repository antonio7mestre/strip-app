import { getAuthUserWithSessionRefresh } from "@/app/server/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { user, cookies } = await getAuthUserWithSessionRefresh(request);
  const headers = new Headers({ "Cache-Control": "no-store" });
  cookies.forEach((cookie) => headers.append("Set-Cookie", cookie));
  return Response.json(
    {
      user: user
        ? {
            id: user.id,
            phoneLabel: user.phoneLabel,
            username: user.username,
          }
        : null,
    },
    { headers },
  );
}
