import type { SceneCameraPose } from "./scene-camera-blend";

/** A gesture is tentative until its end; an async owner may cancel it first. */
export function createShotCameraGesture({
  isShot,
  allowed,
  read,
  restore,
  commit,
  render,
}: {
  isShot(): boolean;
  allowed(): boolean;
  read(): SceneCameraPose;
  restore(pose: SceneCameraPose): void;
  commit(pose: SceneCameraPose): void;
  render(): void;
}) {
  let start: SceneCameraPose | undefined;
  return {
    get active() {
      return start !== undefined;
    },
    start() {
      if (isShot() && allowed()) start = read();
    },
    change() {
      if (!isShot() || allowed()) render();
    },
    end() {
      const before = start;
      start = undefined;
      if (!before || !isShot() || !allowed()) return;
      const after = read();
      if (
        Math.abs(after.fov - before.fov) > 1e-9 ||
        after.position.some(
          (value, i) => Math.abs(value - before.position[i]) > 1e-9,
        ) ||
        after.target.some(
          (value, i) => Math.abs(value - before.target[i]) > 1e-9,
        )
      )
        commit(after);
    },
    cancel() {
      const before = start;
      start = undefined;
      if (before) restore(before);
    },
  };
}
