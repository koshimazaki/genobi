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
