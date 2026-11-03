import * as T from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { scaledAxes } from "./scene-contract";
import type { Recipe } from "./recipe";
import { applyAvatarPose } from "./avatar-pose";
import { BUILDER_CHARACTER_MODELS } from "./character-catalog";

/** Holodeck's frozen EC Playground, at one tenth scale for the capture stage. */
export async function loadPlayground() {
  const draco = new DRACOLoader().setDecoderPath(
    new URL("./world-assets/draco/", document.baseURI).href,
  );
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const url = (name: string) =>
    new URL(`./world-assets/${name}.glb`, document.baseURI).href;
  const loaded = await Promise.allSettled(
    ["testMap", "vehicles", "AnimationLibrary"].map((n) =>
      loader.loadAsync(url(n)),
    ),
  );
  draco.dispose();
  const roots = loaded.flatMap((r) =>
    r.status === "fulfilled" ? [r.value.scene] : [],
  );
  const dispose = () => {
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>(),
      textures = new Set<T.Texture>();
    for (const root of roots)
      root.traverse((o) => {
        if (o instanceof T.Mesh) {
          geometries.add(o.geometry);
          for (const m of Array.isArray(o.material)
            ? o.material
            : [o.material]) {
            materials.add(m);
            for (const v of Object.values(m))
              if (v instanceof T.Texture) textures.add(v);
          }
          if (o instanceof T.SkinnedMesh) o.skeleton.dispose();
        }
      });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };
  const failed = loaded.find((r) => r.status === "rejected");
  if (failed) {
    dispose();
    throw new Error("Playground assets could not load. Reload to retry.");
  }
  const [map, vehicles, character] = loaded.map(
    (r) =>
      (
        r as PromiseFulfilledResult<
          Awaited<ReturnType<typeof loader.loadAsync>>
        >
      ).value,
  );
  const group = new T.Group();
  roots.push(group);
  const editable = new Map<string, T.Object3D>();
  const base = new Map<string, Recipe["layout"][string]>();
  const colors = ["#cce", "#dcf", "#bcc", "#bcf", "#fce", "#bbe"];
  function mesh(source: T.Object3D, name: string, color = 1) {
    const original = source.getObjectByName(name) as T.Mesh;
    if (!original?.isMesh)
      throw new Error(`Missing playground geometry: ${name}`);
    const material = (original.material as T.MeshStandardMaterial).clone();
    material.color.set(colors[color]);
    material.side = T.FrontSide;
    const result = new T.Mesh(original.geometry, material);
    result.castShadow = result.receiveShadow = true;
    return result;
  }
  function add(
    id: string,
    name: string,
    x = 0,
    y = 0,
    z = 0,
    ry = 0,
    rx = 0,
    color = 1,
  ) {
    const holder = new T.Group(),
      m = mesh(map.scene, name, color);
    m.scale.setScalar(0.1);
    m.rotation.set(rx, ry, 0);
    holder.add(m);
    holder.position.set(x / 10, y / 10, z / 10);
    holder.userData.editId = id;
    group.add(holder);
    editable.set(id, holder);
    base.set(id, { x: x / 10, y: y / 10, z: z / 10, rotation: 0, scale: 1 });
  }
  const floor = mesh(map.scene, "BaseFloor", 0);
  floor.scale.setScalar(0.1);
  floor.position.y = -0.1;
  group.add(floor);
  const disk = mesh(map.scene, "R80Disk", 0);
  disk.scale.setScalar(0.1);
  disk.position.set(0, 10.1, 11);
  group.add(disk);
  for (const [i, angle] of [10, 20, 30, 45].entries())
    add(`ramp-${angle}`, `Ramp${angle}`, 35, 0, -75 - i * 10);
  add("track", "Track");
  add("jump-left", "RampJump", -25);
  add("jump-right", "RampJump", 25, 0, 0, Math.PI);
  add("u-ramp", "RampU", 0, 0, -135);
  add("stairs", "CircleStair");
  add("slope", "CircleSlope", 0, 11.5, 0, 0, Math.PI);
  add("pillar", "Pillar10X100", 0, 50, 110, 0, 0, 0);
  add("box-a", "Box24X24", -35, 0, -75, 0, 0, 2);
  add("box-b", "Box24X24", -35, 0, -105, 0, 0, 3);
  for (const [id, name, x, y, z, angle] of [
    ["car-a", "VehicleBody1", -18, 1, 16, Math.PI * 0.15],
    ["car-b", "VehicleBody4", 16, 1, 20, -Math.PI * 0.2],
    ["drone", "VehicleBody3", 0, 6, 28, 0],
  ] as const) {
    const holder = new T.Group(),
      model = new T.Group();
    model.scale.setScalar(0.1);
    model.rotation.y = angle;
    model.add(mesh(vehicles.scene, name, 2));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const part = mesh(
          vehicles.scene,
          id === "drone" ? "R065Propeller" : "R05Wheel",
          2,
        );
        part.position.set(
          sx * (id === "drone" ? 1.8 : 1.2),
          id === "drone" ? 0.2 : -0.45,
          sz * (id === "drone" ? 1.8 : 1.1),
        );
        if (id !== "drone") part.rotation.z = Math.PI / 2;
        model.add(part);
      }
    holder.add(model);
    holder.position.set(x / 10, y / 10, z / 10);
    holder.userData.editId = id;
    group.add(holder);
    editable.set(id, holder);
    base.set(id, { x: x / 10, y: y / 10, z: z / 10, rotation: 0, scale: 1 });
  }
  character.scene.traverse((o) => {
    if (o instanceof T.Mesh) o.castShadow = o.receiveShadow = true;
  });
  const avatar = new T.Group();
  avatar.add(character.scene);
  const bounds = new T.Box3().setFromObject(character.scene),
    height = bounds.max.y - bounds.min.y;
  const humanHeight = BUILDER_CHARACTER_MODELS.mannequin.height;
  character.scene.scale.setScalar(humanHeight / height);
  character.scene.position.y = (-bounds.min.y * humanHeight) / height;
  const mixer = new T.AnimationMixer(character.scene);
  // Every authored clip plays at weight zero; `pose` weights the requested one.
  const actions = new Map(
    character.animations.map((clip) => {
      const action = mixer.clipAction(clip);
      action.setEffectiveWeight(0).play();
      return [clip.name, action] as const;
    }),
  );
  if (!actions.has("Idle_Loop") || !actions.has("Walk_Loop"))
    throw new Error("Missing mannequin idle or walk clip.");
  return {
    group,
    avatar,
    editable,
    base,
    dispose,
    configure(recipe: Recipe) {
      group.visible = recipe.scene === "playground";
      avatar.visible = recipe.avatar && recipe.scene !== "neuro";
      character.scene.visible = recipe.avatarAsset === "mannequin";
      applyAvatarPose(avatar, recipe.avatarPose);
      for (const [id, o] of editable) {
        const p = recipe.layout[id] ?? base.get(id)!;
        o.position.set(p.x, p.y, p.z);
        o.rotation.set(p.rotationX ?? 0, p.rotation, p.rotationZ ?? 0);
        o.scale.set(...scaledAxes(p));
      }
    },
    /**
     * Sample one authored clip (falling back to idle) at `time` seconds.
     * `hold` plays it once and keeps its last frame instead of looping.
     */
    /** Seconds in one authored clip (idle when the clip is unknown). */
    duration: (clip: string) =>
      (actions.get(clip) ?? actions.get("Idle_Loop")!).getClip().duration,
    pose(time: number, clip: string, hold = false) {
      const chosen = actions.has(clip) ? clip : "Idle_Loop";
      for (const [name, action] of actions)
        action.setEffectiveWeight(name === chosen ? 1 : 0);
      const length = actions.get(chosen)!.getClip().duration;
      mixer.setTime(hold ? Math.min(time, length * 0.999) : time);
    },
  };
}
export type Playground = Awaited<ReturnType<typeof loadPlayground>>;
