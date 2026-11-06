/** Sample decoded, presented pixels rather than trusting loadeddata alone.
 * Keep one stable tray color, and stop observing as soon as it is available. */
export function observeVideoTrayColor(
  video: HTMLVideoElement,
  sample: (video: HTMLVideoElement) => string | null,
  onColor: (color: string) => void,
) {
  let disposed = false;
  let attempts = 0;
  let videoFrame: number | null = null;
  let paintFrame: number | null = null;
  const events = ["loadeddata", "canplay", "playing", "seeked", "timeupdate"];

  function dispose() {
    disposed = true;
    if (videoFrame !== null) video.cancelVideoFrameCallback(videoFrame);
    if (paintFrame !== null) cancelAnimationFrame(paintFrame);
    videoFrame = paintFrame = null;
    events.forEach(event => video.removeEventListener(event, queue));
  }

  function read() {
    if (disposed || video.readyState < 2) return false;
    const color = sample(video);
    if (!color) {
      // An unreadable external source must not keep sampling every frame.
      if (++attempts >= 12) dispose();
      return false;
    }
    dispose();
    onColor(color);
    return true;
  }

  function queue() {
    if (disposed || video.readyState < 2) return;
    if (video.requestVideoFrameCallback && videoFrame === null) {
      videoFrame = video.requestVideoFrameCallback(() => {
        videoFrame = null;
        if (!read()) queue();
      });
    }
    // A cached, paused video may not submit another frame. Give its existing
    // bitmap two paint frames; later readiness events retry an unreadable one.
    if ((!video.requestVideoFrameCallback || video.paused) && paintFrame === null) {
      paintFrame = requestAnimationFrame(() => {
        paintFrame = requestAnimationFrame(() => {
          paintFrame = null;
          read();
        });
      });
    }
  }

  events.forEach(event => video.addEventListener(event, queue));
  queue();
  return dispose;
}
