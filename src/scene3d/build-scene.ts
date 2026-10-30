/**
 * Build a scene spec into Three.js groups. Primitives come from the spec;
 * the acoustic room reuses AKUSPACE's own `buildRoom` and room dimensions
 * from `src/scene/akuspace`, so the room matches Acoustic Space.
 */
import * as THREE from "three";
import { buildRoom } from "../scene/akuspace/room-geometry.js";
import { DISPLAY_DIMENSIONS } from "../scene/akuspace/scene-layout.js";
import type { SceneMaterial } from "../../shared/scene/types";
import type { SceneColour, ScenePrimitive, SceneSpec } from "./scenes";
import { disposeMaterial } from "./material-resources";
import { characterGroup } from "./characters";

export type ThemeColour = (token: string) => THREE.Color;

export interface BuiltScene {
  root: THREE.Group;
  hero: THREE.Group;
  background: THREE.Color;
  animate(seconds: number): void;
}

const TOKENS: Record<SceneColour, string> = {
  subject: "--scene-subject",
  accent: "--scene-accent",
  dark: "--scene-dark",
  acoustic: "--acoustic",
  glass: "--scene-glass",
};

/**
 * How a material changes a primitive's theme colour: tile is glossy, carpet
 * rough and darker, glass see-through, metal metallic. The colour token
 * stays the primitive's, so scenes follow the theme.
 */
const LOOK: Record<
  SceneMaterial,
  { roughness: number; metalness: number; shade: number; opacity?: number }
> = {
  tile: { roughness: 0.22, metalness: 0, shade: 1.1 },
  concrete: { roughness: 0.95, metalness: 0, shade: 0.9 },
  plaster: { roughness: 0.9, metalness: 0, shade: 1.05 },
  wood: { roughness: 0.7, metalness: 0, shade: 0.85 },
  carpet: { roughness: 1, metalness: 0, shade: 0.6 },
  curtain: { roughness: 0.95, metalness: 0, shade: 0.75 },
  glass: { roughness: 0.05, metalness: 0, shade: 1.2, opacity: 0.32 },
  metal: { roughness: 0.32, metalness: 0.85, shade: 1 },
};

function surface(p: ScenePrimitive, tint: THREE.Color) {
  if (!p.material)
    return {
      color: tint,
      roughness: p.colour === "accent" ? 0.55 : 0.85,
      metalness: p.colour === "accent" ? 0.15 : 0,
    };
  const look = LOOK[p.material];
  return {
    color: tint.clone().multiplyScalar(look.shade),
    roughness: look.roughness,
    metalness: look.metalness,
    ...(look.opacity === undefined
      ? {}
      : { transparent: true, opacity: look.opacity, depthWrite: false }),
  };
}

function geometry(p: ScenePrimitive): THREE.BufferGeometry {
  const [x, y] = p.size;
  switch (p.shape) {
    case "box":
      return new THREE.BoxGeometry(...p.size);
    case "sphere":
      return new THREE.SphereGeometry(x, 32, 20);
    case "cylinder":
      return new THREE.CylinderGeometry(x, x, y, 40);
    case "cone":
      return new THREE.ConeGeometry(x, y, 32);
    case "icosahedron":
      return new THREE.IcosahedronGeometry(x, 0);
    case "torusKnot":
      return new THREE.TorusKnotGeometry(x * 0.7, x * 0.22, 140, 20);
  }
}

function primitive(p: ScenePrimitive, colour: ThemeColour): THREE.Mesh {
  const tint = colour(TOKENS[p.colour]);
  const mesh = new THREE.Mesh(
    geometry(p),
    new THREE.MeshStandardMaterial({
      ...surface(p, tint),
      ...(p.glow ? { emissive: tint, emissiveIntensity: 2.2 } : {}),
    }),
  );
  mesh.position.set(...p.position);
  mesh.rotation.y = p.rotationY ?? 0;
  if (p.shape === "cone" && p.hero) mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function lights(root: THREE.Group, colour: ThemeColour, scale: number) {
  const hemisphere = new THREE.HemisphereLight(
    colour("--scene-sky"),
    colour("--scene-ground"),
    1.9,
  );
  const key = new THREE.DirectionalLight(colour("--scene-light"), 2.6);
  key.position.set(-4 * scale, 8 * scale, 6 * scale);
  const rim = new THREE.PointLight(colour("--scene-emissive"), 18, 30 * scale);
  rim.position.set(3 * scale, 3 * scale, -5 * scale);
  root.add(hemisphere, key, rim);
}

export function buildScene(spec: SceneSpec, colour: ThemeColour): BuiltScene {
  const root = new THREE.Group();
  const hero = new THREE.Group();
  hero.position.set(spec.subject[0], 0, spec.subject[2]);
  root.add(hero);
  const characters = characterGroup(spec);
  root.add(characters.group);
  for (const p of spec.objects) {
    const mesh = primitive(p, colour);
    if (p.hero) {
      mesh.position.x -= spec.subject[0];
      mesh.position.z -= spec.subject[2];
      hero.add(mesh);
    } else root.add(mesh);
  }
  lights(root, colour, spec.scale);
  const content = spec.content;
  if (content.kind === "primitives") {
    // A room's floor box is the ground; a plane at its top would flicker.
    if (!spec.objects.some((p) => p.role === "floor")) {
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(content.ground, content.ground),
        new THREE.MeshStandardMaterial({
          color: colour("--scene-ground"),
          roughness: 1,
        }),
      );
      ground.rotation.x = -Math.PI / 2;
      root.add(ground);
    }
    const grid = new THREE.GridHelper(
      content.ground / 2,
      30,
      colour("--scene-grid-major"),
      colour("--scene-grid-minor"),
    );
    grid.position.y = 0.005;
    root.add(grid);
    return {
      root,
      hero,
      background: colour("--sunken"),
      animate: characters.sample,
    };
  }
  const [width, length, height] = DISPLAY_DIMENSIONS[content.room];
  const dark = colour("--sunken");
  buildRoom(root, width, length, height, colour("--acoustic"), dark, false);
  return {
    root,
    hero,
    background: dark.clone().multiplyScalar(0.18),
    animate: characters.sample,
  };
}

/** Release every geometry and material under `group`. */
export function disposeGroup(group: THREE.Object3D) {
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh instanceof THREE.SkinnedMesh) mesh.skeleton.dispose();
    const material = mesh.material;
    const materials = Array.isArray(material)
      ? material
      : material
        ? [material]
        : [];
    for (const m of materials) disposeMaterial(m);
  });
}

export interface SceneSnapshot {
  scene: THREE.Scene;
  hero: THREE.Group;
  dispose(): void;
  animate(seconds: number): void;
}

/**
 * A standalone copy of `spec` for one capture: its own objects, materials
 * and colours, resolved once now. Changing the preview's scene or the theme
 * while a playblast renders cannot reach it, so the clip matches its receipt.
 */
export function snapshotScene(
  spec: SceneSpec,
  colour: ThemeColour,
): SceneSnapshot {
  const built = buildScene(spec, colour);
  const scene = new THREE.Scene();
  scene.add(built.root);
  scene.background = built.background;
  return {
    scene,
    hero: built.hero,
    animate: built.animate,
    dispose: () => disposeGroup(built.root),
  };
}
