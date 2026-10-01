import { NextResponse, type NextRequest } from "next/server";

// Supply the actual route to the server layout before it renders its canvas.
// Always overwrite the header, rather than trusting a caller-supplied path.
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-strip-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/", "/drafts", "/history", "/settings", "/strip/:id", "/:id"],
};
