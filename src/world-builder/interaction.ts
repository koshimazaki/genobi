import type { WorldControl } from "../../shared/world-control";
import { cameraAt } from "./recipe";
import type { WalkState } from "./walk-motion";
import type { CharacterPose } from "../../shared/scene/characters";
import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { Octree } from "three/addons/math/Octree.js";
import { createWalker } from "./walking";
import type { Playground } from "./playground";
import { readAvatarPose } from "./avatar-pose";
import { createEditLock } from "./edit-lock";
import type { Recipe } from "./recipe";
import type { SceneVector } from "./scene-state";
import type { SceneCameraPose } from "./scene-camera-blend";
import { createShotCameraGesture } from "./shot-camera-gesture";
export type Tool = "translate" | "rotate" | "scale";
export type Mode = "shot" | "edit" | "walk";
export function createInteraction(
  canvas: HTMLCanvasElement,
  world: T.Scene,
  camera: T.PerspectiveCamera,
  props: T.Group,
  stage: T.Group,
  playground: Playground,
  render: () => void,
  getRecipe: () => Recipe,
  patch: (p: Partial<Recipe>) => void,
  onWalk: (time: number, state: WalkState) => void = () => {},
  onCamera: (pose: SceneCameraPose) => void = () => {},
) {
  const orbit = new OrbitControls(camera, canvas),
    gizmo = new TransformControls(camera, canvas);
  const helper = gizmo.getHelper();
  world.add(helper);
  orbit.enabled = true;
  gizmo.enabled = false;
  orbit.minDistance = 0.1;
  orbit.maxDistance = Infinity;
  const ray = new T.Raycaster(),
    pointer = new T.Vector2(),
    down = new T.Vector2(),
    keys = new Set<string>();
  let mode: Mode = "shot",
    editsLocked = false,
    selected = "",
    frame = 0,
    last = 0,
    time = 0,
    dragged = false;
  const cameraPose = (): SceneCameraPose => ({
    position: camera.position.toArray() as SceneVector,
    target: orbit.target.toArray() as SceneVector,
    fov: camera.fov,
  });
  const cameraGesture = createShotCameraGesture({
    isShot: () => mode === "shot",
    allowed: () => !editsLocked,
    read: cameraPose,
    restore: (pose) => {
      camera.position.set(...pose.position);
      orbit.target.set(...pose.target);
      camera.fov = pose.fov;
      camera.lookAt(orbit.target);
      camera.updateProjectionMatrix();
    },
    commit: onCamera,
    render,
  });
  const cancelCameraGesture = () => {
    if (!cameraGesture.active) return;
    // reset() also ends OrbitControls' internal pointer state. A released hold
    // must not resume the cancelled drag before the old pointer-up arrives.
    orbit.saveState();
    orbit.reset();
    cameraGesture.cancel();
  };
  const editLock = createEditLock((locked) => {
    editsLocked = locked;
    if (locked) cancelCameraGesture();
    if (locked && gizmo.dragging) {
      gizmo.reset();
      gizmo.dragging = false;
      gizmo.axis = null;
    }
    gizmo.enabled = mode === "edit" && !locked;
    orbit.enabled = mode === "walk" || (!locked && !gizmo.dragging);
  });
  let input: WorldControl | undefined,
    inputUntil = 0;
  let cameraMode: "follow" | "orbit" | "shot" = "follow";
  let cameraStart = 0;
  let jumpUntil = 0,
    actionUntil = 0;
  let action: CharacterPose | undefined;
  let restart = false;
  let walker: ReturnType<typeof createWalker> | undefined;
  const dir = new T.Vector3(),
    forward = new T.Vector3(),
    right = new T.Vector3(),
    old = new T.Vector3();
  const avatarPose = () => {
    return readAvatarPose(playground.avatar);
  };
  const meshes = () => [
    ...props.children,
    ...(getRecipe().scene === "playground" ? playground.editable.values() : []),
  ];
  function attach() {
    if (gizmo.dragging) return;
    if (mode === "edit") {
      const object = meshes().find((m) => m.userData.editId === selected);
      if (object && gizmo.object !== object) gizmo.attach(object);
      if (!object) gizmo.detach();
    } else gizmo.detach();
  }
  function commit() {
    const object = gizmo.object,
      r = getRecipe();
    if (!object || editsLocked) return;
    const value = {
      x: T.MathUtils.clamp(object.position.x, -40, 40),
      y: T.MathUtils.clamp(object.position.y, -40, 40),
      z: T.MathUtils.clamp(object.position.z, -40, 40),
      rotation: Math.atan2(
        Math.sin(object.rotation.y),
        Math.cos(object.rotation.y),
      ),
      scale: 1,
      scaleX: T.MathUtils.clamp(object.scale.x, 0.1, 8),
      scaleY: T.MathUtils.clamp(object.scale.y, 0.1, 8),
      scaleZ: T.MathUtils.clamp(object.scale.z, 0.1, 8),
      rotationX: Math.atan2(
        Math.sin(object.rotation.x),
        Math.cos(object.rotation.x),
      ),
      rotationZ: Math.atan2(
        Math.sin(object.rotation.z),
        Math.cos(object.rotation.z),
      ),
    };
    if (playground.editable.has(selected))
      patch({ layout: { ...r.layout, [selected]: value } });
    else
      patch({
        objects: r.objects.map((p) =>
          `prop:${p.id}` === selected ? { ...p, ...value } : p,
        ),
      });
  }
  function tick(now: number) {
    if (mode !== "walk") return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    time += dt;
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();
    dir.set(0, 0, 0);
    if (keys.has("KeyW") || keys.has("ArrowUp")) dir.add(forward);
    if (keys.has("KeyS") || keys.has("ArrowDown")) dir.sub(forward);
    if (keys.has("KeyD") || keys.has("ArrowRight")) dir.add(right);
    if (keys.has("KeyA") || keys.has("ArrowLeft")) dir.sub(right);
    if (input && time < inputUntil) {
      dir.addScaledVector(right, input.move?.[0] ?? 0);
      dir.addScaledVector(forward, input.move?.[1] ?? 0);
    } else input = undefined;
    const running =
      keys.has("ShiftLeft") || keys.has("ShiftRight") || !!input?.running;
    dir.clampLength(0, 1);
    old.copy(playground.avatar.position);
    playground.avatar.position.copy(walker!.step(dt, dir, running));
    if (dir.lengthSq()) playground.avatar.rotation.y = Math.atan2(dir.x, dir.z);
    old.sub(playground.avatar.position);
    camera.position.sub(old);
    if (cameraMode === "orbit") {
      const offset = camera.position.clone().sub(playground.avatar.position);
      offset.applyAxisAngle(camera.up, dt * 0.35);
      camera.position.copy(playground.avatar.position).add(offset);
    } else if (cameraMode === "shot") {
      camera.position.set(
        ...cameraAt(
          getRecipe(),
          Math.min(
            getRecipe().frames - 1,
            (time - cameraStart) * getRecipe().fps,
          ),
        ),
      );
    }
    orbit.target.copy(playground.avatar.position).y += 0.9;
    playground.pose(time, dir.lengthSq() > 0 ? "Walk_Loop" : "Idle_Loop");
    onWalk(time, {
      moving: dir.lengthSq() > 0,
      running,
      jumping: time < jumpUntil,
      action: time < actionUntil ? action : undefined,
      restart,
    });
    restart = false;
    orbit.update();
    render();
    frame = requestAnimationFrame(tick);
  }
  const keydown = (e: KeyboardEvent) => {
    if (
      mode !== "walk" ||
      document.activeElement !== canvas ||
      ![
        "Space",
        "Digit1",
        "Digit2",
        "Digit3",
        "ShiftLeft",
        "ShiftRight",
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(e.code)
    )
      return;
    e.preventDefault();
    if (e.code === "Space") {
      if (!e.repeat) api.action("jump");
    } else if (e.code.startsWith("Digit")) {
      if (!e.repeat)
        api.action(
          e.code === "Digit1"
            ? "ninja"
            : e.code === "Digit2"
              ? "spell"
              : "backflip",
        );
    } else keys.add(e.code);
  };
  const keyup = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const blur = () => keys.clear();
  const pointerdown = (e: PointerEvent) => {
    canvas.focus();
    down.set(e.clientX, e.clientY);
    dragged = false;
  };
  const click = (e: MouseEvent) => {
    if (
      mode !== "edit" ||
      dragged ||
      gizmo.axis ||
      down.distanceTo(new T.Vector2(e.clientX, e.clientY)) > 4
    )
      return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    let object: T.Object3D | undefined = ray.intersectObjects(meshes(), true)[0]
      ?.object;
    while (object && !object.userData.editId)
      object = object.parent ?? undefined;
    api.select(object?.userData.editId ?? "");
  };
  orbit.addEventListener("start", cameraGesture.start);
  orbit.addEventListener("change", cameraGesture.change);
  orbit.addEventListener("end", cameraGesture.end);
  gizmo.addEventListener("change", render);
  gizmo.addEventListener("dragging-changed", (e) => {
    orbit.enabled = !e.value && !editsLocked;
    if (e.value) dragged = true;
  });
  gizmo.addEventListener("mouseUp", commit);
  canvas.addEventListener("pointerdown", pointerdown);
  canvas.addEventListener("click", click);
  canvas.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  canvas.addEventListener("blur", blur);
  window.addEventListener("blur", blur);
  const api = {
    /** Match the inspector's pause-to-edit rule, including an in-flight drag. */
    lockEdits(locked: boolean) {
      editLock.set(locked);
    },
    /** An async guarded edit stays locked even if playback is stopped meanwhile. */
    holdEdits: editLock.hold,
    control(next: WorldControl) {
      if (mode !== "walk") api.setMode("walk");
      input = next;
      inputUntil = time + next.seconds;
      if (next.camera) {
        cameraMode = next.camera;
        cameraStart = time;
      }
      if (next.action) api.action(next.action);
    },
    stop() {
      input = undefined;
      keys.clear();
      cameraMode = "follow";
      actionUntil = jumpUntil = 0;
    },
    state() {
      return {
        mode,
        position: playground.avatar.position.toArray(),
        yaw: playground.avatar.rotation.y,
        camera: camera.position.toArray(),
        cameraMode,
        moving: dir.lengthSq() > 0,
        action:
          time < jumpUntil ? "backflip" : time < actionUntil ? action : null,
      };
    },
    action(pose: CharacterPose) {
      if (mode !== "walk") return;
      if (pose === "jump") {
        if (walker?.jump()) {
          jumpUntil = time + 1.1;
          restart = true;
        }
      } else {
        action = pose;
        actionUntil = time + (pose === "ninja" ? 4 : 2);
        restart = true;
      }
    },
    onMode: (_mode: Mode) => {},
    get mode() {
      return mode;
    },
    /** A live transform is not a committed recipe edit yet. */
    get dragging() {
      return gizmo.dragging || cameraGesture.active;
    },
    cancelCameraGesture,
    onSelect: (_id: string) => {},
    get selection() {
      return selected;
    },
    select(id: string) {
      selected = id;
      attach();
      api.onSelect(id);
      render();
    },
    setTool(tool: Tool) {
      gizmo.setMode(tool);
      gizmo.showX = gizmo.showY = gizmo.showZ = true;
      render();
    },
    refresh(target?: readonly [number, number, number]) {
      attach();
      if (mode === "shot")
        orbit.target.set(
          ...(target ??
            ([
              getRecipe().targetX,
              getRecipe().targetY,
              getRecipe().targetZ,
            ] as const)),
        );
    },
    /** `report: false` leaves saving a walk's position to the caller. */
    setMode(next: Mode, report = true) {
      if (next === mode) return;
      cancelCameraGesture();
      const wasWalk = mode === "walk";
      mode = next;
      api.onMode(next);
      actionUntil = jumpUntil = 0;
      api.stop();
      cancelAnimationFrame(frame);
      last = 0;
      if (wasWalk && report) patch({ avatarPose: avatarPose() });
      orbit.enabled = next === "walk" || !editsLocked;
      orbit.enablePan = next !== "walk";
      orbit.minDistance = next === "shot" ? 0.1 : 2;
      orbit.maxDistance = next === "shot" ? Infinity : 60;
      gizmo.enabled = next === "edit" && !editsLocked;
      attach();
      if (next === "walk") {
        const collision = new T.Group();
        // Clones share geometry; only the temporary transform hierarchy is built.
        if (getRecipe().scene === "playground") {
          collision.add(playground.group.clone(true));
          collision.add(props.clone(true));
        } else collision.add(stage.clone(true));
        collision.updateMatrixWorld(true);
        walker = createWalker(
          new Octree().fromGraphNode(collision),
          playground.avatar.position.clone(),
        );
        orbit.target.copy(playground.avatar.position).y += 0.9;
        camera.position.copy(orbit.target).add(new T.Vector3(0, 2, 5));
        orbit.update();
        canvas.focus();
        frame = requestAnimationFrame(tick);
      }
      render();
    },
    /**
     * Freeze the viewport (after a live orbit, follow, walk or Build orbit) as
     * the shot camera and return to Shot. The returned patch carries that
     * framing and, from Walk, the character's position; nothing is applied
     * until the caller configures it, so a capture can apply it first.
     */
    freeze(): Partial<Recipe> {
      const frozen: Partial<Recipe> = api.viewPatch();
      if (mode === "walk") frozen.avatarPose = avatarPose();
      api.setMode("shot", false);
      return frozen;
    },
    /** Exact current view for a paired scene/camera key; no orbit clamps. */
    cameraPose,
    viewPatch(): Partial<Recipe> {
      const v = camera.position.clone().sub(orbit.target),
        r = v.length();
      return {
        fov: T.MathUtils.clamp(camera.fov, 15, 100),
        targetX: T.MathUtils.clamp(orbit.target.x, -40, 40),
        targetY: T.MathUtils.clamp(orbit.target.y, -5, 15),
        targetZ: T.MathUtils.clamp(orbit.target.z, -40, 40),
        radius: T.MathUtils.clamp(r, 2, 60),
        azimuth: T.MathUtils.radToDeg(Math.atan2(v.x, v.z)),
        elevation: T.MathUtils.clamp(
          T.MathUtils.radToDeg(Math.asin(v.y / r)),
          -60,
          80,
        ),
      };
    },
    dispose() {
      cancelAnimationFrame(frame);
      orbit.dispose();
      gizmo.dispose();
      world.remove(helper);
      canvas.removeEventListener("pointerdown", pointerdown);
      canvas.removeEventListener("click", click);
      canvas.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      canvas.removeEventListener("blur", blur);
      window.removeEventListener("blur", blur);
    },
  };
  return api;
}
