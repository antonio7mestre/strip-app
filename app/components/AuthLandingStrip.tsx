export const AUTH_LANDING_COLOR = "#304dff";

/** A real, scrollable sample Strip. The sign-in dock stays outside this scroller. */
export function AuthLandingStrip() {
  return (
    <div className="auth-landing" tabIndex={0} role="region" aria-label="Meet Strip">
      <div className="landing-strip">
        <header className="landing-block landing-hero">
          <div className="landing-content">
            <div className="landing-masthead">
              <span className="auth-landing-brand">STRIP</span>
              <span>A little bit of your life.</span>
            </div>
            <h1 id="auth-heading">Want to<br />strip?</h1>
            <p className="landing-intro">Photos, videos, words.<br />All the things that feel like you.</p>
            <div className="landing-hero-stickers" aria-hidden="true">
              <img className="landing-sticker landing-sticker-pool" src="/landing/poolside.webp" width="1080" height="1350" alt="" decoding="async" />
              <img className="landing-sticker landing-sticker-friends" src="/landing/afternoon.webp" width="845" height="1171" alt="" decoding="async" />
              <span className="landing-photo-note">wish you were here</span>
            </div>
          </div>
        </header>

        <section className="landing-block landing-photo-block" aria-label="A moment worth keeping">
          <img className="landing-full-photo" src="/landing/meadow.webp" alt="Two friends walking hand in hand through a sunlit meadow" width="735" height="490" decoding="async" />
          <span className="landing-photo-caption">the days that turn into stories.</span>
        </section>

        <section className="landing-block landing-make">
          <div className="landing-content">
            <p className="landing-kicker">01 / MAKE IT YOURS</p>
            <h2>Your photos.<br />Your words.<br />Your world.</h2>
            <p className="landing-description">Stack photos and videos. Add a thought, a color, a sticker. Keep going.</p>
            <img className="landing-sticker landing-sticker-detail" src="/landing/poolside.webp" alt="Pink summer essentials and swimming goggles" width="1080" height="1350" loading="lazy" decoding="async" />
            <span className="landing-sticker-label" aria-hidden="true">a little more you</span>
          </div>
        </section>

        <section className="landing-block landing-share">
          <div className="landing-content">
            <p className="landing-kicker">02 / PASS IT AROUND</p>
            <h2>For your<br />people.</h2>
            <p className="landing-description">One Strip. One link.<br />Send it to the group chat.</p>
            <div className="landing-share-photo">
              <img src="/landing/afternoon.webp" alt="Friends spending a sunny afternoon together in a garden" width="845" height="1171" loading="lazy" decoding="async" />
              <span className="landing-link-sticker" aria-hidden="true">yourname.striiip.com ↗</span>
            </div>
            <p className="landing-signoff">This is a Strip.<br />Now make yours.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
