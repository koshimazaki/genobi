/** Original AKUSPACE RoomScene; geometry and animation retained. Theme and lifecycle adapted. */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getCameraView, getDisplayDimensions } from "./scene-layout.js";
import { buildDualDelay, buildOutside, buildRoom } from "./room-geometry.js";

export class RoomScene {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    const css = globalThis.getComputedStyle(canvas);
    this.theme = (name) => new THREE.Color(css.getPropertyValue(name).trim());
    this.reduced = false;
    this.visible = !globalThis.document.hidden;
    this.compact = Boolean(options.compact);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    const cameraView = getCameraView(this.compact);
    this.camera = new THREE.PerspectiveCamera(cameraView.fov, 1, 0.1, 100);
    this.camera.position.set(...cameraView.position);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = cameraView.minDistance;
    this.controls.maxDistance = cameraView.maxDistance;
    this.controls.target.set(...cameraView.target);

    this.root = new THREE.Group();
    this.room = new THREE.Group();
    this.waveGroup = new THREE.Group();
    this.atmosphere = new THREE.Group();
    this.root.add(this.room, this.waveGroup, this.atmosphere);
    this.scene.add(this.root);

    this.source = this.createSource();
    this.listener = this.createListener();
    this.root.add(this.source, this.listener);

    this.hemisphere = new THREE.HemisphereLight(
      this.theme("--scene-sky"),
      this.theme("--scene-ground"),
      1.7,
    );
    this.key = new THREE.DirectionalLight(this.theme("--scene-light"), 2.6);
    this.key.position.set(4, 7, 4);
    this.rim = new THREE.PointLight(this.theme("--acoustic"), 12, 24);
    this.rim.position.set(-4, 3, -3);
    this.scene.add(this.hemisphere, this.key, this.rim);

