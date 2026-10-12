export type SpringAxis = { value: number; velocity: number };

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
