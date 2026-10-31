import type { Recipe } from "./recipe";
import {
  architectureLayouts,
  type ArchitectureDetail,
} from "./motion-architecture-layouts";

/** The same editable enclosure family at three bounded masonry densities. */
export function architecturePresetPatch(
  count: ArchitectureDetail,
): Partial<Recipe> {
  const layouts = architectureLayouts(count);
  const targetY = count === 256 ? 6.25 : count === 128 ? 4.5 : 5;
  return {
    stageLook: "dark-grid",
    background: "#080b12",
    radius: count === 256 ? 39 : count === 128 ? 31 : 26,
    fov: 46,
    azimuth: 27,
    elevation: 22,
    targetX: 0,
    targetY,
    targetZ: 0,
    motion: {
      version: 1,
      pivot: [0, targetY, 0],
      instances: {
        generator: "voxel-lattice",
        version: 1,
        seed: 173,
        count,
        columns: 4,
        spacing: 2,
        size: 2,
        palette: ["#c6bc9d", "#b6ac91", "#d4ccb6", "#aaa48e"],
      },
      stateKeys: layouts.map((layout, index) => ({
        id: `state-${index + 1}`,
        label: ["Pyramid", "House · chamber", "Cathedral"][index],
        frame: [0, 72, 144][index],
        easing: "easeInOut",
        objects: Object.fromEntries(
          layout.map((part, n) => [
            `voxel-${String(n).padStart(3, "0")}`,
            part,
          ]),
        ),
      })),
      mappings: [
        {
          id: "architecture-morph",
          property: "morph",
          source: "sub",
          amount: 0.04,
          enabled: true,
        },
        {
          id: "architecture-lift",
          property: "lift",
          source: "low",
          amount: 0.15,
          enabled: true,
        },
        {
          id: "architecture-spread",
          property: "spread",
          source: "high",
          amount: 0.02,
          enabled: true,
        },
      ],
      intensity: 0.5,
    },
    prompt: `A ${count}-block stepped pyramid transforms into a closed house and chamber, then a taller cathedral with a nave, roof, door and window openings. The same masonry pieces retain their identities. Keep the dark background and floor grid, fixed overview camera, and restrained audio motion. These are original visual enclosures, without an acoustic-room simulation.`,
  };
}
