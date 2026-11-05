import type { SceneTransform } from "./scene-state";
import { pose } from "./motion-layout-utils";

export const BRAWLER_COLOURS = {
  armour: "#e8862a",
  plate: "#f0ece4",
  joint: "#2b2f36",
  metal: "#4a4f58",
  eye: "#5fe0ff",
} as const;

/**
 * A chunky brawler mecha in the spacecraft's 128-part order: a broad chest
 * (torso), a small helmet with a three-fin crest (head), round shoulder pods
 * over thick forearms and oversized fists held forward (arms), wide-set thighs
 * on long boots (legs), pauldron plates fanned over each shoulder and a
 * backpack of thrusters (wings), neck and hip joints. About 4.6 m tall and
 * 3.6 m across the fists, standing on the floor at y = 0 and facing +z.
 */
export function brawlerLayout(): SceneTransform[] {
  const parts: SceneTransform[] = [];
  const C = BRAWLER_COLOURS;
  const at = (
    x: number,
    y: number,
    z: number,
    scale: number,
    color: string,
    extra: Partial<SceneTransform> = {},
  ) => parts.push(pose(x, y, z, scale, { color, ...extra }));
  // Chest / torso: four tiers, a narrow waist under a broad chest.
  const tiers = [
    { y: 2.35, spacing: 0.3, color: C.joint },
    { y: 2.75, spacing: 0.4, color: C.plate },
    { y: 3.15, spacing: 0.46, color: C.armour },
    { y: 3.5, spacing: 0.48, color: C.armour },
  ];
  for (let y = 0; y < 4; y++)
    for (let z = 0; z < 2; z++)
      for (let x = 0; x < 4; x++) {
        const tier = tiers[y];
        at(
          (x - 1.5) * tier.spacing,
          tier.y,
          (z - 0.5) * 0.42,
          0.36,
          tier.color,
          {
            scaleX: tier.spacing / 0.36,
            scaleY: 1.1,
            scaleZ: 1.15,
          },
        );
      }
  // Helmet and crest / head: a small face, a dark visor, three fins.
  for (let y = 0; y < 2; y++)
    for (let z = 0; z < 2; z++)
      for (let x = 0; x < 3; x++)
        if (y === 0)
          at((x - 1) * 0.3, 4.05, (z - 0.5) * 0.3, 0.3, z ? C.eye : C.plate, {
            scaleY: 1.1,
          });
        else
          at(
            (x - 1) * 0.28,
            4.4 + (x === 1 ? 0.12 : 0),
            (z - 0.5) * 0.3 - 0.05,
            0.3,
            C.armour,
            { scaleX: 0.35, scaleY: 1.4, rotationZ: -(x - 1) * 0.5 },
          );
  // Shoulder pod, upper arm, forearm and fist / arms, fists held forward.
  const arm = [
    { x: 1.38, y: 3.4, z: 0, step: 0.42, scale: 0.46, color: C.armour },
    { x: 1.42, y: 2.85, z: 0.1, step: 0.3, scale: 0.32, color: C.joint },
    { x: 1.5, y: 2.25, z: 0.3, step: 0.48, scale: 0.52, color: C.plate },
    { x: 1.55, y: 1.5, z: 0.5, step: 0.54, scale: 0.56, color: C.armour },
  ];
  for (const side of [-1, 1])
    for (let row = 0; row < 4; row++)
      for (let z = 0; z < 2; z++)
        for (let x = 0; x < 2; x++) {
          const seg = arm[row];
          at(
            side * seg.x + (x - 0.5) * seg.step,
            seg.y,
            seg.z + (z - 0.5) * seg.step,
            seg.scale,
            row === 3 && z === 1 ? C.joint : seg.color,
            { scaleY: row === 2 ? 1.3 : 1.05 },
          );
        }
  // Boot, shin, thigh and hip / legs, a wide stance.
  const leg = [
    {
      x: 0.72,
      y: 0.3,
      z: 0.22,
      step: 0.42,
      scale: 0.42,
      color: C.plate,
      scaleZ: 1.5,
    },
    {
      x: 0.7,
      y: 0.95,
      z: 0,
      step: 0.38,
      scale: 0.4,
      color: C.armour,
      scaleZ: 1,
    },
    {
      x: 0.66,
      y: 1.55,
      z: 0,
      step: 0.4,
      scale: 0.42,
      color: C.armour,
      scaleZ: 1,
    },
    {
      x: 0.62,
      y: 2.05,
      z: 0,
      step: 0.34,
      scale: 0.36,
      color: C.joint,
      scaleZ: 1,
    },
  ];
  for (const side of [-1, 1])
    for (let row = 0; row < 4; row++)
      for (let z = 0; z < 2; z++)
        for (let x = 0; x < 2; x++) {
          const seg = leg[row];
          at(
            side * seg.x + (x - 0.5) * seg.step,
            seg.y,
            seg.z + (z - 0.5) * seg.step,
            seg.scale,
            row === 2 && z === 1 ? C.plate : seg.color,
            { scaleY: 1.3, scaleZ: seg.scaleZ },
          );
        }
  // Pauldron plates fanned over each shoulder, thrusters down the back / wings.
  for (const side of [-1, 1])
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 4; col++) {
        if (row) {
          at(side * 0.42, 3.3 - col * 0.35, -0.62, 0.34, C.metal, {
            scaleZ: 1.3,
            scaleY: 0.9,
          });
          continue;
        }
        const angle = -0.1 + col * 0.42;
        at(
          side * (1.38 + 0.5 * Math.sin(angle)),
          3.4 + 0.5 * Math.cos(angle),
          0,
          0.34,
          col % 2 ? C.plate : C.armour,
          { scaleX: 0.5, scaleY: 1.3, rotationZ: -side * angle },
        );
      }
  // Neck and hip joints.
  for (const side of [-1, 1])
    for (const top of [false, true])
      at(side * (top ? 0.17 : 0.5), top ? 3.84 : 2.2, 0, 0.3, C.joint);
  return parts;
}
