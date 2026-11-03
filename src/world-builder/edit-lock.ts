/** Playback requests and async edit holds own independent parts of the lock. */
export function createEditLock(apply: (locked: boolean) => void) {
  let requested = false;
  let holds = 0;
  const sync = () => apply(requested || holds > 0);
  return {
    set(locked: boolean) {
      requested = locked;
      sync();
    },
    hold() {
      holds++;
      sync();
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        holds--;
        sync();
      };
    },
  };
}

/** Loading owns one idempotent edit hold, independent from playback/capture. */
export function createLoadingEditLock(
  hold: () => (() => void) | undefined,
  report: (loading: boolean) => void,
) {
  let active = false,
    release: (() => void) | undefined;
  return {
    get active() {
      return active;
    },
    set(value: boolean, publish = true) {
      if (value && !active) release = hold();
      active = value;
      if (!value) {
        release?.();
        release = undefined;
      }
      if (publish) report(value);
    },
  };
}
