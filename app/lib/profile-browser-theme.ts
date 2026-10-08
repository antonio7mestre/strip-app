// Loading and loaded profile surfaces briefly overlap during React's handoff.
// Keep Safari sampling the white toolbar until both owners have released it.
const toolbarOwners = new Set<symbol>();

export function retainProfileBrowserTheme() {
  const theme = document.getElementById("strip-theme-color");
  const owner = Symbol();
  toolbarOwners.add(owner);
  theme?.removeAttribute("name");
  return () => {
    toolbarOwners.delete(owner);
    if (!toolbarOwners.size) theme?.setAttribute("name", "theme-color");
  };
}
