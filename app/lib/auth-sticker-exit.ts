import { createStickerPhysics, type FloatingSticker } from "./sticker-physics";

// Photo wrappers contain the Cosmos pictures too. Only detach the object cutouts and drawings.
export const FLOATING_STICKER_SELECTOR = "[data-landing-sticker]";
const BLEED = 160;
export const AUTH_FORM_FADE_MS = 620;

/** Check the whole visual, including its rotation, beyond the status-bar bleed. */
export function stickersHaveLeftScreen(stickers: FloatingSticker[], positions: { y: number }[]) {
  return stickers.every((sticker, index) =>
    positions[index].y + Math.hypot(sticker.width, sticker.height) / 2 < -BLEED);
}

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
  const overlay = document.createElement("div");
  overlay.className = "auth-sticker-exit";
  overlay.setAttribute("aria-hidden", "true");
  const backdrop = document.createElement("div");
  backdrop.className = "auth-sticker-backdrop auth-step-landing";
  const bounds = landing.getBoundingClientRect();
  const flightInset = Number.parseFloat(getComputedStyle(landing).getPropertyValue("--leading-image-inset")) || 0;
  const frozen = landing.cloneNode(true) as HTMLElement;
  frozen.classList.add("auth-landing-frozen");
  Object.assign(frozen.style, { left: `${bounds.left}px`, top: `${bounds.top + BLEED}px`,
    width: `${bounds.width}px`, height: `${bounds.height}px`, translate: "none", transform: "none" });
  frozen.style.setProperty("--leading-image-inset", getComputedStyle(landing).getPropertyValue("--leading-image-inset") || "0px");
  frozen.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
  frozen.querySelectorAll(FLOATING_STICKER_SELECTOR).forEach(element => element.remove());
  backdrop.append(frozen);
  const dock = document.querySelector<HTMLElement>(".auth-action-dock");
  if (dock) {
    const rect = dock.getBoundingClientRect(), style = getComputedStyle(dock);
    const copy = dock.cloneNode(true) as HTMLElement;
    copy.classList.add("auth-dock-frozen");
    Object.assign(copy.style, { position: "absolute", left: `${rect.left}px`, top: `${rect.top + BLEED}px`,
      bottom: "auto", width: `${rect.width}px`, height: `${rect.height}px`, minHeight: "0",
      padding: style.padding, translate: "none", transform: "none", margin: "0" });
    backdrop.append(copy);
  }
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
  const draw = () => physics.bodies.forEach((body, index) => {
    const seed = seeds[index];
    sprites[index].style.transform = `translate3d(${body.position.x - seed.width / 2}px,${body.position.y - seed.height / 2}px,0) rotate(${body.angle}rad)`;
  });
  draw();
  document.body.append(overlay);
  document.documentElement.style.setProperty("--auth-flight-inset", `${flightInset}px`);
  document.documentElement.classList.add("auth-stickers-floating");

  let frame = 0, disposed = false;
  const fadeDuration = reducedMotion ? 160 : AUTH_FORM_FADE_MS;
  const started = performance.now();
  let previous = started;
  const preventScroll = (event: Event) => event.preventDefault();
  document.addEventListener("touchmove", preventScroll, { passive: false });
  document.addEventListener("wheel", preventScroll, { passive: false });
  // Block the outgoing CTA tap only through the crossfade. The real form is
  // interactive while the remaining decorative objects continue overhead.
  const preventTap = (event: Event) => { event.preventDefault(); event.stopPropagation(); };
  document.addEventListener("click", preventTap, true);
  // Mount and focus during the original tap, before any frame or timer. The real
  // input stays in its final position so Safari never pans toward an offscreen input.
  onReveal();
  // Safari only paints actual document content beyond its top edge while the
  // document retains its media anchor. The form keeps that anchor after flight
  // so finishing the animation cannot rebase Safari's focused-input canvas.
  window.scrollTo({ top: flightInset, left: 0, behavior: "instant" });
  overlay.style.top = `${window.scrollY - BLEED}px`;
  // Landing unmount restores this metadata. Keep it unset for the whole flight
  // so Safari samples the objects beneath its translucent status bar.
  const theme = document.getElementById("strip-theme-color");
  const themeName = theme?.getAttribute("name");
  theme?.removeAttribute("name");
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    clearTimeout(watchdog);
    physics.dispose();
    overlay.remove();
    if (themeName && !theme?.hasAttribute("name")) theme?.setAttribute("name", themeName);
    document.documentElement.classList.remove("auth-stickers-floating");
    document.documentElement.style.removeProperty("--auth-flight-inset");
    if (!document.documentElement.classList.contains("auth-form-anchored")) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    document.removeEventListener("click", preventTap, true);
    document.removeEventListener("touchmove", preventScroll);
    document.removeEventListener("wheel", preventScroll);
    document.removeEventListener("visibilitychange", finish);
    window.removeEventListener("orientationchange", finish);
  };
  const finish = () => { if (disposed) return; dispose(); onComplete(); };
  // Only clean up stalled frames. A long page must not lose its lowest stickers
  // because a fixed total animation duration expired.
  let watchdog = window.setTimeout(finish, 2400);
  document.addEventListener("visibilitychange", finish);
  window.addEventListener("orientationchange", finish);
  const tick = (now: number) => {
    if (disposed) return;
    const elapsed = now - started;
    physics.step(now - previous);
    previous = now;
    overlay.style.top = `${window.scrollY - BLEED}px`;
    draw();
    const progress = Math.min(1, elapsed / fadeDuration);
    const fade = progress * progress * (3 - 2 * progress);
    backdrop.style.opacity = `${1 - fade}`;
    if (progress === 1) document.removeEventListener("click", preventTap, true);
    if (progress === 1 && stickersHaveLeftScreen(seeds, physics.bodies.map(body => body.position))) {
      finish();
      return;
    }
    clearTimeout(watchdog);
    watchdog = window.setTimeout(finish, 2400);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return dispose;
}
