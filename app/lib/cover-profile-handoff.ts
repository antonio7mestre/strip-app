/** One backdrop fades the complete outgoing profile. Freeze its visible
 * loading/reveal effects so no late photo or staggered card fights that fade. */
export function freezeCoverProfile(profile: HTMLElement | null) {
  if (!profile) return () => {};
  const visible = [...profile.querySelectorAll<HTMLElement>(
    ".library-card, .library-cover-image img, .library-cover-placeholder, .library-card-skeleton, .library-add-button",
  )].filter(element => {
    const box = element.getBoundingClientRect();
    return box.bottom > 0 && box.top < window.innerHeight;
  });
  // Read the whole batch before writing, avoiding repeated layout flushes.
  const snapshots = visible.map(element => ({ element,
    opacity: getComputedStyle(element).opacity,
    before: ["opacity", "animation", "transition"].map(name =>
      [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]),
  }));
  for (const { element, opacity } of snapshots) {
    element.style.setProperty("opacity", opacity, "important");
    element.style.setProperty("animation", "none", "important");
    element.style.setProperty("transition", "none", "important");
  }
  return () => {
    for (const { element, before } of snapshots) for (const [name, value, priority] of before) {
      if (value) element.style.setProperty(name, value, priority);
      else element.style.removeProperty(name);
    }
  };
}

/** Keep the document's native scroll container intact. Changing root overflow
 * to hidden makes Safari expand its chrome on a scrolled public profile. */
export function lockCoverInput(host: HTMLElement) {
  const prevent = (event: Event) => event.preventDefault();
  const key = (event: KeyboardEvent) => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey &&
      ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) event.preventDefault();
  };
  host.addEventListener("touchmove", prevent, { passive: false });
  document.addEventListener("wheel", prevent, { passive: false });
  document.addEventListener("keydown", key);
  return () => {
    host.removeEventListener("touchmove", prevent);
    document.removeEventListener("wheel", prevent);
    document.removeEventListener("keydown", key);
  };
}
