import { useLayoutEffect } from "react";

export const AUTH_LANDING_COLOR = "#304dff";

const STICKER_HEIGHTS = { camera: 512, film: 640, goggles: 512, ball: 768, sunglasses: 512, daisy: 922, cherries: 790, cassette: 512, headphones: 816, cd: 768, ticket: 512, shell: 702, rollerskate: 814, clip: 640 } as const;

/** Complete alpha-cut objects, without arbitrary masks, outlines, or missing pieces. */
function PhotoCutout({ kind, className = "" }: { kind: keyof typeof STICKER_HEIGHTS; className?: string }) {
  return (
    <span className={`landing-cutout landing-cutout-${kind} ${className}`} aria-hidden="true">
      <img src={`/landing/sticker-${kind}.webp`} alt="" width="768" height={STICKER_HEIGHTS[kind]} decoding="async" />
    </span>
  );
}

function CollageBurst({ className }: { className: string }) {
  const shapes: Record<string, string> = {
    "landing-hero-spark": "M50 0 58 31 80 8 71 39 100 38 75 54 95 77 64 69 59 100 47 73 24 96 30 66 0 62 28 48 7 23 39 32Z",
    "landing-photo-spark": "M50 0Q54 45 100 50Q56 55 50 100Q44 55 0 50Q44 44 50 0Z",
    "landing-make-spark": "M48 0 62 33 98 28 72 55 88 93 51 77 18 99 25 59 0 31 36 33Z",
    "landing-share-spark": "M50 94C35 81 3 57 3 30C3 3 37 0 50 24C63 0 97 3 97 30C97 57 66 81 50 94Z",
  };
  return (
    <span className={`landing-doodle ${className}`} aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        <path fill="currentColor" d={shapes[className]} />
      </svg>
    </span>
  );
}

/** Use Safari's document scroller so the actual Strip paints behind its chrome. */
export function AuthLandingStrip() {
  useLayoutEffect(() => {
    // A fixed theme color would conceal the content behind the status bar.
    const theme = document.getElementById("strip-theme-color");
    const themeName = theme?.getAttribute("name");
    if (themeName) theme?.removeAttribute("name");
    return () => {
      if (themeName && !theme?.hasAttribute("name")) theme?.setAttribute("name", themeName);
    };
  }, []);
  return (
    <div className="auth-landing" role="region" aria-label="Meet Strip">
      <div className="landing-strip">
        <header className="landing-block landing-hero">
          <div className="landing-content">
            <h1 id="auth-heading">Want to<br />strip?</h1>
            <p className="landing-intro">Photos, videos, words.<br />All the things that feel like you.</p>
            <div className="landing-hero-stickers" aria-hidden="true">
              <img className="landing-sticker landing-sticker-pool" src="/landing/poolside.webp" width="1080" height="1350" alt="" decoding="async" />
              <img className="landing-sticker landing-sticker-friends" src="/landing/afternoon.webp" width="845" height="1171" alt="" decoding="async" />
              <PhotoCutout kind="goggles" className="landing-hero-goggles" />
              <PhotoCutout kind="camera" className="landing-hero-camera" />
              <PhotoCutout kind="film" className="landing-hero-film" />
              <PhotoCutout kind="ball" className="landing-hero-ball" />
              <CollageBurst className="landing-hero-spark" />
              <span className="landing-tape landing-hero-tape">GOOD STUFF ONLY</span>
              <span className="landing-photo-note">wish you were here</span>
            </div>
          </div>
        </header>

        <section className="landing-block landing-photo-block" aria-label="A moment worth keeping">
          <img className="landing-full-photo" src="/landing/meadow.webp" alt="Two friends walking hand in hand through a sunlit meadow" width="735" height="490" decoding="async" />
          <div className="landing-photo-scraps" aria-hidden="true">
            <PhotoCutout kind="daisy" className="landing-photo-daisy" />
            <PhotoCutout kind="sunglasses" className="landing-photo-sunglasses" />
            <span className="landing-tape landing-photo-tape">KEEP THIS FEELING</span>
            <CollageBurst className="landing-photo-spark" />
          </div>
          <span className="landing-photo-caption">the days that turn into stories.</span>
        </section>

        <section className="landing-block landing-make">
          <div className="landing-content">
            <p className="landing-kicker">01 / MAKE IT YOURS</p>
            <h2>Your photos.<br />Your words.<br />Your world.</h2>
            <p className="landing-description">Stack photos and videos. Add a thought, a color, a sticker. Keep going.</p>
            <div className="landing-make-collage" aria-hidden="true">
              <img className="landing-sticker landing-make-scrap-sea" src="/landing/photo-sea.webp" alt="" width="768" height="576" loading="lazy" decoding="async" />
              <img className="landing-sticker landing-make-scrap-booth" src="/landing/photo-booth.webp" alt="" width="768" height="1152" loading="lazy" decoding="async" />
              <PhotoCutout kind="cassette" className="landing-make-cassette" />
              <PhotoCutout kind="rollerskate" className="landing-make-skate" />
              <PhotoCutout kind="headphones" className="landing-make-headphones" />
              <PhotoCutout kind="cd" className="landing-make-cd" />
              <CollageBurst className="landing-make-spark" />
              <span className="landing-tape landing-make-tape">NO RULES. JUST YOU.</span>
              <span className="landing-sticker-label">a little more you</span>
            </div>
          </div>
        </section>

        <section className="landing-block landing-share">
          <div className="landing-content">
            <p className="landing-kicker">02 / PASS IT AROUND</p>
            <h2>For your<br />people.</h2>
            <p className="landing-description">One Strip. One link.<br />Send it to the group chat.</p>
            <div className="landing-share-photo">
              <img src="/landing/photo-picnic.webp" alt="A sunny picnic with a book, fruit and lemonade" width="768" height="1024" loading="lazy" decoding="async" />
              <PhotoCutout kind="ticket" className="landing-share-ticket" />
              <PhotoCutout kind="cherries" className="landing-share-cherries" />
              <PhotoCutout kind="shell" className="landing-share-shell" />
              <PhotoCutout kind="clip" className="landing-share-clip" />
              <CollageBurst className="landing-share-spark" />
              <span className="landing-tape landing-share-tape" aria-hidden="true">FOR THE GROUP CHAT</span>
              <span className="landing-link-sticker" aria-hidden="true">yourname.striiip.com ↗</span>
            </div>
            <p className="landing-signoff">This is a Strip.<br />Now make yours.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
