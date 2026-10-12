export type SpringAxis = { value: number; velocity: number };

/** Follow the artwork's geometry, but never scale the controls or their icons. */
export function textStickerToolFrame(
  pose: { x: number; y: number; scale: number; rotation: number },
  width: number,
  height: number,
) {
  return {
    width: width * pose.scale,
    height: height * pose.scale,
    transform: `translate3d(${pose.x}px, ${pose.y}px, 0) translate(-50%, -50%) rotate(${pose.rotation}deg)`,
    "--sticker-counter-rotation": `${-pose.rotation}deg`,
  };
}

/** Critically damped motion keeps its velocity when the keyboard moves the target. */
export function stepTextStickerSpring(axis: SpringAxis, target: number, elapsedMs: number): SpringAxis {
  const time = Math.max(0, Math.min(64, elapsedMs)) / 1000;
  const frequency = 20;
  const distance = axis.value - target;
  const momentum = axis.velocity + frequency * distance;
  const decay = Math.exp(-frequency * time);
  return {
    value: target + (distance + momentum * time) * decay,
    velocity: (axis.velocity - frequency * momentum * time) * decay,
  };
}
