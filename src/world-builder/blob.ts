/** Original rounded capsule stand-in. Theme colours, no external model or textures. */
import * as T from "three";
export function blobActor(onTheme = () => {}) {
  const group = new T.Group();
  const bodyMaterial = new T.MeshStandardMaterial({
    color: "#8797b0",
    roughness: 0.72,
  });
  let frozen = false;
  let themeKey = document.documentElement.dataset.theme ?? "blackstone-lime";
  const themeColour = () => {
    const theme = document.documentElement.dataset.theme;
    themeKey = theme ?? "blackstone-lime";
    bodyMaterial.color.set(
      theme === "cyberpunk"
        ? "#76a9d5"
        : theme === "signal"
          ? "#a5b4c7"
          : "#8a96a6",
    );
  };
  const observer = new MutationObserver(() => {
    if (frozen) return;
    themeColour();
    onTheme();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  themeColour();
  const body = new T.Mesh(new T.SphereGeometry(0.55, 32, 24), bodyMaterial);
  body.position.y = 0.65;
  body.scale.set(1, 0.95, 0.95);
  group.add(body);
  const feet = [-1, 1].map((side) => {
    const foot = new T.Mesh(new T.SphereGeometry(0.2, 20, 16), bodyMaterial);
    foot.position.set(side * 0.28, 0.16, 0.16);
    foot.scale.set(1, 0.6, 1.35);
    group.add(foot);
    return foot;
  });
  for (const side of [-1, 1]) {
    const eye = new T.Mesh(
      new T.SphereGeometry(0.055, 12, 12),
      new T.MeshStandardMaterial({ color: "#182330" }),
    );
    eye.position.set(side * 0.16, 0.78, 0.5);
    eye.scale.y = 1.7;
    group.add(eye);
  }
  group.traverse((o) => {
    if (o instanceof T.Mesh) o.castShadow = true;
  });
  return {
    group,
    freeze: () => {
      frozen = true;
    },
    thaw: () => {
      frozen = false;
      themeColour();
      onTheme();
    },
    appearance: () => ({
      theme: themeKey,
      colour: `#${bodyMaterial.color.getHexString()}`,
    }),
    dispose: () => observer.disconnect(),
    sample(seconds: number, pose: string) {
      const stride = pose === "walk" ? Math.sin(seconds * 10) : 0;
      body.scale.y =
        0.95 +
        Math.sin(seconds * (pose === "walk" ? 10 : 2)) *
          (pose === "walk" ? 0.05 : 0.015);
      body.position.y =
        0.65 +
        (pose === "jump"
          ? Math.max(0, Math.sin(seconds * 4)) * 0.45
          : Math.abs(stride) * 0.035);
      feet[0].rotation.x = stride * 0.5;
      feet[1].rotation.x = -stride * 0.5;
    },
  };
}

/**
 * Seconds in one cycle of the blob's procedural motion for a pose: walk
 * repeats every 2π/10; idle and jump every π (sin 2t, with jump's sin 4t).
 */
export const blobCycle = (pose: string) =>
  pose === "walk" ? (2 * Math.PI) / 10 : Math.PI;
