import { env } from "cloudflare:workers";
import { imageSize } from "image-size";
import type { Metadata } from "next";
import { PUBLIC_DOMAIN } from "@/app/lib/username";

const ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const SOCIAL_IMAGE_MAX_WIDTH = 1200;
const SOCIAL_IMAGE_MAX_HEIGHT = 1600;
const IMAGE_HEADER_BYTES = 256 * 1024;

type PublicStripMetadataRow = {
  id: string;
  title: string;
  cover_kind: "image" | "color";
  cover_color: string | null;
  cover_shape: "portrait" | "square" | "landscape" | null;
  cover_object_key: string | null;
  cover_alt: string | null;
  published_at: number;
  username: string | null;
};

type SocialImageDetails = {
  width?: number;
  height?: number;
  type: "image/jpeg" | "image/png";
};

const missingStripMetadata: Metadata = {
  title: { absolute: "Strip" },
  description: "A personal, visual newsletter made for your friends.",
  robots: { index: false, follow: false },
};

function colorCoverDimensions(shape: PublicStripMetadataRow["cover_shape"]) {
  if (shape === "portrait") return { width: 960, height: 1200 };
  if (shape === "landscape") return { width: 1200, height: 800 };
  return { width: 1200, height: 1200 };
}

function socialImageType(contentType?: string) {
  return contentType?.toLowerCase() === "image/png"
    ? ("image/png" as const)
    : ("image/jpeg" as const);
}

function fitInsideSocialImage(width: number, height: number) {
  const scale = Math.min(
    1,
    SOCIAL_IMAGE_MAX_WIDTH / width,
    SOCIAL_IMAGE_MAX_HEIGHT / height,
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

async function getSocialImageDetails(
  row: PublicStripMetadataRow,
): Promise<SocialImageDetails> {
  if (row.cover_kind === "color") {
    return {
      ...colorCoverDimensions(row.cover_shape),
      type: "image/png",
    };
  }

  if (!row.cover_object_key) return { type: "image/jpeg" };
  let type: SocialImageDetails["type"] = "image/jpeg";
  try {
    const object = await env.STRIP_MEDIA.get(row.cover_object_key, {
      range: { offset: 0, length: IMAGE_HEADER_BYTES },
    });
    if (!object) return { type: "image/jpeg" };
    type = socialImageType(object.httpMetadata?.contentType);
    const dimensions = imageSize(new Uint8Array(await object.arrayBuffer()));
    let { width, height } = dimensions;
    if (dimensions.orientation && dimensions.orientation >= 5) {
      [width, height] = [height, width];
    }
    return { ...fitInsideSocialImage(width, height), type };
  } catch {
    return { type };
  }
}

export async function createPublicStripMetadata(
  id: string,
  requestedUsername?: string | null,
): Promise<Metadata> {
  if (!ID_PATTERN.test(id)) return missingStripMetadata;

  const row = await env.DB.prepare(
    `SELECT s.id, s.title, s.cover_kind, s.cover_color, s.cover_shape,
       s.cover_object_key, s.cover_alt, s.published_at, u.username
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
  const coverUrl = `${canonicalOrigin}/api/strips/${encodeURIComponent(row.id)}/social-cover`;
  const coverAlt = row.cover_alt?.trim() || `${title} cover`;
  const description = username ? `A Strip by @${username}.` : "A Strip.";
  const socialImage = await getSocialImageDetails(row);
  const isPortrait =
    socialImage.width !== undefined &&
    socialImage.height !== undefined &&
    socialImage.height > socialImage.width;
  const openGraphImage = {
    url: coverUrl,
    alt: coverAlt,
    type: socialImage.type,
    ...(socialImage.width && socialImage.height
      ? { width: socialImage.width, height: socialImage.height }
      : {}),
  };
  const twitterImage = {
    url: coverUrl,
    alt: coverAlt,
    ...(socialImage.width && socialImage.height
      ? { width: socialImage.width, height: socialImage.height }
      : {}),
  };

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
      images: [openGraphImage],
    },
    twitter: {
      card: isPortrait ? "summary" : "summary_large_image",
      title,
      description,
      images: [twitterImage],
    },
  };
}
