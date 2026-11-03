import type { Recipe } from "./recipe";
import { mapping, voxels } from "./motion-preset-parts";
import { carMechaLayouts } from "./motion-car-layout";
import { bikeMechaLayouts } from "./motion-bike-layout";

export const VEHICLE_PRESET_IDS = ["car-mecha", "bike-mecha"] as const;
export type VehiclePresetId = (typeof VEHICLE_PRESET_IDS)[number];

/** The voxel vehicle morphs: car, sports bike and brawler mecha forms, 128 parts each. */
export function vehiclePresetPatch(id: VehiclePresetId): Partial<Recipe> {
  if (id === "car-mecha") {
    const motion = voxels(
      128,
      ["#2f4458", "#3c5468", "#5fd4e6", "#d9a441"],
      ["Car", "Mecha", "Winged mecha"],
      carMechaLayouts(),
    );
    motion.mappings = [
      mapping("twistY", "low", 0.25),
      mapping("spread", "high", 0.1),
      mapping("morph", "sub", 0.12),
    ];
    return {
      motion,
      radius: 14,
      fov: 46,
      azimuth: 35,
      elevation: 14,
      targetY: 2,
      background: "#080b12",
      prompt:
        "A low wedge car unfolds into a standing mecha, then opens its wings. The same 128 parts retain their identities. Prepared sub-bass gently advances the morph; bass turns the group and highs open the spacing.",
    };
  }
  if (id === "bike-mecha") {
    const motion = voxels(
      128,
      ["#c8262e", "#9b1b22", "#efe6d2", "#e8862a"],
      ["Bike", "Brawler", "Car"],
      bikeMechaLayouts(),
    );
    motion.mappings = [
      mapping("twistY", "low", 0.25),
      mapping("spread", "high", 0.1),
      mapping("morph", "sub", 0.12),
    ];
    return {
      motion,
      radius: 14,
      fov: 46,
      azimuth: 35,
      elevation: 14,
      targetY: 2,
      background: "#080b12",
      prompt:
        "A long red sports bike stands up into a chunky brawler mecha with oversized fists, then folds down into a low car. The same 128 parts retain their identities and carry their colours between forms. Prepared sub-bass gently advances the morph; bass turns the group and highs open the spacing.",
    };
  }
  throw new Error(`Unknown vehicle preset: ${String(id)}`);
}
