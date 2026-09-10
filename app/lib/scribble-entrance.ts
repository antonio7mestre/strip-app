export const SQUARE_STEP_MS = 2;
export const SQUARE_FILL_MS = 260;
export const SCRIBBLE_FADE_MS = 650;

/** Safari 26 may report zero safe insets and a viewport shorter than the glass.
 * Use the screen only on iPhone, and only for this non-interactive paint layer. */
export function scribbleSurfaceBounds({
  viewportHeight, screenWidth, screenHeight, landscape, isPhone, safeTop, scrollY,
}: {
  viewportHeight: number; screenWidth: number; screenHeight: number;
  landscape: boolean; isPhone: boolean; safeTop: number; scrollY: number;
}) {
  const phoneHeight = landscape ? Math.min(screenWidth, screenHeight) : Math.max(screenWidth, screenHeight);
  const phoneTop = isPhone && !landscape ? Math.min(62, Math.max(47, Math.min(screenWidth, screenHeight) * 0.154)) : 0;
  const inset = Math.max(safeTop, phoneTop);
  // Overscan the physical edge, not a separate colored safe-area patch. Safari's
  // fractional viewport/compositor rounding must never expose the next block.
  return { top: scrollY - inset, height: Math.ceil(Math.max(viewportHeight + inset, isPhone ? phoneHeight : 0)) + 8 };
}

export function installScribbleSurface(host: HTMLElement) {
  let disposed = false;
  // Text pages normally ask Safari for a solid edge tint. Suspend that hint
  // while real ink is painting there; preserve ongoing content/color updates.
  const theme = host.closest?.(".published-mode.has-leading-text")
    ? document.getElementById("strip-theme-color") : null;
  const themeName = theme?.getAttribute("name") ?? null;
  if (themeName) theme?.removeAttribute("name");
  const sync = () => {
    if (disposed) return;
    const safeTop = parseFloat(getComputedStyle(host).getPropertyValue("--entrance-safe-top")) || 0;
    const size = scribbleSurfaceBounds({
      viewportHeight: window.innerHeight,
      screenWidth: window.screen.width, screenHeight: window.screen.height,
      landscape: window.innerWidth > window.innerHeight,
      isPhone: /iPhone|iPod/.test(navigator.userAgent),
      safeTop, scrollY: window.scrollY,
    });
    const top = size.top + "px", height = size.height + "px";
    if (host.style.top !== top) host.style.top = top;
    if (host.style.height !== height) host.style.height = height;
    const viewport = window.visualViewport;
    const visibleBottom = Math.min(window.innerHeight, (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0));
    const labelBottom = Math.max(12, size.height + size.top - window.scrollY - visibleBottom + 12) + "px";
    if (host.style.getPropertyValue("--entrance-label-bottom") !== labelBottom) {
      host.style.setProperty("--entrance-label-bottom", labelBottom);
    }
  };
  sync();
  // The parent's existing leading-media anchor runs in the same layout commit.
  // Match its final position before painting, without moving the page ourselves.
  const frame = requestAnimationFrame(sync);
  window.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync, { passive: true });
  window.visualViewport?.addEventListener("resize", sync);
  window.visualViewport?.addEventListener("scroll", sync);
  return () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("resize", sync);
    window.visualViewport?.removeEventListener("scroll", sync);
    if (themeName && !theme?.hasAttribute("name")) theme?.setAttribute("name", themeName);
  };
}


const clamp = (value: number) => Math.max(0, Math.min(1, value));

