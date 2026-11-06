import type { ComponentProps, CSSProperties, ReactNode } from "react";

/** Instagram keeps bottom controls inside one top-anchored viewport layer.
 * Its captured pixel height cannot resize with the browser's first scroll.
 * The pill is positioned within that layer, not by WebKit's scrolling bottom
 * constraint. Other browsers retain their existing fixed-footer layout. */
export function DockViewport({ children, layer }: { children: ReactNode; layer?: number }) {
  return <div className="dock-viewport" style={layer ? { "--dock-viewport-layer": layer } as CSSProperties : undefined}>{children}</div>;
}

export function DockFooter(props: ComponentProps<"footer">) {
  return <DockViewport><footer {...props} /></DockViewport>;
}
