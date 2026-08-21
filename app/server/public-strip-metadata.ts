import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { PUBLIC_DOMAIN } from "@/app/lib/username";

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

type PublicStripMetadataRow = {
  id: string;
  title: string;
  cover_alt: string | null;
  published_at: number;
  username: string | null;
};

const missingStripMetadata: Metadata = {
  title: { absolute: "Strip" },
  description: "A personal, visual newsletter made for your friends.",
  robots: { index: false, follow: false },
};

export async function createPublicStripMetadata(
  id: string,
  requestedUsername?: string | null,
): Promise<Metadata> {
  if (!ID_PATTERN.test(id)) return missingStripMetadata;

  const row = await env.DB.prepare(
    `SELECT s.id, s.title, s.cover_alt, s.published_at, u.username
     FROM strips s
     LEFT JOIN users u ON u.id = s.owner_id
     WHERE s.id = ?`,
  )
    .bind(id)
    .first<PublicStripMetadataRow>();

  if (
    !row ||
    (requestedUsername && row.username?.toLowerCase() !== requestedUsername)
  ) {
    return missingStripMetadata;
  }

  const title = row.title.trim() || "Untitled";
  const username = row.username?.toLowerCase() ?? null;
  const canonicalOrigin = username
    ? `https://${username}.${PUBLIC_DOMAIN}`
    : `https://${PUBLIC_DOMAIN}`;
  const canonicalUrl = username
    ? `${canonicalOrigin}/${encodeURIComponent(row.id)}`
    : `${canonicalOrigin}/strip/${encodeURIComponent(row.id)}`;
  const coverUrl = `${canonicalOrigin}/api/strips/${encodeURIComponent(row.id)}/cover`;
  const coverAlt = row.cover_alt?.trim() || `${title} cover`;
  const description = username ? `A Strip by @${username}.` : "A Strip.";

  return {
    metadataBase: new URL(canonicalOrigin),
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: "article",
      siteName: "STRIP",
      title,
      description,
      url: canonicalUrl,
      publishedTime: new Date(row.published_at).toISOString(),
      images: [{ url: coverUrl, alt: coverAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: coverUrl, alt: coverAlt }],
    },
  };
}
