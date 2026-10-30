import type * as T from "three";
import { scaledAxes } from "./scene-contract";
import { modOf, type Mods } from "./mod-routes";
import type { Playground } from "./playground";
import type { Recipe } from "./recipe";

/**
 * Applies the mod matrix to the Playground set pieces. Only pieces a route
 * drives (or drove on the previous frame) are touched, so an unrouted piece
 * keeps whatever transform the editor gave it.
 */
export function createWorldMods() {
  let touched = new Set<string>();
  return function apply(playground: Playground, recipe: Recipe, mods: Mods) {
    const driven = new Set<string>();
    for (const [id, holder] of playground.editable) {
      const targets = ["world", `world:${id}`];
      const height = modOf(mods, targets, "height"),
        scale = modOf(mods, targets, "scale"),
        spin = modOf(mods, targets, "spin");
      if (!height && !scale && !spin && !touched.has(id)) continue;
      const p = recipe.layout[id] ?? playground.base.get(id)!;
      holder.position.set(p.x, p.y + height, p.z);
      holder.rotation.set(
        p.rotationX ?? 0,
        p.rotation + spin,
        p.rotationZ ?? 0,
      );
      holder.scale.set(
        ...(scaledAxes(p).map((v) => v * (1 + scale)) as [
          number,
          number,
          number,
        ]),
      );
      if (height || scale || spin) driven.add(id);
    }
    touched = driven;
  };
}

/** The character's audio offset lives on a rig inside the avatar, so walking and its pose stay untouched. */
export function applyAvatarMods(rig: T.Object3D, mods: Mods) {
  const pulse = 1 + modOf(mods, ["avatar"], "scale");
  rig.position.set(0, modOf(mods, ["avatar"], "height"), 0);
  rig.rotation.set(0, modOf(mods, ["avatar"], "yaw"), 0);
  rig.scale.setScalar(pulse);
}
