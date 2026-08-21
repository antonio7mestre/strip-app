import {
  clearSessionCookies,
  deleteCurrentSession,
  isSameOrigin,
} from "@/app/server/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Invalid request." }, { status: 403 });
  }
  await deleteCurrentSession(request);
  const headers = new Headers({ "Cache-Control": "no-store" });
  clearSessionCookies(request).forEach((cookie) =>
    headers.append("Set-Cookie", cookie),
  );
  return new Response(null, {
    status: 204,
    headers,
  });
}
