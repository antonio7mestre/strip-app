import type { ComponentProps } from "react";

/** The footer positions itself. No viewport wrapper or scroll compensation. */
export function DockFooter(props: ComponentProps<"footer">) {
  return <footer {...props} />;
}
