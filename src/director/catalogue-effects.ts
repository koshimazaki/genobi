import type { GraphicsModule } from "../../shared/director/types";
import type { GraphicsContext, GraphicsInstance } from "./module-types";
import modules from "../../docs/director-bundle/effects-catalogue/modules.json";
import { createLayer as poster } from "../../docs/director-bundle/effects-catalogue/graphics/effects-poster-window.mjs";
import { createLayer as scan } from "../../docs/director-bundle/effects-catalogue/graphics/effects-scan.mjs";
import { createLayer as hud } from "../../docs/director-bundle/effects-catalogue/graphics/effects-hud.mjs";
import { createLayer as kinetic } from "../../docs/director-bundle/effects-catalogue/graphics/effects-kinetic-title.mjs";
import { createLayer as mirror } from "../../docs/director-bundle/effects-catalogue/graphics/effects-liquid-mirror.mjs";
import posterSource from "../../docs/director-bundle/effects-catalogue/graphics/effects-poster-window.mjs?raw";
import scanSource from "../../docs/director-bundle/effects-catalogue/graphics/effects-scan.mjs?raw";
import hudSource from "../../docs/director-bundle/effects-catalogue/graphics/effects-hud.mjs?raw";
import kineticSource from "../../docs/director-bundle/effects-catalogue/graphics/effects-kinetic-title.mjs?raw";
import mirrorSource from "../../docs/director-bundle/effects-catalogue/graphics/effects-liquid-mirror.mjs?raw";

export const catalogueEffectModules = modules as Record<string, GraphicsModule>;
type Factory = (
  context: GraphicsContext,
) => GraphicsInstance | Promise<GraphicsInstance>;
const factories: Record<string, Factory> = {
  "effects-poster-window": poster,
  "effects-scan": scan,
  "effects-hud": hud,
  "effects-kinetic-title": kinetic,
  "effects-liquid-mirror": mirror,
};
const sources: Record<string, string> = {
  "effects-poster-window": posterSource,
  "effects-scan": scanSource,
  "effects-hud": hudSource,
  "effects-kinetic-title": kineticSource,
  "effects-liquid-mirror": mirrorSource,
};

/** The catalogue preview and Director export execute these same factories. */
export const catalogueEffects = Object.fromEntries(
  Object.entries(catalogueEffectModules).map(([id, module]) => [
    id,
    {
      source: sources[id],
      engine: module.engine,
      version: module.engineVersion,
      mode: module.mode,
      create: factories[id],
    },
  ]),
);
export const catalogueEffectRecipes = Object.values(catalogueEffects);
