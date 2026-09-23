import { createContext, useContext, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

export const AUTH_LANDING_COLOR = "#304dff";

const STICKER_HEIGHTS = { camera: 512, flipphone: 1152, ball: 768, "green-glasses": 512, daisy: 922, cherries: 790, cassette: 512, headphones: 816, cd: 768, "ticket-admit": 511, shell: 702, rollerskate: 814, clip: 640 } as const;

const StickerSelection = createContext<{ selected: string | null; select: (id: string | null) => void }>({ selected: null, select: () => {} });

/** The collage photo is rotated. Convert a screen-space drag into its local axes. */
export function landingStickerOffset(x: number, y: number, angle: number) {
  return { x: x * Math.cos(angle) + y * Math.sin(angle), y: y * Math.cos(angle) - x * Math.sin(angle) };
}

/** Match the editor: no inset, with just a grab-able sliver kept on the canvas. */
export function landingStickerBounds(rect: { left: number; right: number; width: number }, canvasWidth: number) {
  const visible = Math.min(44, rect.width);
  return { minX: Math.min(0, visible - rect.right), maxX: Math.max(0, canvasWidth - visible - rect.left) };
}

const OUTLINE_OFFSETS = Array.from({ length: 32 }, (_, index) => {
  const angle = index * Math.PI / 16;
  return { x: 3 * Math.cos(angle), y: 3 * Math.sin(angle) };
});

function parentAngle(element: HTMLElement) {
  let angle = 0;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const transform = getComputedStyle(parent).transform;
    if (transform !== "none") {
      const matrix = new DOMMatrixReadOnly(transform);
      angle += Math.atan2(matrix.b, matrix.a);
    }
  }
  return angle;
}

function MovableSticker({ className, label, children }: { className: string; label: string; children: ReactNode }) {
  const { selected, select } = useContext(StickerSelection);
  const isSelected = selected === className;
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; scrollY: number; angle: number; origin: typeof offset; minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return (
    <button type="button" data-landing-sticker className={`${className} landing-sticker-button${isSelected ? " is-selected" : ""}${dragging ? " is-dragging" : ""}`}
      aria-label={`Move ${label} sticker`} aria-pressed={isSelected} aria-describedby="landing-sticker-help"
      style={{ translate: `${offset.x}px ${offset.y}px` }}
      onClick={() => select(className)}
      onPointerDown={event => {
        // Like the editor: first tap selects; swiping an unselected sticker still scrolls.
        if (!isSelected || !event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        const element = event.currentTarget;
        const rect = element.getBoundingClientRect();
        const canvas = element.closest(".auth-landing")!.getBoundingClientRect();
        element.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, scrollY: window.scrollY, angle: parentAngle(element), origin: offset,
          ...landingStickerBounds(rect, document.documentElement.clientWidth),
          minY: Math.min(0, canvas.top - rect.top), maxY: Math.max(0, canvas.bottom - rect.bottom) };
        setDragging(true);
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        event.preventDefault();
        const dx = Math.max(current.minX, Math.min(current.maxX, event.clientX - current.x));
        const dy = Math.max(current.minY, Math.min(current.maxY, event.clientY - current.y + window.scrollY - current.scrollY));
        const delta = landingStickerOffset(dx, dy, current.angle);
        setOffset({ x: current.origin.x + delta.x, y: current.origin.y + delta.y });
      }}
      onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
      onKeyDown={event => {
        if (event.key === "Escape") { select(null); return; }
        if (!isSelected) return;
        const step = event.shiftKey ? 24 : 8;
        const direction = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!direction) return;
        event.preventDefault();
        const delta = landingStickerOffset(direction[0], direction[1], parentAngle(event.currentTarget));
        setOffset(value => ({ x: value.x + delta.x, y: value.y + delta.y }));
      }}>
      <span className="landing-sticker-art">{children}</span>
    </button>
  );
}

/** Complete alpha-cut objects. Selection follows the alpha, never an image rectangle. */
function PhotoCutout({ kind, className = "" }: { kind: keyof typeof STICKER_HEIGHTS; className?: string }) {
  return (
    <MovableSticker className={`landing-cutout landing-cutout-${kind} ${className}`} label={kind === "flipphone" ? "phone" : kind.replaceAll("-", " ")}>
      <img src={`/landing/sticker-${kind}.webp`} alt="" width="768" height={STICKER_HEIGHTS[kind]} decoding="async" draggable={false} />
    </MovableSticker>
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
    <MovableSticker className={`landing-doodle ${className}`} label={className === "landing-share-spark" ? "heart" : className === "landing-hero-squiggle" ? "squiggle" : "spark"}>
      <svg viewBox="0 0 100 100" focusable="false">
        <path className="landing-shape-outline" fill="white" stroke="white" strokeWidth="6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" d={shapes[className]} />
        <path fill="currentColor" d={shapes[className]} />
      </svg>
    </MovableSticker>
  );
}

