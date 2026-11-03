import { MathUtils, Spherical, Vector3 } from "three";
import {
  cameraAt,
  cameraFovAt,
  cameraTargetAt,
  parameterSchema,
  type Recipe,
} from "./recipe";
import type { createInteraction } from "./interaction";
import type { SceneCameraPose } from "./scene-camera-blend";
import type { SceneVector } from "./scene-state";
import { createEditLock } from "./edit-lock";
import { shotCameraPatch } from "./shot-camera-edit";

/** Camera-only controls for the honest geometry fallback; no Build/Walk emulation. */
export function createGeometryCamera(
  canvas: HTMLCanvasElement,
  getRecipe: () => Recipe,
  getFrame: () => number,
  redraw: () => void,
  commit: (patch: Partial<Recipe>, frame?: number) => void,
) {
  const originalTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = "none";
  let locked = false;
  let view: SceneCameraPose | undefined;
  let drag:
    { x: number; y: number; pan: boolean; changed: boolean } | undefined;
  const lock = createEditLock((value) => {
    locked = value;
    if (value && drag) {
      drag = undefined;
      view = undefined;
    }
  });
  const pose = (): SceneCameraPose =>
    view ?? {
      position: [...cameraAt(getRecipe(), getFrame())] as SceneVector,
      target: [...cameraTargetAt(getRecipe(), getFrame())] as SceneVector,
      fov: cameraFovAt(getRecipe(), getFrame()),
    };
  const finish = () => {
    const saved = view;
    view = undefined;
    drag = undefined;
    if (saved)
      commit(shotCameraPatch(getRecipe(), getFrame(), saved), getFrame());
  };
  const down = (event: PointerEvent) => {
    if (locked || ![0, 1, 2].includes(event.button)) return;
    canvas.focus();
    view = structuredClone(pose());
    drag = {
      x: event.clientX,
      y: event.clientY,
      pan: event.button !== 0 || event.shiftKey,
      changed: false,
    };
    canvas.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (locked || !drag || !view) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y,
      height = Math.max(1, canvas.getBoundingClientRect().height);
    if (!dx && !dy) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.changed = true;
    const target = new Vector3(...view.target),
      position = new Vector3(...view.position),
      offset = position.clone().sub(target);
    if (drag.pan) {
      const forward = offset.clone().normalize().negate();
      const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0));
      if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
      right.normalize();
      const up = new Vector3().crossVectors(right, forward).normalize();
      const scale =
        (2 * offset.length() * Math.tan(MathUtils.degToRad(view.fov / 2))) /
        height;
      const shift = right
        .multiplyScalar(-dx * scale)
        .addScaledVector(up, dy * scale);
      target.add(shift);
      position.add(shift);
    } else {
      const spherical = new Spherical().setFromVector3(offset);
      spherical.theta -= (dx * Math.PI * 2) / height;
      spherical.phi = MathUtils.clamp(
        spherical.phi - (dy * Math.PI * 2) / height,
        0.02,
        Math.PI - 0.02,
      );
      position.copy(target).add(new Vector3().setFromSpherical(spherical));
    }
    view = {
      ...view,
      position: position.toArray() as SceneVector,
      target: target.toArray() as SceneVector,
    };
    redraw();
  };
  const up = (event: PointerEvent) => {
    if (!drag) return;
    const changed = drag.changed;
    canvas.releasePointerCapture?.(event.pointerId);
    if (changed) finish();
    else {
      drag = undefined;
      view = undefined;
    }
  };
  const cancel = () => {
    drag = undefined;
    view = undefined;
    redraw();
  };
  const wheel = (event: WheelEvent) => {
    if (locked) return;
    event.preventDefault();
    view = structuredClone(pose());
    const target = new Vector3(...view.target),
      offset = new Vector3(...view.position).sub(target);
    offset.setLength(
      MathUtils.clamp(
        offset.length() * Math.exp(event.deltaY * 0.001),
        parameterSchema.radius.min,
        parameterSchema.radius.max,
      ),
    );
    view.position = target.add(offset).toArray() as SceneVector;
    redraw();
    finish();
  };
  const context = (event: MouseEvent) => event.preventDefault();
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextmenu", context);
  const unsupported = () => {
    throw new Error("Build and Walk require WebGL.");
  };
  const editor: ReturnType<typeof createInteraction> = {
    cancelCameraGesture: cancel,
    lockEdits: lock.set,
    holdEdits: lock.hold,
    control: unsupported,
    stop: () => {},
    action: unsupported,
    state: () => ({
      mode: "shot",
      position: [0, 0, 0],
      yaw: 0,
      camera: pose().position,
      cameraMode: "shot",
      moving: false,
      action: null,
    }),
    onMode: () => {},
    mode: "shot",
    get dragging() {
      return !!drag?.changed;
    },
    onSelect: () => {},
    selection: "",
    select: () => {},
    setTool: unsupported,
    refresh: () => {},
    setMode: (next) => {
      if (next !== "shot") unsupported();
    },
    freeze: () => shotCameraPatch(getRecipe(), getFrame(), pose()),
    cameraPose: () => structuredClone(pose()),
    viewPatch: () => shotCameraPatch(getRecipe(), getFrame(), pose()),
    dispose: () => {
      canvas.style.touchAction = originalTouchAction;
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", context);
    },
  };
  return {
    editor,
    reset: () => {
      view = undefined;
      drag = undefined;
    },
    previewRecipe: (recipe: Recipe): Recipe =>
      view
        ? {
            ...recipe,
            cameraMotion: {
              version: 1,
              enabled: true,
              keys: [
                { id: "camera-preview", frame: 0, easing: "linear", ...view },
              ],
              audio: {
                enabled: false,
                source: "sub",
                amount: 0,
                motion: "push",
              },
            },
          }
        : recipe,
  };
}
