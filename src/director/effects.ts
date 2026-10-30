import type { GraphicsContext, GraphicsInstance } from "./module-types";
import { effectModules } from "./effect-modules";
import { createLayer as shake } from "../../docs/director-bundle/effects/graphics/fx-shake.mjs";
import { createLayer as transition } from "../../docs/director-bundle/effects/graphics/fx-transition.mjs";
import { createLayer as grade } from "../../docs/director-bundle/effects/graphics/fx-grade.mjs";
import { createLayer as speedLines } from "../../docs/director-bundle/effects/graphics/fx-speed-lines.mjs";
import { createLayer as styledTitle } from "../../docs/director-bundle/effects/graphics/fx-title.mjs";
import shakeSource from "../../docs/director-bundle/effects/graphics/fx-shake.mjs?raw";
import transitionSource from "../../docs/director-bundle/effects/graphics/fx-transition.mjs?raw";
import gradeSource from "../../docs/director-bundle/effects/graphics/fx-grade.mjs?raw";
import speedLinesSource from "../../docs/director-bundle/effects/graphics/fx-speed-lines.mjs?raw";
import styledTitleSource from "../../docs/director-bundle/effects/graphics/fx-title.mjs?raw";

/**
 * The motion effects: shake, transition, grade, speed lines and a styled
 * title. The worked example `docs/director-bundle/effects/project.json` is
 * their trusted catalogue (`effect-modules.ts`), as the studio example is for
 * the first six recipes. This module imports their sources with Vite's `?raw`,
 * so it is for the browser only; the server's validator must not import it.
 */
export { effectModules };

const create: Record<
  string,
  (c: GraphicsContext) => GraphicsInstance | Promise<GraphicsInstance>
> = {
  shake,
  transition,
  grade,
  "speed-lines": speedLines,
  "styled-title": styledTitle,
};
const sources: Record<string, string> = {
  shake: shakeSource,
  transition: transitionSource,
  grade: gradeSource,
  "speed-lines": speedLinesSource,
  "styled-title": styledTitleSource,
};

/** Recipe entries in the shape `recipes.ts` registers. */
export const effectRecipes = Object.entries(effectModules).map(([id, m]) => ({
  source: sources[id],
  engine: m.engine,
  version: m.engineVersion,
  mode: m.mode,
  create: create[id],
}));
