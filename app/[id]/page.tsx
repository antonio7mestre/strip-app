import type { Metadata } from "next";
import { headers } from "next/headers";
import { usernameFromHostname } from "@/app/lib/username";
import { createPublicStripMetadata } from "@/app/server/public-strip-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  context: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await context.params;
  const requestHeaders = await headers();
  const requestedUsername = usernameFromHostname(requestHeaders.get("host") ?? "");
  return createPublicStripMetadata(id, requestedUsername);
}

export { default } from "../page";
