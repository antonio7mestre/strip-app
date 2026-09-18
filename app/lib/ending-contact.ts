/** Ref cleanup keeps the corner fill tied to real contact, not just block order. */
export function installEndingContact(ending: HTMLElement | null) {
  const canvas = ending?.parentElement;
  if (!ending || !canvas) return;
  let disposed = false;
  const flowBlocks = () => Array.from(canvas.children).filter((element) =>
    element !== ending && element.classList.contains("strip-block") &&
    !element.classList.contains("sticker-block"));
  const update = () => {
    if (disposed) return;
    const last = flowBlocks().at(-1);
    const gap = last ? ending.getBoundingClientRect().top - last.getBoundingClientRect().bottom : Infinity;
    const touching = Number.isFinite(gap) && Math.abs(gap) <= 1;
    ending.toggleAttribute("data-touches-block", touching);
  };
  const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
  const observeBlocks = () => {
    if (disposed) return;
    resize?.disconnect();
    resize?.observe(canvas);
    resize?.observe(ending);
    flowBlocks().forEach(block => resize?.observe(block));
    update();
  };
  const mutations = new MutationObserver(observeBlocks);
  mutations.observe(canvas, { childList: true });
  window.addEventListener("resize", update);
  window.visualViewport?.addEventListener("resize", update);
  observeBlocks();
  return () => {
    disposed = true;
    resize?.disconnect();
    mutations.disconnect();
    window.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("resize", update);
    ending.removeAttribute("data-touches-block");
  };
}
