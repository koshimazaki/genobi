import type { SceneTransform } from "./scene-state";
const box = (
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): SceneTransform => {
  const scale = Math.max(sx, sy, sz) > 8 ? 2 : 1;
  return {
    x,
    y,
    z,
    scale,
    scaleX: sx / scale,
    scaleY: sy / scale,
    scaleZ: sz / scale,
    rotation: 0,
  };
};

/** Ninety-six persistent parts: skyline, street canyon, then an open loft. */
export function cityLoftLayouts(): SceneTransform[][] {
  const skyline = Array.from({ length: 96 }, (_, i) => {
    const tower = Math.floor(i / 4),
      level = i % 4;
    const col = tower % 6,
      row = Math.floor(tower / 6);
    const height = 5.5 + ((tower * 17) % 8) * 1.45;
    const x = (col - 2.5) * 4.4 + (col < 3 ? -1.5 : 1.5);
    return box(
      x,
      ((level + 0.5) * height) / 4,
      (row - 1.5) * 5.2,
      2.5 - level * 0.18,
      height / 4 - 0.05,
      3.4 - level * 0.12,
    );
  });
  const street = Array.from({ length: 96 }, (_, i) => {
    const tower = Math.floor(i / 8),
      level = i % 8;
    const side = tower % 2 ? 1 : -1,
      row = Math.floor(tower / 2);
    const height = 7.2 + ((tower * 7) % 5) * 1.2;
    return box(
      side * (6 + (row % 2) * 0.7),
      ((level + 0.5) * height) / 8,
      (row - 2.5) * 4.5,
      3.6 - level * 0.06,
      height / 8 - 0.04,
      3.7,
    );
  });
  const loft: SceneTransform[] = [];
  for (let z = 0; z < 4; z++)
    for (let x = 0; x < 4; x++)
      loft.push(box((x - 1.5) * 3.5, 0, (z - 1.5) * 3, 3.48, 0.18, 2.98));
  for (let i = 0; i < 7; i++) {
    loft.push(box(-6.9 + i * 2.3, 2.8, -5.9, 0.17, 5.6, 0.2));
    loft.push(box(-5.75 + i * 1.9, 0.65, -5.9, 1.85, 1.25, 0.22));
    loft.push(box(-5.75 + i * 1.9, 5.4, -5.9, 1.85, 0.25, 0.22));
  }
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++)
      loft.push(box(side * 6.85, 2.8, -4.5 + i * 3, 0.22, 5.6, 0.22));
  for (let i = 0; i < 7; i++)
    loft.push(box(0, 5.55, -5.4 + i * 1.8, 13.8, 0.2, 0.2));
  // Sofa: base, back, arms, cushions and legs.
  loft.push(
    box(-3.6, 0.65, 0.3, 3.6, 0.5, 1.7),
    box(-3.6, 1.25, -0.4, 3.6, 1, 0.25),
  );
  for (const x of [-5.3, -1.9]) loft.push(box(x, 1, 0.3, 0.3, 0.9, 1.7));
  for (let i = 0; i < 4; i++)
    loft.push(box(-4.9 + i * 0.85, 1, 0.4, 0.8, 0.23, 1.15));
  for (const x of [-5.1, -2.1])
    for (const z of [-0.3, 0.9]) loft.push(box(x, 0.3, z, 0.15, 0.5, 0.15));
  loft.push(box(-3.5, 0.75, 2.5, 2.8, 0.18, 1.2));
  for (const x of [-4.6, -2.4])
    for (const z of [2.05, 2.95]) loft.push(box(x, 0.38, z, 0.12, 0.7, 0.12));
  for (let i = 0; i < 4; i++)
    loft.push(
      box(3.4 + (i % 2) * 1.3, 0.75, -2.5 + Math.floor(i / 2), 1.25, 1.5, 0.95),
    );
  for (let i = 0; i < 2; i++)
    loft.push(box(4.05, 1.55, -2.5 + i, 2.8, 0.15, 1.08));
  for (let i = 0; i < 3; i++)
    loft.push(box(1.3 + i * 1.8, 1.9, -5.2, 0.16, 3.8, 0.65));
  for (let i = 0; i < 6; i++)
    loft.push(box(3.1, 0.4 + i * 0.62, -5.2, 3.8, 0.12, 0.7));
  for (const x of [-5.7, 5.7]) {
    loft.push(
      box(x, 0.35, 3.7, 0.9, 0.7, 0.9),
      box(x, 1.3, 3.7, 0.16, 1.6, 0.16),
    );
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      loft.push({
        ...box(
          x + Math.cos(angle) * 0.4,
          2 + Math.sin(angle) * 0.2,
          3.7 + Math.sin(angle) * 0.4,
          1.1,
          0.13,
          0.32,
        ),
        rotation: Math.atan2(-Math.sin(angle), Math.cos(angle)),
      });
    }
  }
  if (loft.length !== 96) throw new Error("City / loft topology changed.");
  return [skyline, street, loft];
}
