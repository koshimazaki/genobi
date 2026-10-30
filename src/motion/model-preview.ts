import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AsciiEffect } from "three/examples/jsm/effects/AsciiEffect.js";

/** Local, self-contained GLB only. No provider call or remote asset fetch. */
export async function modelPreview(file: File) {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (!url.startsWith("blob:") && !url.startsWith("data:"))
      throw new Error("Use a self-contained GLB with embedded textures.");
    return url;
  });
  const gltf = await new GLTFLoader(manager).parseAsync(
    await file.arrayBuffer(),
    "",
  );
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#10160d");
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const size = Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
  const centered = new THREE.Group();
  centered.add(gltf.scene);
  const pivot = new THREE.Group();
  pivot.add(centered);
  scene.add(pivot, new THREE.HemisphereLight(0xdfffb7, 0x383047, 3));
  const light = new THREE.DirectionalLight(0xffffff, 4);
  light.position.set(3, 5, 4);
  scene.add(light);
  const camera = new THREE.PerspectiveCamera(
    32,
    1000 / 550,
    0.001,
    Math.max(100, size * 100),
  );
  camera.position.set(0, size * 0.08, Math.max(0.1, size * 2));
  camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(1000, 550);
  renderer.setPixelRatio(1);
  renderer.domElement.setAttribute(
    "aria-label",
    "Local 3D character turntable",
  );
  renderer.domElement.style.cssText =
    "width:100%;height:100%;object-fit:contain";
  const element = document.createElement("div");
  element.style.cssText = "width:1000px;height:550px;position:relative";
  const effect = new AsciiEffect(renderer, " .:-+*=%@#", { invert: true });
  effect.setSize(1000, 550);
  effect.domElement.style.cssText = "color:#d5ff70;background:#10160d";
  let ascii = false;
  element.append(renderer.domElement);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const clip =
    gltf.animations.find((item) => /^idle[_ -]?loop$/i.test(item.name)) ??
    gltf.animations.find((item) => !/pose|rest/i.test(item.name)) ??
    gltf.animations[0];
  if (clip) mixer.clipAction(clip).play();
  return {
    element,
    setAscii(value: boolean) {
      ascii = value;
      element.replaceChildren(ascii ? effect.domElement : renderer.domElement);
    },
    render(ms: number, duration: number, reduced = false) {
      mixer.setTime(reduced ? 0 : ms / 1000);
      centered.position.set(0, 0, 0);
      pivot.rotation.y = 0;
      scene.updateMatrixWorld(true);
      bounds.setFromObject(gltf.scene);
      centered.position
        .copy(bounds.getCenter(new THREE.Vector3()))
        .multiplyScalar(-1);
      pivot.rotation.y = reduced ? 0 : (ms / duration) * Math.PI * 2;
      if (ascii) effect.render(scene, camera);
      else renderer.render(scene, camera);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(gltf.scene);
      scene.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.geometry.dispose();
        const materials = Array.isArray(node.material)
          ? node.material
          : [node.material];
        materials.forEach((material) => {
          Object.values(material).forEach((value) => {
            if (value instanceof THREE.Texture) value.dispose();
          });
          material.dispose();
        });
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
