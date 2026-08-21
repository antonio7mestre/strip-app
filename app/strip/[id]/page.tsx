import type { Metadata } from "next";
import { createPublicStripMetadata } from "@/app/server/public-strip-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  context: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await context.params;
  return createPublicStripMetadata(id);
}

export { default } from "../../page";
