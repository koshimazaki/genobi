import type { DirectorRenderer } from "./renderer";
export interface Playback {
  cancel: () => void;
  done: Promise<void>;
}
export function play(
  renderer: DirectorRenderer,
  start: number,
  onFrame: (frame: number) => void,
  destination?: AudioNode,
  loop: () => boolean = () => false,
): Playback {
  let cancelled = false;
  const { fps, durationFrames } = renderer.bundle.project.composition;
  const done = (async () => {
    await renderer.resume();
    await renderer.render(start);
    if (cancelled) return;
    let epoch = renderer.audio.currentTime + 0.05;
    let offset = start;
    renderer.scheduleAudio(start, epoch, destination);
    let previous = -1;
    try {
      while (!cancelled) {
        const frame =
          offset +
          Math.max(0, Math.floor((renderer.audio.currentTime - epoch) * fps));
        if (frame >= durationFrames) {
          if (loop()) {
            epoch += (durationFrames - offset) / fps;
            offset = 0;
            const elapsed = Math.max(
              0,
              Math.floor((renderer.audio.currentTime - epoch) * fps),
            );
            epoch +=
              (Math.floor(elapsed / durationFrames) * durationFrames) / fps;
            const skipped = elapsed % durationFrames;
            renderer.scheduleAudio(skipped, epoch + skipped / fps, destination);
            previous = -1;
            continue;
          }
          await renderer.render(durationFrames - 1);
          onFrame(durationFrames - 1);
          break;
        }
        if (frame !== previous) {
          await renderer.render(frame);
          onFrame(frame);
          previous = frame;
        }
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      }
    } finally {
      renderer.stopAudio();
    }
  })();
  return {
    cancel() {
      cancelled = true;
      renderer.stopAudio();
    },
    done,
  };
}
