import { getAuthUser } from "@/app/server/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthUser(request);
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
    { headers: { "Cache-Control": "no-store" } },
  );
}
