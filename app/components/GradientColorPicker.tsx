"use client";

import { useEffect, useState, type KeyboardEvent, type PointerEvent } from "react";

export function hslToHex(hue: number, lightness: number) {
  const l = lightness / 100;
  const chroma = 1 - Math.abs(2 * l - 1);
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
  let red = 0, green = 0, blue = 0;
  if (segment < 1) [red, green, blue] = [chroma, secondary, 0];
  else if (segment < 2) [red, green, blue] = [secondary, chroma, 0];
  else if (segment < 3) [red, green, blue] = [0, chroma, secondary];
  else if (segment < 4) [red, green, blue] = [0, secondary, chroma];
  else if (segment < 5) [red, green, blue] = [secondary, 0, chroma];
  else [red, green, blue] = [chroma, 0, secondary];
  const match = l - chroma / 2;
  return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function hexPosition(hex: string) {
  const [red, green, blue] = hex.slice(1).match(/.{2}/g)!.map((part) => parseInt(part, 16) / 255);
  const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue), delta = maximum - minimum;
  let hue = 0;
  if (delta) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const lightness = (maximum + minimum) / 2;
  return { hue, lightness: lightness * 100,
    saturation: delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)) };
}

/** One surface and gesture model for editor, shape and profile colors. */
export function GradientColorPicker({ color, onChange, label, visible = true }: {
  color: string; onChange: (color: string) => void; label: string; visible?: boolean;
}) {
  const decoded = hexPosition(color);
  const [lastHue, setLastHue] = useState(decoded.hue);
  const hue = decoded.saturation > 0 ? decoded.hue : lastHue;
  useEffect(() => { if (decoded.saturation > 0) setLastHue(decoded.hue); }, [decoded.hue, decoded.saturation]);
  const change = (nextHue: number, lightness: number) => {
    setLastHue(nextHue);
    onChange(hslToHex(nextHue, lightness));
  };
  const sample = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    change(x * 360, (1 - y) * 100);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextHue = hue, lightness = decoded.lightness;
    if (event.key === "ArrowLeft") nextHue -= 5;
    else if (event.key === "ArrowRight") nextHue += 5;
    else if (event.key === "ArrowUp") lightness += 5;
    else if (event.key === "ArrowDown") lightness -= 5;
    else return;
    event.preventDefault();
    change((nextHue + 360) % 360, Math.min(100, Math.max(0, lightness)));
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="full-gradient-picker" role="slider" tabIndex={visible ? 0 : -1}
    aria-label={label} aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={Math.round(decoded.lightness)} aria-valuetext={color}
    onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); sample(event); }}
    onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) sample(event); }}
    onPointerUp={release} onPointerCancel={release} onKeyDown={onKeyDown}>
    <span className="gradient-picker-value" style={{
      left: `${Math.min(94, Math.max(6, hue / 360 * 100))}%`,
      top: `${Math.min(72, Math.max(28, 100 - decoded.lightness))}%`, backgroundColor: color,
    }} aria-hidden="true" />
  </div>;
}
