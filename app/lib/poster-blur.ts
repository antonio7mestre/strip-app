/** Three separable box passes approximate a Gaussian without canvas filter support.
 * The poster uses an opaque, quarter-size raster, so this stays small on phones. */
export function blurPosterPixels(data: Uint8ClampedArray, width: number, height: number, sigma: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      data.length !== width * height * 4 || !Number.isFinite(sigma) || sigma < 0) {
    throw new Error("Invalid poster blur raster");
  }
  if (sigma === 0) return;
  const ideal = Math.sqrt(4 * sigma * sigma + 1);
  const lower = Math.max(1, Math.floor(ideal) - (Math.floor(ideal) % 2 === 0 ? 1 : 0));
  const upper = lower + 2;
  const smallPasses = Math.max(0, Math.min(3, Math.round(
    (12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4),
  )));
  const scratch = new Uint8ClampedArray(data.length);
  const axis = (source: Uint8ClampedArray, target: Uint8ClampedArray, radius: number, horizontal: boolean) => {
    const length = horizontal ? width : height, lines = horizontal ? height : width;
    const stride = horizontal ? 4 : width * 4, divisor = 2 * radius + 1;
    for (let line = 0; line < lines; line++) {
      const base = horizontal ? line * width * 4 : line * 4;
      for (let channel = 0; channel < 4; channel++) {
        const start = base + channel;
        let sum = 0;
        for (let offset = -radius; offset <= radius; offset++) {
          sum += source[start + Math.max(0, Math.min(length - 1, offset)) * stride];
        }
        for (let position = 0; position < length; position++) {
          target[start + position * stride] = sum / divisor;
          sum += source[start + Math.min(length - 1, position + radius + 1) * stride] -
            source[start + Math.max(0, position - radius) * stride];
        }
      }
    }
  };
  for (let pass = 0; pass < 3; pass++) {
    const radius = ((pass < smallPasses ? lower : upper) - 1) / 2;
    axis(data, scratch, radius, true);
    axis(scratch, data, radius, false);
  }
}