/** Use Safari's document scroller so the actual Strip paints behind its chrome. */
export function AuthLandingStrip() {
  const [selected, select] = useState<string | null>(null);
  const backgroundTap = useRef<{ id: number; x: number; y: number; scrollY: number } | null>(null);
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
    <StickerSelection.Provider value={{ selected, select }}>
    <div className="auth-landing" role="region" aria-label="Meet Strip" onPointerDown={event => {
      backgroundTap.current = (event.target as Element).closest("[data-landing-sticker]") ? null
        : { id: event.pointerId, x: event.clientX, y: event.clientY, scrollY: window.scrollY };
    }} onPointerUp={event => {
      const tap = backgroundTap.current;
      backgroundTap.current = null;
      // Scrolling off the sticker keeps it selected, just like the editor.
      if (tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 8
        && Math.abs(window.scrollY - tap.scrollY) < 8) select(null);
    }} onPointerCancel={() => { backgroundTap.current = null; }}>
      <svg className="landing-sticker-filters" aria-hidden="true" width="0" height="0" focusable="false">
        <defs>
          <filter id="landing-sticker-outline" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
            {OUTLINE_OFFSETS.map((offset, index) => <feOffset key={index} in="SourceAlpha" dx={offset.x} dy={offset.y} result={`rim-${index}`} />)}
            <feMerge result="edge"><feMergeNode in="SourceAlpha" />{OUTLINE_OFFSETS.map((_, index) => <feMergeNode key={index} in={`rim-${index}`} />)}</feMerge>
            <feFlood floodColor="white" /><feComposite in2="edge" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
      </svg>
      <span id="landing-sticker-help" className="sr-only">Tap a sticker to select it, then drag to move. Use arrow keys to move a selected sticker, or Escape to deselect.</span>
      <div className="landing-strip">
        <header className="landing-block landing-hero">
          <div className="landing-content">
            <h1 id="auth-heading">Want to<br />strip?</h1>
            <p className="landing-intro">Photos, videos, words.<br />All the things that feel like you.</p>
            <div className="landing-hero-stickers">
              <div className="landing-play-hint" aria-hidden="true">
                <img className="landing-play-lettering" src="/landing/sticker-help-text.png" alt="click a sticker to move it around" width="1536" height="1024" draggable={false} />
                <span className="landing-play-arrow"><img src="/landing/sticker-help-arrow.png" alt="" width="1536" height="1024" draggable={false} /></span>
              </div>
              <img className="landing-sticker landing-sticker-sky" src="/landing/cosmos-sky.webp" width="900" height="1200" alt="" decoding="async" />
              <PhotoCutout kind="green-glasses" className="landing-hero-glasses" />
              <PhotoCutout kind="camera" className="landing-hero-camera" />
              <PhotoCutout kind="flipphone" className="landing-hero-phone" />
              <MovableSticker className="landing-doodle landing-hero-ring" label="ringing phone">
                <svg viewBox="0 0 100 100" focusable="false">
                  <path className="landing-shape-outline" d="M49 85Q49 49 85 49M23 85Q23 23 85 23" fill="none" stroke="white" strokeWidth="24" strokeLinecap="round" />
                  <path d="M49 85Q49 49 85 49M23 85Q23 23 85 23" fill="none" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
                </svg>
              </MovableSticker>
              <PhotoCutout kind="ball" className="landing-hero-ball" />
              <CollageBurst className="landing-hero-spark" />
              <CollageBurst className="landing-hero-squiggle" />
            </div>
          </div>
        </header>

        <section className="landing-block landing-photo-block" aria-label="A moment worth keeping">
          <div className="landing-meadow-photo">
            <img className="landing-full-photo" src="/landing/meadow.webp" alt="Two friends walking hand in hand through a sunlit meadow" width="735" height="490" decoding="async" />
            <div className="landing-photo-scraps">
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
            <div className="landing-make-collage">
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
    </StickerSelection.Provider>
  );
}