// Preserve the existing strip-derived color selection exactly.
export function chooseScribbleColor(palette: readonly string[]) {
  const color = palette.find(value => /^#[0-9a-f]{6}$/i.test(value)) ?? "#3155FF";
  const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  const lightness = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  const lift = Math.max(0, (100 - lightness) / (255 - lightness || 1));
  return "#" + rgb.map(value => Math.round(value + (255 - value) * lift)
    .toString(16).padStart(2, "0")).join("").toUpperCase();
}

export type EntranceSquare = { x: number; y: number; size: number };

/** A centered grid, with the center first and every other cell shuffled once. */
export function createSquareGrid(width: number, height: number, seed = Math.floor(Math.random() * 4294967296)) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const size = Math.max(8, Math.min(14, Math.round(Math.min(w, h) / 44)));
  const columns = Math.max(3, 2 * Math.ceil((w / size - 1) / 2) + 1);
  const rows = Math.max(3, 2 * Math.ceil((h / size - 1) / 2) + 1);
  const left = (w - columns * size) / 2, top = (h - rows * size) / 2;
  const center = Math.floor(rows / 2) * columns + Math.floor(columns / 2);
  const order = Array.from({ length: rows * columns }, (_, index) => index).filter(index => index !== center);
  for (let i = order.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor(seed / 4294967296 * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return [center, ...order].map(index => ({
    x: left + (index % columns) * size,
    y: top + Math.floor(index / columns) * size,
    size,
  }));
}

// Keep the existing integration contract so the counter, readiness gate, and
// safe-area handoff are unchanged. No line, ribbon, or stroke rendering remains.
export function startScribble(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  palette: readonly string[],
  onComplete: () => void,
) {
  const context = canvas.getContext("2d");
  let stopped = false, completed = false, ready = false, covered = false;
  let frame = 0, previousFrame: number | null = null;
  let waitElapsed = 0, fillElapsed = 0, fadeElapsed = 0;
  let fillFrom: number | null = null;
  let squares: EntranceSquare[] = [], drawn = 0;
  let width = 1, height = 1, ratio = 1;
  const ink = chooseScribbleColor(palette);
  const seed = Math.floor(Math.random() * 4294967296);

  const report = () => {
    host.dataset.inkSegments = String(drawn);
    host.dataset.inkTotal = String(squares.length);
    host.dataset.inkProgress = (covered ? 1 : Math.min(0.999, drawn / squares.length)).toFixed(3);
  };
  const drawTo = (target: number) => {
    for (; drawn < Math.min(target, squares.length); drawn++) {
      const square = squares[drawn];
      // Snap outward to physical pixels so adjacent tiles never leave seams.
      const x = Math.floor(square.x * ratio), y = Math.floor(square.y * ratio);
      const right = Math.ceil((square.x + square.size) * ratio);
      const bottom = Math.ceil((square.y + square.size) * ratio);
      if (context) {
        context.fillStyle = ink;
        context.fillRect(x / ratio, y / ratio, (right - x) / ratio, (bottom - y) / ratio);
      }
    }
    report();
  };
  const seal = () => {
    if (context) {
      context.fillStyle = ink;
      context.fillRect(0, 0, width, height);
    } else {
      host.style.backgroundColor = ink;
    }
  };
  const resize = () => {
    if (stopped || completed) return;
    const bounds = host.getBoundingClientRect();
    const nextWidth = Math.max(1, bounds.width), nextHeight = Math.max(1, bounds.height);
    const nextRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    if (squares.length && nextWidth === width && nextHeight === height && nextRatio === ratio) return;
    const previousTotal = squares.length;
    const onlyCenter = drawn <= 1;
    const fraction = previousTotal ? drawn / previousTotal : 0;
    const fillFraction = fillFrom === null ? null : fillFrom / previousTotal;
    width = nextWidth; height = nextHeight; ratio = nextRatio;
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    squares = createSquareGrid(width, height, seed);
    if (fillFraction !== null) fillFrom = Math.floor(fillFraction * squares.length);
    drawn = 0;
    drawTo(covered ? squares.length : onlyCenter ? 1 : Math.max(1, Math.min(squares.length - 1, Math.ceil(fraction * squares.length))));
    if (covered) seal();
  };
  const schedule = () => {
    if (!frame && !stopped && !completed) frame = requestAnimationFrame(tick);
  };
  function tick(now: number) {
    frame = 0;
    if (stopped || completed) return;
    // Bound elapsed time after a suspended tab; waiting paint has its own cap.
    const delta = previousFrame === null ? 0 : Math.min(64, Math.max(0, now - previousFrame));
    previousFrame = now;
    if (!covered) {
      if (fillFrom === null) {
        if (ready) {
          fillFrom = drawn;
          host.dataset.inkPhase = "sweeping";
        } else {
          // Paint every elapsed beat instead of capping at one square per frame.
          // Limit catch-up to 32ms so a resumed tab never dumps the whole grid.
          waitElapsed += Math.min(delta, 32);
          if (waitElapsed >= SQUARE_STEP_MS) {
            const count = Math.floor(waitElapsed / SQUARE_STEP_MS);
            waitElapsed %= SQUARE_STEP_MS;
            // Leave the final tile for readiness, even during an unusually long wait.
            drawTo(Math.min(drawn + count, squares.length - 1));
          }
        }
      } else {
        fillElapsed += delta;
        const fill = clamp(fillElapsed / SQUARE_FILL_MS);
        const eased = 1 - (1 - fill) ** 2;
        drawTo(fillFrom + Math.floor(eased * (squares.length - fillFrom)));
        if (fill === 1) {
          covered = true;
          seal();
          report();
          host.dataset.inkPhase = "covered";
        }
      }
    }
    if (covered && ready) {
      // Give the fully painted frame its own paint before the unchanged fade.
      if (host.dataset.inkPhase === "fading") fadeElapsed += delta;
      host.dataset.inkPhase = "fading";
      const fade = clamp(fadeElapsed / SCRIBBLE_FADE_MS);
      host.style.opacity = String(1 - fade * fade * (3 - 2 * fade));
      if (fade === 1) {
        completed = true;
        onComplete();
        return;
      }
    }
    if (!covered || ready) schedule();
  }
  host.dataset.inkPhase = "drawing";
  host.dataset.inkAnimation = "squares";
  host.style.opacity = "1";
  host.dataset.inkColor = ink;
  resize(); // The first center square is present before the first browser paint.
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  schedule();
  return {
    setReady(value: boolean) {
      if (stopped || completed) return;
      ready = value;
      schedule();
    },
    dispose() {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    },
  };
}
