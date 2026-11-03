"use client";

import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { PUBLIC_DOMAIN, validateUsername } from "@/app/lib/username";
import { PUBLISHED_STRIP_FOOTER_BACKGROUND } from "@/app/lib/strip-ending";
import { installPublishedFooterReveal } from "@/app/lib/published-footer";
import { STICKER_PACK } from "@/app/lib/sticker-pack";
import { footerStickerLayout, footerStickerLoopSeconds, selectFooterStickers } from "@/app/lib/footer-stickers";

/** An in-flow footer uncovered by the content, shared by preview and publication. */
export function StripEndingSheet({ username, stickerSeed, preview = false, children }: {
  username?: string | null;
  stickerSeed?: string;
  preview?: boolean;
  children: ReactNode;
}) {
  const sheet = useRef<HTMLElement>(null);
  const stickers = useMemo(() => selectFooterStickers(STICKER_PACK, stickerSeed ?? username ?? "strip"),
    [stickerSeed, username]);
  useLayoutEffect(() => {
    if (sheet.current) return installPublishedFooterReveal(sheet.current);
  }, [preview]);
  const author = validateUsername(username);
  const profileHref = !preview && author.ok
    ? `https://${author.username}.${PUBLIC_DOMAIN}/`
    : null;
  return (
    <footer
      ref={sheet}
      className="strip-block strip-ending-card published-bottom-sheet strip-end-sheet"
      aria-label={preview ? "Strip actions preview" : "Strip actions"}
      style={{
        "--ending-background": PUBLISHED_STRIP_FOOTER_BACKGROUND,
        "--ending-foreground": "#000000",
        "--ending-button": "#000000",
        "--ending-button-foreground": "#FFFFFF",
      } as CSSProperties}
    >
      <div className="strip-ending-reveal-track">
        <div className="strip-ending-card-inner">
          <h2 className="published-bottom-sheet-title">
            {username ? <>A Strip by {profileHref
              ? <a href={profileHref} aria-label={`View @${username}’s profile`}>@{username}</a>
              : <span>@{username}</span>}</> : "Made with Strip"}
          </h2>
          {children}
          <div className="strip-footer-stickers" role="region" aria-label="Sticker gallery"
            style={{ "--footer-sticker-loop-duration": `${footerStickerLoopSeconds(stickers)}s` } as CSSProperties}>
            <div className="strip-footer-stickers-track">
              {[false, true].map(duplicate => <div className="strip-footer-stickers-group" key={String(duplicate)}
                aria-hidden={duplicate || undefined}>
                {stickers.map(sticker => {
                  const layout = footerStickerLayout(sticker);
                  return <span className="strip-footer-sticker" key={sticker.id} style={{ width: layout.frameWidth }}>
                    {/* Repeated thumbnails share requests; reserve rotated bounds before decoding. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={sticker.thumbnailSrc} alt={duplicate ? "" : sticker.name}
                      width={layout.width} height={layout.height}
                      style={{ width: layout.width, height: layout.height, transform: `rotate(${layout.rotation}deg)` }}
                      loading="lazy" decoding="async" fetchPriority="low" draggable={false} />
                  </span>;
                })}
              </div>)}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
