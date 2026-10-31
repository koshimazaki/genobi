/** Frame/cycle calculation is independent of display refresh rate. */
export function previewPosition(
  elapsed: number,
  frames: number,
  loop: boolean,
) {
  const tick = Math.max(0, Math.floor(elapsed * 24));
  return {
    frame: loop ? tick % frames : Math.min(frames - 1, tick),
    cycle: loop ? Math.floor(tick / frames) : 0,
    done: !loop && tick >= frames,
  };
}

/** One Play preview on the take's frame grid, free of React and the DOM. */
export interface PreviewLoop {
  frames(): number;
  loop(): boolean;
  /** False the moment Stop is pressed, before React's effect cleanup runs. */
  active(): boolean;
  /** The set is reloading under a live edit: skip this frame, keep playing. */
  held(): boolean;
  draw(frame: number): Promise<void> | void;
  /** Rewind attached audio to the start of the take. */
  restartAudio(): void;
  /** A single pass reached its last frame. */
  finish(): void;
  fail(error: unknown): void;
  /** Optional media clock: loading or stalled audio must hold its picture. */
  elapsed?: () => number;
  now?: () => number;
  request?: (tick: () => void) => number;
  cancel?: (id: number) => void;
}

/** Starts the preview clock at frame zero; the returned function ends it. */
export function runPreview(p: PreviewLoop) {
  const now = p.now ?? (() => performance.now()),
    request = p.request ?? ((tick) => requestAnimationFrame(tick)),
    cancel = p.cancel ?? ((id) => cancelAnimationFrame(id)),
    start = now();
  let stopped = false,
    animation = 0,
    cycle = 0;
  const live = () => !stopped && p.active();
  p.restartAudio();
  async function tick() {
    // A tick queued before Stop must not draw over a capture that follows it.
    if (!live()) return;
    const position = previewPosition(
      p.elapsed?.() ?? (now() - start) / 1000,
      p.frames(),
      p.loop(),
    );
    if (position.cycle !== cycle) {
      cycle = position.cycle;
      p.restartAudio();
    }
    try {
      if (!p.held()) await p.draw(position.frame);
    } catch (e) {
      if (live()) p.fail(e);
      return;
    }
    if (position.done) return p.finish();
    if (live()) animation = request(() => void tick());
  }
  void tick();
  return () => {
    stopped = true;
    cancel(animation);
  };
}

/**
 * Stop Play, let the frame it is drawing land, then run work that needs the
 * scene to itself. Capture then renders its own deterministic grid from frame
 * zero, so pressing it mid-preview takes the whole take, not the remainder.
 */
export async function stopPreviewThen<T>(
  preview: { playing(): boolean; stop(): void; settle(): Promise<unknown> },
  work: () => Promise<T>,
) {
  if (preview.playing()) {
    preview.stop();
    await preview.settle().catch(() => {});
  }
  return work();
}

/**
 * After a set change, show frame zero, unless Play is running: a live edit
 * (the Sound tab's routing) must not snap the preview back to the start, and
 * the preview's next tick draws the right frame with the new set.
 */
export async function rewindUnlessPlaying(
  playing: boolean,
  setFrame: (frame: number) => void,
  render: (frame: number) => unknown,
  frame = 0,
) {
  if (playing) return;
  setFrame(frame);
  await render(frame);
}
