import type { GraphicsContext, GraphicsInstance } from "./module-types";
import { createLayer as genTitle } from "../../docs/director-bundle/example/graphics/teaser-gen-title.mjs";
import { createLayer as genImage } from "../../docs/director-bundle/example/graphics/teaser-gen-image.mjs";
import { createLayer as genStatus } from "../../docs/director-bundle/example/graphics/teaser-gen-status.mjs";
import { createLayer as zoom } from "../../docs/director-bundle/example/graphics/teaser-zoom.mjs";
import { createLayer as cursor } from "../../docs/director-bundle/example/graphics/teaser-cursor.mjs";
import { createLayer as focus } from "../../docs/director-bundle/example/graphics/teaser-focus.mjs";
import { createLayer as wipe } from "../../docs/director-bundle/example/graphics/teaser-wipe.mjs";
import { createLayer as paper } from "../../docs/director-bundle/example/graphics/teaser-paper.mjs";
import { createLayer as space } from "../../docs/director-bundle/example/graphics/teaser-space.mjs";
import genTitleSource from "../../docs/director-bundle/example/graphics/teaser-gen-title.mjs?raw";
import genImageSource from "../../docs/director-bundle/example/graphics/teaser-gen-image.mjs?raw";
import genStatusSource from "../../docs/director-bundle/example/graphics/teaser-gen-status.mjs?raw";
import zoomSource from "../../docs/director-bundle/example/graphics/teaser-zoom.mjs?raw";
import cursorSource from "../../docs/director-bundle/example/graphics/teaser-cursor.mjs?raw";
import focusSource from "../../docs/director-bundle/example/graphics/teaser-focus.mjs?raw";
import wipeSource from "../../docs/director-bundle/example/graphics/teaser-wipe.mjs?raw";
import paperSource from "../../docs/director-bundle/example/graphics/teaser-paper.mjs?raw";
import spaceSource from "../../docs/director-bundle/example/graphics/teaser-space.mjs?raw";

type Create = (
  c: GraphicsContext,
) => GraphicsInstance | Promise<GraphicsInstance>;
const overlay = (source: string, create: Create) => ({
  source,
  engine: "animejs",
  version: "4.5.0",
  mode: "overlay",
  create,
});

/**
 * The Genobi teaser's recipes (docs/genobi-teaser.md#the-recipes): three
 * that run free Transitions.dev transitions unchanged in a private frame
 * through Genobi's stage (`gen-title`, `gen-image`, `gen-status`), and four
 * of our own for the studio footage: the pointer, the focus box and the
 * Signal wipe as Canvas overlays, the camera move as a Three.js filter, and
 * a Paper Shaders background (`paper-shader`) drawn with Paper's own shaders,
 * and Space.js targeting (`space-hud`) built from Space.js's own components.
 * Browser only: the sources come through Vite's `?raw`.
 */
export const teaserRecipes = [
  overlay(genTitleSource, genTitle),
  overlay(genImageSource, genImage),
  overlay(genStatusSource, genStatus),
  {
    source: zoomSource,
    engine: "threejs",
    version: "0.180.0",
    mode: "filter",
    create: zoom,
  },
  overlay(cursorSource, cursor),
  overlay(focusSource, focus),
  overlay(wipeSource, wipe),
  overlay(paperSource, paper),
  overlay(spaceSource, space),
];
