type ThemeColorLease = { owners: number; name: string | null };
const suspendedThemes = new WeakMap<HTMLElement, ThemeColorLease>();

/** Let page paint reach Safari's glass while overlapping screens hand off.
 * One screen leaving must not restore the tint while another still owns it. */
export function suspendThemeColor(theme: HTMLElement | null = document.getElementById("strip-theme-color")) {
  if (!theme) return () => {};
  const lease = suspendedThemes.get(theme) ?? { owners: 0, name: theme.getAttribute("name") };
  lease.owners++;
  suspendedThemes.set(theme, lease);
  theme.removeAttribute("name");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lease.owners > 0) return;
    suspendedThemes.delete(theme);
    // Keep the latest content color and respect any newer explicit owner.
    if (lease.name && !theme.hasAttribute("name")) theme.setAttribute("name", lease.name);
  };
}
