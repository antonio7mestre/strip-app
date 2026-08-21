import {
  clearSessionCookie,
  deleteCurrentSession,
  isSameOrigin,
} from "@/app/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request." }, { status: 403 });
  }
  await deleteCurrentSession(request);
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": clearSessionCookie(request),
      "Cache-Control": "no-store",
    },
  });
}
