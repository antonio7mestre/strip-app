import Matter from "matter-js";

export type FloatingSticker = {
  x: number; y: number; width: number; height: number; angle: number; round?: boolean;
};

export const STICKER_STEP_MS = 1000 / 120;
export const STICKER_REVEAL_MS = 1400;
export const STICKER_FADE_MS = 440;

/** Screen-space rigid bodies, independent of rendering and the refresh rate. */
export function createStickerPhysics(stickers: FloatingSticker[], width: number,
  random: () => number = Math.random) {
  const { Engine, Bodies, Body, Composite, Events } = Matter;
  const engine = Engine.create({ positionIterations: 8, velocityIterations: 8 });
  engine.gravity.y = -1.15;
  // Side walls let objects bump, but there is deliberately no ceiling or floor.
  const extent = Math.max(4000, ...stickers.map(sticker => Math.abs(sticker.y) + sticker.height)) + 4000;
  const walls = [
    Bodies.rectangle(-80, 0, 160, extent * 2, { isStatic: true }),
    Bodies.rectangle(width + 80, 0, 160, extent * 2, { isStatic: true })];
  const releases = stickers.map(sticker => ({
    at: 65 + random() * 65,
    direction: random() < 0.5 ? -1 : 1,
    x: (sticker.x / Math.max(1, width) - 0.5) * 3 + (random() - 0.5) * 3.4,
    y: -3.2 - random() * 2.4,
    spin: (random() - 0.5) * 0.11,
  }));
  const bodies = stickers.map(sticker => {
    // Transparent cutouts need slightly inset colliders, not their full image boxes.
    const w = Math.max(12, sticker.width * 0.78), h = Math.max(12, sticker.height * 0.8);
    const options = { restitution: 0.48, friction: 0.34, frictionAir: 0.009, angle: sticker.angle,
      collisionFilter: { category: 2, mask: 1, group: 0 } };
    const body = sticker.round
      ? Bodies.circle(sticker.x, sticker.y, Math.min(w, h) / 2, options)
      : Bodies.rectangle(sticker.x, sticker.y, w, h, { ...options, chamfer: { radius: Math.min(w, h) * 0.12 } });
    // Briefly pinned: the impact gives each sticker a little recoil before it comes loose.
    Body.setStatic(body, true);
    return body;
  });
  Composite.add(engine.world, [...walls, ...bodies]);
  let elapsed = 0, accumulator = 0, disposed = false;
  return {
    bodies,
    step(deltaMs: number) {
      if (disposed) return;
      // Cap catch-up after a suspended tab, never send a huge step into the solver.
      accumulator += Math.min(64, Math.max(0, deltaMs));
      while (accumulator >= STICKER_STEP_MS) {
        elapsed += STICKER_STEP_MS;
        bodies.forEach((body, index) => {
          const release = releases[index], seed = stickers[index];
          if (elapsed < release.at) {
            const bump = Math.sin(elapsed / release.at * Math.PI);
            Body.setPosition(body, { x: seed.x + release.direction * 5 * bump, y: seed.y + 5 * bump });
            Body.setAngle(body, seed.angle + release.direction * 0.065 * bump);
          } else if (body.isStatic) {
            Body.setStatic(body, false);
            Body.setVelocity(body, { x: release.x, y: release.y });
            Body.setAngularVelocity(body, release.spin);
          }
          // The collage starts overlapped. Release it before enabling object-to-object collisions.
          if (elapsed > 180) body.collisionFilter.mask = 3;
        });
        Engine.update(engine, STICKER_STEP_MS);
        accumulator -= STICKER_STEP_MS;
      }
    },
    dispose() { disposed = true; Events.off(engine, "collisionStart"); Composite.clear(engine.world, false); Engine.clear(engine); },
  };
}
