const INITIAL_CUE_DELAY = 650;
const BOTTOM_CUE_DELAY = 800;
const CUE_DURATION = 480;
const BOTTOM_THRESHOLD = 24;
const REARM_DISTANCE = 160;

/** A visual invitation only. Never click, focus, vibrate or change form state. */
export function installLandingStartCue(button: HTMLElement) {
  let initialTimer = 0, bottomTimer = 0, finishTimer = 0, scrollFrame = 0;
  const distanceFromBottom = () => Math.max(0,
    (document.scrollingElement ?? document.documentElement).scrollHeight -
      Math.max(0, window.scrollY) - window.innerHeight);
  let atBottom = distanceFromBottom() <= BOTTOM_THRESHOLD;
  const stop = () => {
    window.clearTimeout(initialTimer);
    window.clearTimeout(bottomTimer);
    window.clearTimeout(finishTimer);
    initialTimer = bottomTimer = finishTimer = 0;
    delete button.dataset.cursorCue;
  };
  const play = () => {
    window.clearTimeout(initialTimer);
    initialTimer = 0;
    if (button.dataset.cursorCue) return;
    button.dataset.cursorCue = "click";
    finishTimer = window.setTimeout(() => {
      finishTimer = 0;
      delete button.dataset.cursorCue;
    }, CUE_DURATION);
  };
  const measure = () => {
    scrollFrame = 0;
    const distance = distanceFromBottom();
    if (bottomTimer && distance > BOTTOM_THRESHOLD) {
      window.clearTimeout(bottomTimer);
      bottomTimer = 0;
      atBottom = false;
    }
    if (distance > REARM_DISTANCE) atBottom = false;
    else if (distance <= BOTTOM_THRESHOLD && !atBottom) {
      atBottom = true;
      window.clearTimeout(initialTimer);
      initialTimer = 0;
      // Let the scroll settle before inviting a tap. Leaving cancels the cue.
      bottomTimer = window.setTimeout(() => {
        bottomTimer = 0;
        if (distanceFromBottom() <= BOTTOM_THRESHOLD) play();
        else atBottom = false;
      }, BOTTOM_CUE_DELAY);
    }
  };
  const onScroll = () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(measure);
  };
  // The live tray enables this cue only after its rise completes, preserving
  // the initial delay without remounting the button or its native input.
  initialTimer = window.setTimeout(play, INITIAL_CUE_DELAY);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  button.addEventListener("pointerdown", stop);
  button.addEventListener("keydown", stop);
  return () => {
    stop();
    window.cancelAnimationFrame(scrollFrame);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    button.removeEventListener("pointerdown", stop);
    button.removeEventListener("keydown", stop);
  };
}
