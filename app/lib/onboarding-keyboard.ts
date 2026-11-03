/** Keep the writing canvas at the visible screen origin. Safari can pan its
 * visual viewport even with overflow hidden and focus({ preventScroll: true }).
 * Only the available writing space and floating action follow keyboard height;
 * the header, input origin and full-height background never reflow with it. */
export function installOnboardingKeyboard(screen: HTMLElement) {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let width = window.innerWidth;
  let height = Math.max(window.innerHeight, viewport?.height ?? 0);
  const properties = ["--onboarding-layout-height", "--onboarding-visible-height", "--onboarding-viewport-top"];
  root.classList.add("onboarding-writing-active");

  const sync = () => {
    // A pinch zoom is intentional, not a keyboard pan to cancel.
    if (viewport && Math.abs(viewport.scale - 1) > .02) return;
    const visibleHeight = viewport?.height ?? window.innerHeight;
    if (window.innerWidth !== width) {
      width = window.innerWidth;
      height = Math.max(window.innerHeight, visibleHeight);
    } else {
      height = Math.max(height, window.innerHeight, visibleHeight);
    }
    screen.style.setProperty("--onboarding-layout-height", `${height}px`);
    screen.style.setProperty("--onboarding-visible-height", `${Math.min(height, visibleHeight)}px`);
    screen.style.setProperty("--onboarding-viewport-top", `${Math.max(0, viewport?.offsetTop ?? 0)}px`);
  };
  sync();
  viewport?.addEventListener("resize", sync);
  viewport?.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);
  return () => {
    viewport?.removeEventListener("resize", sync);
    viewport?.removeEventListener("scroll", sync);
    window.removeEventListener("resize", sync);
    root.classList.remove("onboarding-writing-active");
    properties.forEach(name => screen.style.removeProperty(name));
  };
}
