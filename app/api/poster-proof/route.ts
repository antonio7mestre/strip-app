// Local-only artifact workflow. Never included in the clean production release.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Local preview only", { status: 404 });
  const query = new URL(request.url).searchParams;
  const path = query.get("path") || "";
  if (!/^\/api\/(profiles\/antonio|strips\/\d+-[a-z0-9]+(?:\/(cover|media\/[a-z0-9-]+))?)$/.test(path)
    && !/^\/(sticker-pack|stickers|home-stickers)\/[a-zA-Z0-9/_.-]+$/.test(path)) {
    return new Response("Not a public poster source", { status: 400 });
  }
  const range = request.headers.get("Range");
  const upstream = await fetch(`https://striiip.com${path}`, { cache: "no-store", headers: range ? { Range: range } : undefined });
  const headers = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  for (const name of ["Accept-Ranges", "Content-Range", "Content-Length"]) {
    const value = upstream.headers.get(name); if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
