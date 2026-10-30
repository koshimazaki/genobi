import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { AsciiEffect } from "three/examples/jsm/effects/AsciiEffect.js";

export default function AsciiStudy() {
  const host = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setError("WebGL unavailable. Explore the upstream ASCII example below.");
      return;
    }
    const background =
      getComputedStyle(node).getPropertyValue("--taste-bg").trim() || "#101316";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(background);
    const geometry = new THREE.TorusKnotGeometry(1, 0.32, 100, 16);
    const material = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh, new THREE.HemisphereLight(0xffffff, 0x222222, 2));
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(2, 4, 3);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(40, 600 / 300, 0.1, 100);
    camera.position.z = 5;
    const effect = new AsciiEffect(renderer, " .:-+*=%@#", { invert: true });
    effect.setSize(600, 300);
    effect.domElement.style.cssText = "color:#d5ff70;transform-origin:top left";
    effect.domElement.style.backgroundColor = background;
    node.append(effect.domElement);
    const resize = () => {
      effect.domElement.style.transform = `scale(${node.clientWidth / 600})`;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      elapsed = 0,
      previous = 0;
    const draw = (now: number) => {
      if (previous) elapsed += Math.min(50, now - previous);
      previous = now;
      mesh.rotation.set(0.2 + elapsed / 4000, elapsed / 2200, 0);
      effect.render(scene, camera);
      if (playing && !document.hidden && !reduced.matches)
        frame = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      draw(performance.now());
    };
    document.addEventListener("visibilitychange", restart);
    reduced.addEventListener("change", restart);
    draw(performance.now());
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", restart);
      reduced.removeEventListener("change", restart);
      effect.domElement.remove();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [playing]);
  return (
    <div>
      <div
        ref={host}
        className="taste-ascii"
        role="img"
        aria-label="Lime ASCII torus knot rendered with Three.js"
      />
      {error ? (
        <p role="status">{error}</p>
      ) : (
        <button onClick={() => setPlaying(!playing)}>
          {playing ? "Pause ASCII" : "Play ASCII"}
        </button>
      )}
    </div>
  );
}