    this.clock = new THREE.Clock();
    this.running = true;
    this.resizeObserver = new globalThis.ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.controls.addEventListener("change", this.renderStatic);
    this.animate();
  }

  createSource() {
    const group = new THREE.Group();
    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.2, 3),
      new THREE.MeshStandardMaterial({
        color: this.theme("--acoustic"),
        emissive: this.theme("--acoustic"),
        emissiveIntensity: 2.4,
        roughness: 0.2,
      }),
    );
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 24, 24),
      new THREE.MeshBasicMaterial({
        color: this.theme("--acoustic"),
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
      }),
    );
    group.add(orb, halo);
    return group;
  }

  createListener() {
    // Same standing figure geometry as Camera Control, scaled for this room.
    const subject = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: this.theme("--scene-subject"),
      roughness: 0.9,
    });
    function mesh(geometry, surface = material) {
      const result = new THREE.Mesh(geometry, surface);
      subject.add(result);
      return result;
    }
    function limb(from, to, radius) {
      const direction = new THREE.Vector3().subVectors(to, from);
      const part = mesh(
        new THREE.CylinderGeometry(
          radius * 0.85,
          radius,
          direction.length(),
          8,
        ),
      );
      part.position.copy(from).add(to).multiplyScalar(0.5);
      part.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );
    }
    mesh(new THREE.SphereGeometry(0.135, 16, 12)).position.set(0, 1.57, 0);
    const torso = mesh(new THREE.CapsuleGeometry(0.18, 0.35, 4, 12));
    torso.position.set(0, 1.12, 0);
    torso.scale.z = 0.68;
    mesh(new THREE.SphereGeometry(0.15, 12, 8)).position.set(0, 0.77, 0);
    for (const side of [-1, 1]) {
      limb(
        new THREE.Vector3(side * 0.09, 0.74, 0),
        new THREE.Vector3(side * 0.13, 0.39, 0),
        0.075,
      );
      limb(
        new THREE.Vector3(side * 0.13, 0.39, 0),
        new THREE.Vector3(side * 0.14, 0.1, 0),
        0.054,
      );
      limb(
        new THREE.Vector3(side * 0.18, 1.29, 0),
        new THREE.Vector3(side * 0.29, 1.03, 0),
        0.053,
      );
      limb(
        new THREE.Vector3(side * 0.29, 1.03, 0),
        new THREE.Vector3(side * 0.27, 0.81, 0.07),
        0.039,
      );
      const foot = mesh(new THREE.BoxGeometry(0.11, 0.07, 0.21));
      foot.position.set(side * 0.14, 0.05, 0.055);
    }
    subject.scale.setScalar(0.72);
    subject.rotation.y = Math.PI;
    return subject;
  }

  clearGroup(group) {
    while (group.children.length) {
      const child = group.children.pop();
      child.traverse?.((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose?.());
        } else {
          object.material?.dispose?.();
        }
      });
    }
  }

  update(state, metrics, preset) {
    this.state = state;
    this.metrics = metrics;
    const [width, length, height] = getDisplayDimensions(state);
    this.displayDimensions = { width, length, height };

    const [accent, dark] = preset.palette;
    const accentColor = new THREE.Color(accent);
    const darkColor = new THREE.Color(dark);
    this.clearGroup(this.room);
    this.clearGroup(this.atmosphere);

    if (preset.mode === "outside") {
      buildOutside(
        this.room,
        this.atmosphere,
        this.theme,
        width,
        length,
        accentColor,
        darkColor,
        preset.time_of_day,
      );
    } else if (preset.mode === "sfx") {
      buildDualDelay(this.room, width, length, height, accentColor, darkColor);
    } else {
      buildRoom(
        this.room,
        width,
        length,
        height,
        accentColor,
        darkColor,
        preset.mode === "dry",
      );
    }

    this.source.position.set(-width * 0.22, 0.34, -length * 0.16);
    this.listener.position.set(width * 0.16, 0, length * 0.22);
    this.source.children[0].material.color.set(accentColor);
    this.source.children[0].material.emissive.set(accentColor);
    this.source.children[1].material.color.set(accentColor);
    this.buildWaves(accentColor, width, length, metrics.visual_amount);
    this.updateLighting(preset, accentColor, darkColor);
  }

  buildWaves(color, width, length, amount) {
    this.clearGroup(this.waveGroup);
    if (amount <= 0) return;
    const ringCount = 3 + Math.round(amount * 4);
    for (let index = 0; index < ringCount; index += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.012, 8, 64),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(this.source.position);
      ring.userData = {
        index,
        count: ringCount,
        maxScale: Math.max(width, length) * 1.2,
      };
      this.waveGroup.add(ring);
    }
  }

  updateLighting(preset, accentColor, darkColor) {
    if (preset.mode === "outside" && preset.time_of_day === "day") {
      this.scene.background = new THREE.Color(this.theme("--sunken"));
      this.hemisphere.color.set(this.theme("--scene-sky"));
      this.hemisphere.groundColor.set(this.theme("--scene-ground"));
      this.key.color.set(this.theme("--scene-light"));
      this.key.intensity = 4.1;
    } else if (preset.mode === "outside") {
      this.scene.background = new THREE.Color(this.theme("--scene-dark"));
      this.hemisphere.color.set(this.theme("--acoustic"));
      this.hemisphere.groundColor.set(this.theme("--scene-ground"));
      this.key.color.set(this.theme("--acoustic"));
      this.key.intensity = 1.3;
    } else {
      this.scene.background = darkColor.clone().multiplyScalar(0.18);
      this.hemisphere.color.set(this.theme("--scene-sky"));
      this.hemisphere.groundColor.set(darkColor);
      this.key.color.set(this.theme("--scene-light"));
      this.key.intensity = preset.mode === "dry" ? 1.6 : 2.6;
    }
    this.rim.color.set(accentColor);
    this.rim.intensity = preset.mode === "dry" ? 4 : 12;
  }

  resize() {
    const parent = this.canvas.parentElement;
    const width = Math.max(1, parent?.clientWidth ?? this.canvas.clientWidth);
    const height = Math.max(
      1,
      parent?.clientHeight ?? this.canvas.clientHeight,
    );
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  animate = () => {
    if (!this.running || !this.visible) return;
    const elapsed = this.reduced ? 1.5 : this.clock.getElapsedTime();
    const amount = this.metrics?.visual_amount ?? 0;
    const speed = 0.22 + amount * 0.22;
    for (const ring of this.waveGroup.children) {
      const phase =
        (elapsed * speed + ring.userData.index / ring.userData.count) % 1;
      const scale = 0.2 + phase * ring.userData.maxScale;
      ring.scale.setScalar(scale);
      ring.material.opacity = (1 - phase) * (0.08 + amount * 0.22);
    }
    this.source.rotation.y = elapsed * 0.4;
    this.atmosphere.rotation.y = Math.sin(elapsed * 0.08) * 0.035;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (!this.reduced)
      this.animationFrame = globalThis.requestAnimationFrame(this.animate);
  };

  renderStatic = () => {
    if (this.reduced && this.visible && this.running)
      this.renderer.render(this.scene, this.camera);
  };

  replay(reduced) {
    globalThis.cancelAnimationFrame(this.animationFrame);
    this.reduced = reduced;
    this.controls.enableDamping = !reduced;
    this.clock.start();
    this.animate();
  }

  setVisible(visible) {
    this.visible = visible;
    globalThis.cancelAnimationFrame(this.animationFrame);
    if (visible) this.animate();
  }

  toDataURL() {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL("image/png");
  }

  dispose() {
    this.running = false;
    globalThis.cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.renderStatic);
    this.controls.dispose();
    this.clearGroup(this.root);
    this.renderer.dispose();
  }
}
