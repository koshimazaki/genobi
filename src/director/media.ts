export function waitFor(
  target: EventTarget,
  event: string,
  ready: () => boolean,
) {
  if (ready()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new Error(`Timed out waiting for ${event}`)),
      15000,
    );
    const success = () => finish();
    const error = () => finish(new Error(`Media failed during ${event}`));
    function finish(error?: Error) {
      clearTimeout(timer);
      target.removeEventListener(event, success);
      target.removeEventListener("error", errorHandler);
      if (error) reject(error);
      else resolve();
    }
    const errorHandler = error;
    target.addEventListener(event, success, { once: true });
    target.addEventListener("error", errorHandler, { once: true });
  });
}
export async function seek(video: HTMLVideoElement, seconds: number) {
  if (Math.abs(video.currentTime - seconds) < 0.0001 && video.readyState >= 2)
    return;
  const settled = waitFor(video, "seeked", () => false);
  video.currentTime = seconds;
  await settled;
}
export function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}
