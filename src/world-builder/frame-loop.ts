/** The part of a window an animation loop needs. */
export interface FrameWindow {
  requestAnimationFrame(step: (now: number) => void): number;
  cancelAnimationFrame(id: number): void;
  addEventListener(
    type: "pagehide",
    listener: () => void,
    options: { once: boolean },
  ): void;
  closed?: boolean;
}

/**
 * An animation loop that follows its element between windows: each frame is
 * scheduled on the window `where()` names (a popped-out Document PiP window,
 * or the page). A frame pending on a window that then closes never fires, so
 * when that window hides the loop moves back to `home` and carries on.
 */
export function frameLoop(
  step: (now: number) => void,
  where: () => FrameWindow,
  home: FrameWindow,
) {
  let on = home,
    id = 0,
    stopped = false;
  const watched = new Set<FrameWindow>();
  const run = (now: number) => {
    if (stopped) return;
    step(now);
    if (!stopped) schedule(where());
  };
  function schedule(target: FrameWindow) {
    on = target.closed ? home : target;
    id = on.requestAnimationFrame(run);
    if (on === home || watched.has(on)) return;
    const away = on;
    watched.add(away);
    away.addEventListener(
      "pagehide",
      () => {
        watched.delete(away);
        if (stopped || on !== away) return;
        try {
          away.cancelAnimationFrame(id);
        } catch {
          // A closing window may refuse; its frame will not fire anyway.
        }
        schedule(home);
      },
      { once: true },
    );
  }
  schedule(where());
  return () => {
    stopped = true;
    on.cancelAnimationFrame(id);
  };
}
