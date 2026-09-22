import { createStickerPhysics, STICKER_FADE_MS, STICKER_REVEAL_MS, type FloatingSticker } from "./sticker-physics";

// Photo wrappers contain the Cosmos pictures too. Only detach the object cutouts and drawings.
export const FLOATING_STICKER_SELECTOR = ".landing-cutout, .landing-doodle";
const BLEED = 160;

function screenAngle(element: HTMLElement) {
  let angle = 0;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const transform = getComputedStyle(node).transform;
    if (transform && transform !== "none") {
      const matrix = new DOMMatrixReadOnly(transform);
      angle += Math.atan2(matrix.b, matrix.a);
    }
  }
  return angle;
}

/** Freeze a photograph of our own layout, then detach only its decorative objects.
 * The snapshot also protects the photographs from Safari's scroll reset at sign-in. */
export function startAuthStickerExit(onReveal: () => void, onComplete: () => void) {
  const landing = document.querySelector<HTMLElement>(".auth-landing");
  if (!landing) {
    let canceled = false;
    queueMicrotask(() => { if (!canceled) { onReveal(); onComplete(); } });
    return () => { canceled = true; };
  }
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const width = document.documentElement.clientWidth;
  const height = window.visualViewport
    ? Math.min(window.innerHeight, window.visualViewport.height + window.visualViewport.offsetTop)
    : window.innerHeight;
  const overlay = document.createElement("div");
  overlay.className = "auth-sticker-exit";
  overlay.setAttribute("aria-hidden", "true");
  const backdrop = document.createElement("div");
  backdrop.className = "auth-sticker-backdrop auth-step-landing";
  const bounds = landing.getBoundingClientRect();
  const frozen = landing.cloneNode(true) as HTMLElement;
  frozen.classList.add("auth-landing-frozen");
  Object.assign(frozen.style, { left: `${bounds.left}px`, top: `${bounds.top + BLEED}px`,
    width: `${bounds.width}px`, height: `${bounds.height}px`, translate: "none", transform: "none" });
  frozen.style.setProperty("--leading-image-inset", getComputedStyle(landing).getPropertyValue("--leading-image-inset") || "0px");
  frozen.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
  frozen.querySelectorAll(FLOATING_STICKER_SELECTOR).forEach(element => element.remove());
  backdrop.append(frozen);
  overlay.append(backdrop);

  const stage = document.createElement("div");
  stage.className = "auth-sticker-stage";
  stage.style.top = `${BLEED}px`;
  overlay.append(stage);
  const sprites: HTMLElement[] = [];
  const seeds: FloatingSticker[] = [];
  if (!reducedMotion) {
    landing.querySelectorAll<HTMLElement>(FLOATING_STICKER_SELECTOR).forEach(element => {
      const rect = element.getBoundingClientRect();
      // Keep document coordinates so objects lift from their own place, never teleport into view.
      if (!rect.width || !rect.height) return;
      const style = getComputedStyle(element);
      const sprite = document.createElement("div");
      sprite.className = "auth-floating-sticker";
      sprite.dataset.sticker = element.className;
      Array.from(element.childNodes).forEach(child => sprite.append(child.cloneNode(true)));
      Object.assign(sprite.style, { width: `${element.offsetWidth}px`, height: `${element.offsetHeight}px`,
        color: style.color, zIndex: style.zIndex === "auto" ? "1" : style.zIndex });
      stage.append(sprite);
      sprites.push(sprite);
      seeds.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
        width: element.offsetWidth, height: element.offsetHeight, angle: screenAngle(element),
        round: /cutout-(ball|cd)|landing-doodle/.test(element.className) });
    });
    const button = document.querySelector<HTMLElement>(".auth-step-landing .auth-action-button");
    if (button) {
      const rect = button.getBoundingClientRect();
      const cursor = getComputedStyle(button, "::after");
      const w = parseFloat(cursor.width), h = parseFloat(cursor.height);
      if (w > 0 && h > 0) {
        const sprite = document.createElement("div");
        sprite.className = "auth-floating-sticker";
        sprite.dataset.sticker = "cursor";
        Object.assign(sprite.style, { width: `${w}px`, height: `${h}px`, background: cursor.background, zIndex: "5" });
        stage.append(sprite);
        sprites.push(sprite);
        seeds.push({ x: rect.right - parseFloat(cursor.right) - w / 2,
          y: rect.bottom - parseFloat(cursor.bottom) - h / 2, width: w, height: h, angle: 0 });
      }
    }
  }
  const physics = createStickerPhysics(seeds, width);
  const visibleAtTap = seeds.map((seed, index) => ({ seed, index }))
    .filter(({ seed }) => seed.y + seed.height / 2 >= 0 && seed.y - seed.height / 2 <= height)
    .map(({ index }) => index);
  const draw = () => physics.bodies.forEach((body, index) => {
    const seed = seeds[index];
    sprites[index].style.transform = `translate3d(${body.position.x - seed.width / 2}px,${body.position.y - seed.height / 2}px,0) rotate(${body.angle}rad)`;
  });
  draw();
  document.body.append(overlay);
  document.documentElement.classList.add("auth-stickers-floating");

  let frame = 0, disposed = false, revealed = false, revealedAt = 0;
  const started = performance.now();
  let previous = started;
  const preventScroll = (event: Event) => event.preventDefault();
  document.addEventListener("touchmove", preventScroll, { passive: false });
  document.addEventListener("wheel", preventScroll, { passive: false });
  // Block a rapid second tap on the underlying CTA without disabling its visual style.
  const preventTap = (event: Event) => { event.preventDefault(); event.stopPropagation(); };
  document.addEventListener("click", preventTap, true);
  const reveal = () => {
    if (revealed || disposed) return;
    revealed = true;
    onReveal();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    clearTimeout(watchdog);
    physics.dispose();
    overlay.remove();
    document.documentElement.classList.remove("auth-stickers-floating");
    document.removeEventListener("click", preventTap, true);
    document.removeEventListener("touchmove", preventScroll);
    document.removeEventListener("wheel", preventScroll);
    document.removeEventListener("visibilitychange", finish);
    window.removeEventListener("orientationchange", finish);
  };
  const finish = () => { if (disposed) return; reveal(); dispose(); onComplete(); };
  // Navigation must still complete if animation frames stop (background tab, interruption).
  const watchdog = window.setTimeout(finish, 2400);
  document.addEventListener("visibilitychange", finish);
  window.addEventListener("orientationchange", finish);
  const tick = (now: number) => {
    if (disposed) return;
    const elapsed = now - started;
    physics.step(now - previous);
    previous = now;
    draw();
    const clearedScreen = visibleAtTap.every(index => physics.bodies[index].bounds.max.y < -24);
    const ready = reducedMotion || !seeds.length ||
      (elapsed >= 700 && clearedScreen) || elapsed >= STICKER_REVEAL_MS;
    if (ready && !revealed) { revealedAt = now; reveal(); }
    if (revealed) {
      const progress = Math.min(1, (now - revealedAt) / (reducedMotion ? 140 : STICKER_FADE_MS));
      // A pure crossfade. No photograph translates, scales, or participates in the physics.
      overlay.style.opacity = String(1 - progress * progress * (3 - 2 * progress));
      if (progress >= 1) { finish(); return; }
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return dispose;
}
