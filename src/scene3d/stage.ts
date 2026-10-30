/**
 * The 3D section's renderer: one Three.js scene, a preview camera on the
 * visible canvas, and a separate capture renderer for playblasts so the
 * preview keeps its size while a clip renders. Plain Three.js, no loop of
 * its own: the panel decides when a frame is drawn.
 */
import * as THREE from "three";
import type { CameraPathPose } from "../../shared/camera-path";
import {
  buildScene,
  disposeGroup,
  snapshotScene,
  type BuiltScene,
} from "./build-scene";
import type { ObjectPose } from "./gestures";
import type { SceneSpec } from "./scenes";

export interface Capture {
  canvas: HTMLCanvasElement;
  render(pose: CameraPathPose, object: ObjectPose, seconds?: number): void;
  dispose(): void;
}

function point(camera: THREE.PerspectiveCamera, pose: CameraPathPose) {
  camera.position.set(...pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(...pose.target);
  camera.rotateZ((pose.roll * Math.PI) / 180);
  if (camera.fov !== pose.fov) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}

export function createStage(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 400);
  let built: BuiltScene | null = null;
  let spec: SceneSpec | null = null;
  let last: {
    pose: CameraPathPose;
    object: ObjectPose;
    seconds: number;
  } | null = null;

  const colour = (token: string) =>
    new THREE.Color(getComputedStyle(canvas).getPropertyValue(token).trim());

  function apply(hero: THREE.Group | undefined, object: ObjectPose) {
    if (!hero) return;
    hero.rotation.y = object.spin;
    hero.position.y = object.lift;
  }

  function render(pose: CameraPathPose, object: ObjectPose, seconds = 0) {
    last = { pose, object, seconds };
    if (!built) return;
    built.animate(seconds);
    apply(built.hero, object);
    point(camera, pose);
    renderer.render(scene, camera);
  }

  function load(next: SceneSpec) {
    if (built) {
      scene.remove(built.root);
      disposeGroup(built.root);
    }
    spec = next;
    built = buildScene(next, colour);
    scene.add(built.root);
    scene.background = built.background;
    if (last) render(last.pose, last.object, last.seconds);
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (last) render(last.pose, last.object, last.seconds);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  return {
    load,
    render,
    /** Rebuild with the current theme's colours. */
    retheme: () => spec && load(spec),
    /**
     * A capture renders its own snapshot of `scene`, never the preview's
     * objects, so later scene or theme changes do not leak into the clip.
     */
    capture(source: SceneSpec, width: number, height: number): Capture {
      const snapshot = snapshotScene(source, colour);
      const target = document.createElement("canvas");
      target.width = width;
      target.height = height;
      const offscreen = new THREE.WebGLRenderer({
        canvas: target,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      offscreen.setPixelRatio(1);
      offscreen.setSize(width, height, false);
      offscreen.outputColorSpace = THREE.SRGBColorSpace;
      const view = new THREE.PerspectiveCamera(38, width / height, 0.05, 400);
      return {
        canvas: target,
        render(pose, object, seconds = 0) {
          snapshot.animate(seconds);
          apply(snapshot.hero, object);
          point(view, pose);
          offscreen.render(snapshot.scene, view);
        },
        dispose() {
          snapshot.dispose();
          offscreen.dispose();
          offscreen.forceContextLoss();
        },
      };
    },
    dispose() {
      observer.disconnect();
      if (built) disposeGroup(built.root);
      renderer.dispose();
    },
  };
}

export type Stage = ReturnType<typeof createStage>;
