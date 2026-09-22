import { useLayoutEffect } from "react";

export const AUTH_LANDING_COLOR = "#304dff";

const STICKER_HEIGHTS = { camera: 512, flipphone: 1152, ball: 768, "green-glasses": 512, daisy: 922, cherries: 790, cassette: 512, headphones: 816, cd: 768, "ticket-admit": 511, shell: 702, rollerskate: 814, clip: 640 } as const;

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
    "landing-hero-squiggle": "M17 8C-9 30 31 53 54 31C72 14 91 30 77 47C63 64 26 52 27 74C28 88 51 98 73 87L66 71C53 77 44 74 45 70C46 65 71 73 88 60C117 37 92 0 65 9C47 15 44 32 31 28C24 25 24 21 29 17Z",
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
              <img className="landing-sticker landing-sticker-sky" src="/landing/cosmos-sky.webp" width="900" height="1200" alt="" decoding="async" />
              <PhotoCutout kind="green-glasses" className="landing-hero-glasses" />
              <PhotoCutout kind="camera" className="landing-hero-camera" />
              <PhotoCutout kind="flipphone" className="landing-hero-phone" />
              <span className="landing-doodle landing-hero-ring" aria-hidden="true">
                <svg viewBox="0 0 100 100" focusable="false">
                  <path d="M49 85Q49 49 85 49M23 85Q23 23 85 23" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
                </svg>
              </span>
              <PhotoCutout kind="ball" className="landing-hero-ball" />
              <CollageBurst className="landing-hero-spark" />
              <CollageBurst className="landing-hero-squiggle" />
            </div>
          </div>
        </header>

        <section className="landing-block landing-photo-block" aria-label="A moment worth keeping">
          <div className="landing-meadow-photo">
            <img className="landing-full-photo" src="/landing/meadow.webp" alt="Two friends walking hand in hand through a sunlit meadow" width="735" height="490" decoding="async" />
            <div className="landing-photo-scraps" aria-hidden="true">
              <PhotoCutout kind="daisy" className="landing-photo-daisy" />
              <CollageBurst className="landing-photo-spark" />
            </div>
          </div>
          <span className="landing-photo-caption">the days that turn into stories.</span>
        </section>

        <section className="landing-block landing-make">
          <div className="landing-content">
            <p className="landing-kicker">01 / MAKE IT YOURS</p>
            <h2>Your photos.<br />Your words.<br />Your world.</h2>
            <p className="landing-description">Stack photos and videos. Add a thought, a color, a sticker. Keep going.</p>
            <div className="landing-make-collage" aria-hidden="true">
              <img className="landing-sticker landing-make-scrap-street" src="/landing/cosmos-street.webp" alt="" width="900" height="1126" loading="lazy" decoding="async" />
              <PhotoCutout kind="cassette" className="landing-make-cassette" />
              <PhotoCutout kind="rollerskate" className="landing-make-skate" />
              <PhotoCutout kind="headphones" className="landing-make-headphones" />
              <PhotoCutout kind="cd" className="landing-make-cd" />
              <CollageBurst className="landing-make-spark" />
            </div>
          </div>
        </section>

        <section className="landing-block landing-share">
          <div className="landing-content">
            <p className="landing-kicker">02 / PASS IT AROUND</p>
            <h2>For your<br />people.</h2>
            <p className="landing-description">One Strip. One link.<br />Send it to the group chat.</p>
            <div className="landing-share-photo">
              <img src="/landing/cosmos-ocean.webp" alt="A candid sunset portrait beside the ocean" width="900" height="1199" loading="lazy" decoding="async" />
              <PhotoCutout kind="ticket-admit" className="landing-share-ticket" />
              <PhotoCutout kind="cherries" className="landing-share-cherries" />
              <PhotoCutout kind="shell" className="landing-share-shell" />
              <PhotoCutout kind="clip" className="landing-share-clip" />
              <CollageBurst className="landing-share-spark" />
            </div>
            <p className="landing-signoff">This is a Strip.<br />Now make yours.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
