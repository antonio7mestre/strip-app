import type { ComponentProps, CSSProperties, ReactNode } from "react";

/** Instagram keeps bottom controls inside one top-anchored viewport layer.
 * The layer follows the visual viewport's bottom without resizing the pill
 * or inheriting Safari toolbar compensation. Other browsers retain their
 * existing fixed-footer layout. */
export function DockViewport({ children, layer }: { children: ReactNode; layer?: number }) {
  return <div className="dock-viewport" style={layer ? { "--dock-viewport-layer": layer } as CSSProperties : undefined}>{children}</div>;
}

export function DockFooter(props: ComponentProps<"footer">) {
  return <DockViewport><footer {...props} /></DockViewport>;
}
