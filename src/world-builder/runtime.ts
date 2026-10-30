import * as T from "three";
import { orbitPosition } from "./prop-orbit";
import { createSceneMedia } from "./scene-media";
import { geometryFor } from "./geometry";
import { faces, scaledAxes } from "./scene-contract";
import { loadPlayground, type Playground } from "./playground";
import { createInteraction } from "./interaction";
import {
  cameraAt,
  cameraTargetAt,
  validateRecipe,
  type Recipe,
} from "./recipe";
import { applyAvatarPose } from "./avatar-pose";
import { avatarPoseAt } from "./avatar-path";
import { modOf, modsAt, NO_MODS } from "./mod-routes";
import { applyAvatarMods, createWorldMods } from "./mod-apply";
import { vertexShader, fragmentShader } from "./neuro";
import { createBuilderCharacter } from "./character";
import { createDepthPass } from "./depth-pass";
import {
  loopedMotionAt,
  loopedShaderSpeed,
  loopedSpin,
  loopPeriod,
} from "./loop";
import { CHARACTER_MODELS } from "../../shared/scene/character-catalog";

export function createWorld(
  canvas: HTMLCanvasElement,
  onEdit: (patch: Partial<Recipe>) => void,
) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const world = new T.Scene(),
    camera = new T.PerspectiveCamera(55, 1, 0.05, 600);
  const stage = new T.Group(),
    props = new T.Group();
  world.add(stage);
  const character = createBuilderCharacter(world, () =>
    renderer.render(world, camera),
  );
  stage.add(props);
  const key = new T.DirectionalLight("#fff4d7", 2);
  key.position.set(-8, 20, 12);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {
    left: -20,
    right: 20,
    top: 20,
    bottom: -20,
    near: 0.1,
    far: 70,
  });
  key.shadow.normalBias = 0.02;
  const fill = new T.HemisphereLight("#d8e9ff", "#2c2430", 1);
  stage.add(key, fill);
  const floor = new T.Mesh(
    new T.PlaneGeometry(70, 70),
    new T.MeshStandardMaterial({ color: "#303b46", roughness: 0.9 }),
  );
  floor.receiveShadow = true;
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.8;
  stage.add(floor);
  const grid = new T.GridHelper(40, 40, "#7b8e9a", "#45525d");
  grid.position.y = -0.79;
  stage.add(grid);
  const screenMaterial = new T.MeshBasicMaterial({
    color: "#212b38",
    side: T.DoubleSide,
  });
  const screen = new T.Mesh(new T.PlaneGeometry(8, 4.5), screenMaterial);
  screen.position.set(0, 2.6, -4);
  stage.add(screen);
  const shader = new T.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: T.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      u_time: { value: 0 },
      u_resolution: { value: new T.Vector2() },
      u_pixelRatio: { value: 1 },
      u_colorFront: { value: new T.Vector4(1, 0.5, 0, 1) },
      u_colorMid: { value: new T.Vector4(0.5, 0, 1, 1) },
      u_colorBack: { value: new T.Vector4(0, 0, 0.1, 1) },
      u_brightness: { value: 0.2 },
      u_contrast: { value: 0.3 },
      u_scale: { value: 0.13 },
      u_intensity: { value: 1 },
      u_enableBloom: { value: false },
      u_bloomIntensity: { value: 0 },
    },
  });
  const sky = new T.Mesh(new T.SphereGeometry(250, 64, 32), shader);
  world.add(sky);
  const depthPass = createDepthPass();
  let playground: Playground | undefined;
  // Audio routes to the character move this rig, not the avatar itself.
  const avatarRig = new T.Group();
  const worldMods = createWorldMods();
  let editor: ReturnType<typeof createInteraction> | undefined;
  const media = createSceneMedia();
  const loaded = loadPlayground().then((asset) => {
    if (disposed) {
      asset.dispose();
      return;
    }
    playground = asset;
    world.add(asset.group, asset.avatar);
    avatarRig.add(...asset.avatar.children, character.root);
    asset.avatar.add(avatarRig);
    asset.configure(recipe);
    bindSurfaces();
    editor = createInteraction(
      canvas,
      world,
      camera,
      props,
      stage,
      asset,
      () => renderer.render(world, camera),
      () => recipe,
      onEdit,
      (time, state) => character.walk(recipe, time, state),
    );
    editor.refresh();
  });
  // renderFrame reports loading failures; avoid an unhandled rejection on teardown.
  void loaded.catch(() => {});
  let recipe: Recipe,
    objectSignature = "",
    disposed = false,
    // A capture owns the canvas: the stopped preview never draws over a frame.
    capturing = false;
  function bindSurfaces() {
    screenMaterial.map = media.texture("screen/all") ?? null;
    screenMaterial.color.set(screenMaterial.map ? "#ffffff" : "#212b38");
    screenMaterial.needsUpdate = true;
    for (const [id, holder] of playground?.editable ?? []) {
      holder.traverse((o) => {
        if (!(o instanceof T.Mesh)) return;
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material]) {
          if (!(material instanceof T.MeshStandardMaterial)) continue;
          if (!("baseMap" in material.userData)) {
            material.userData.baseMap = material.map;
            material.userData.baseColor = material.color.clone();
          }
          material.map =
            media.texture(`world:${id}/all`) ?? material.userData.baseMap;
          material.color.copy(
            media.has(`world:${id}/all`)
              ? new T.Color("white")
              : material.userData.baseColor,
          );
          material.needsUpdate = true;
        }
      });
    }
    for (const mesh of props.children as T.Mesh<
      T.BufferGeometry,
      T.MeshStandardMaterial[]
    >[]) {
      const id = mesh.userData.editId;
      mesh.material.forEach((mat, i) => {
        mat.map =
          media.texture(`${id}/${faces[i] ?? "all"}`) ??
          media.texture(`${id}/all`) ??
          null;
        mat.needsUpdate = true;
      });
    }
  }
  function clearProps() {
    for (const child of [...props.children]) {
      const mesh = child as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial[]>;
      mesh.geometry.dispose();
      mesh.material.forEach((m) => m.dispose());
      props.remove(child);
    }
  }
  function configure(input: Recipe) {
    recipe = validateRecipe(input);
    if (canvas.width !== recipe.width || canvas.height !== recipe.height)
      renderer.setSize(recipe.width, recipe.height, false);
    camera.aspect = recipe.width / recipe.height;
    camera.fov = recipe.fov;
    camera.updateProjectionMatrix();
    world.background = new T.Color(recipe.background);
    stage.visible = recipe.scene !== "neuro";
    floor.visible = grid.visible = recipe.scene === "stage";
    screen.visible = recipe.scene === "stage" && recipe.screen !== false;
    sky.visible = recipe.scene === "neuro";
    const position =
      editor?.mode === "walk" ? playground?.avatar.position.clone() : undefined;
    const yaw = playground?.avatar.rotation.y;
    playground?.configure(recipe);
    if (position && playground) {
      playground.avatar.position.copy(position);
      playground.avatar.rotation.y = yaw!;
    }
    const signature = JSON.stringify(
      recipe.objects.map((p) => [p.id, p.shape]),
    );
    if (signature !== objectSignature) {
      clearProps();
      objectSignature = signature;
      for (const p of recipe.objects) {
        const geometry = geometryFor(p.shape);
        if (!geometry.groups.length)
          geometry.addGroup(
            0,
            geometry.index?.count ?? geometry.getAttribute("position").count,
            0,
          );
        const materialCount = Math.max(
          1,
          ...geometry.groups.map((g) => (g.materialIndex ?? 0) + 1),
        );
        const materials = Array.from(
          { length: materialCount },
          () =>
            new T.MeshStandardMaterial({
              color: p.color,
              roughness: 0.45,
              metalness: 0.15,
              side: p.shape === "plane" ? T.DoubleSide : T.FrontSide,
            }),
        );
        const mesh = new T.Mesh(geometry, materials);
        mesh.userData.editId = `prop:${p.id}`;
        mesh.castShadow = mesh.receiveShadow = true;
        props.add(mesh);
      }
    }
    media.retain(new Set(Object.keys(recipe.textures)));
    bindSurfaces();
  }
  function draw(frame: number) {
    if (disposed) throw new Error("Scene was closed.");
    const seconds = frame / recipe.fps,
      // Build hides audio offsets so they are never baked into transforms.
      mods = editor?.mode === "edit" ? NO_MODS : modsAt(recipe, frame),
      period = loopPeriod(recipe);
    if (!editor || editor.mode === "shot") {
      camera.position.set(...cameraAt(recipe, frame));
      camera.lookAt(...cameraTargetAt(recipe, frame));
    }
    // A path moves the character over the take; Build shows and edits its
    // start, and Walk drives the character itself.
    if (playground && recipe.avatarPath && editor?.mode !== "walk")
      applyAvatarPose(
        playground.avatar,
        editor?.mode === "edit"
          ? recipe.avatarPose
          : avatarPoseAt(recipe, frame),
      );
    // The key light keeps the single route's ×3 so migrated recipes match.
    key.intensity = recipe.light + modOf(mods, ["light:key"], "light") * 3;
    fill.intensity = 1 + modOf(mods, ["light:fill"], "light");
    props.children.forEach((mesh, i) => {
      const p = recipe.objects[i];
      const targets = ["primitives", `prop:${p.id}`];
      const glow = modOf(mods, targets, "glow");
      // Build edits the prop where it stands; Shot and Walk move it on its orbit.
      const [x, z] =
        editor?.mode === "edit"
          ? [p.x, p.z]
          : orbitPosition(p, seconds, recipe.loop ? period : undefined);
      mesh.position.set(x, p.y + modOf(mods, targets, "height"), z);
      const pulse = 1 + modOf(mods, targets, "scale");
      mesh.scale.set(
        ...(scaledAxes(p).map((v) => v * pulse) as [number, number, number]),
      );
      mesh.rotation.set(
        p.rotationX ?? 0,
        (p.rotation ?? 0) +
          (editor?.mode === "edit"
            ? 0
            : (recipe.loop ? loopedSpin(p.spin, period) : p.spin) * seconds) +
          modOf(mods, targets, "spin"),
        p.rotationZ ?? 0,
      );
      const materials = (
        mesh as T.Mesh<T.BufferGeometry, T.MeshStandardMaterial[]>
      ).material;
      materials.forEach((mat) => {
        mat.color.set(mat.map ? "#ffffff" : p.color);
        mat.emissive.set(glow ? p.color : "#000000");
        mat.emissiveIntensity = glow;
      });
    });
    if (playground) worldMods(playground, recipe, mods);
    applyAvatarMods(avatarRig, mods);
    shader.uniforms.u_time.value =
      seconds *
      (recipe.loop ? loopedShaderSpeed(recipe.speed, period) : recipe.speed);
    shader.uniforms.u_scale.value =
      recipe.patternScale * (1 + modOf(mods, ["neuro"], "scale"));
    shader.uniforms.u_intensity.value =
      recipe.intensity + modOf(mods, ["neuro"], "light");
    poseCharacters(frame);
    editor?.refresh();
    renderer.render(world, camera);
    return canvas;
  }
  // The mannequin is the playground avatar: sample the recipe's moves on
  // the take's frame grid, not always idle, so a "walk" take actually walks.
  function poseCharacters(frame: number) {
    const clipName = (clip: string) =>
      CHARACTER_MODELS.mannequin.clips[
        clip as keyof typeof CHARACTER_MODELS.mannequin.clips
      ] ?? "Idle_Loop";
    const move = loopedMotionAt(recipe, frame, (clip) =>
      playground ? playground.duration(clipName(clip)) : 0,
    );
    playground?.pose(move.time, clipName(move.clip), move.hold);
    if (editor?.mode !== "walk") character.sample(recipe, frame);
  }
  /**
   * The stopped preview in Shot and Build: pose the characters at `frame` of
   * the recipe's motion and redraw, leaving the camera, props and shader where
   * the last drawn frame put them. Captures still draw every frame through
   * `renderFrame`, so this never reaches a take.
   */
  function previewPose(frame: number) {
    if (disposed || capturing || !recipe || !playground) return;
    if (editor?.mode !== "shot" && editor?.mode !== "edit") return;
    poseCharacters(frame);
    renderer.render(world, camera);
  }
  async function renderFrame(frame: number) {
    await loaded;
    if (disposed) throw new Error("Scene was closed.");
    await character.prepare(recipe);
    await media.seek(frame, recipe.fps);
    return draw(frame);
  }
  /** The same frame as `renderFrame`, drawn as linear depth on the same canvas. */
  async function renderDepthFrame(frame: number) {
    await renderFrame(frame);
    depthPass.render(
      renderer,
      world,
      camera,
      { near: recipe.depthNear, far: recipe.depthFar },
      [grid, sky],
    );
    return canvas;
  }
  async function setMedia(blob: Blob, target = "screen/all") {
    await media.load(target, blob);
  }
  return {
    get editor() {
      return editor;
    },
    getLayout(id: string) {
      return recipe.layout[id] ?? playground?.base.get(id);
    },
    configure,
    prepareCharacter: (r: Recipe) => character.prepare(r),
    beginCapture: () => {
      capturing = true;
      character.freeze();
    },
    endCapture: () => {
      capturing = false;
      character.thaw();
    },
    appearance: () =>
      recipe.avatar && recipe.avatarAsset === "blob"
        ? character.appearance()
        : undefined,
    renderFrame,
    renderDepthFrame,
    previewPose,
    setMedia,
    clearMedia(target = "screen/all") {
      media.clear(target);
      bindSurfaces();
    },
    assertMedia() {
      media.assertReady(Object.keys(recipe.textures));
      character.assertReady(recipe);
    },
    dispose() {
      disposed = true;
      depthPass.dispose();
      character.dispose();
      media.dispose();
      editor?.dispose();
      if (playground) {
        world.remove(playground.group, playground.avatar);
        playground.dispose();
      }
      clearProps();
      world.traverse((o) => {
        if (o instanceof T.Mesh || o instanceof T.LineSegments) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          materials.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
    },
  };
}
export type WorldRuntime = ReturnType<typeof createWorld>;
