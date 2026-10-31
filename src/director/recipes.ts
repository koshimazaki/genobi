import p5 from "p5";
import * as animejs from "animejs";
import * as threejs from "three";
import type { GraphicsContext, GraphicsInstance } from "./module-types";
import { createLayer as rings } from "../../docs/director-bundle/example/graphics/p5-rings.mjs";
import { createLayer as bars } from "../../docs/director-bundle/example/graphics/anime-bars.mjs";
import { createLayer as title } from "../../docs/director-bundle/example/graphics/anime-title.mjs";
import { createLayer as dither } from "../../docs/director-bundle/example/graphics/three-dither.mjs";
import { createLayer as crt } from "../../docs/director-bundle/example/graphics/three-crt.mjs";
import ringsSource from "../../docs/director-bundle/example/graphics/p5-rings.mjs?raw";
import barsSource from "../../docs/director-bundle/example/graphics/anime-bars.mjs?raw";
import titleSource from "../../docs/director-bundle/example/graphics/anime-title.mjs?raw";
import ditherSource from "../../docs/director-bundle/example/graphics/three-dither.mjs?raw";
import crtSource from "../../docs/director-bundle/example/graphics/three-crt.mjs?raw";
import { createLayer as caption } from "../../docs/director-bundle/example/graphics/anime-caption.mjs";
import captionSource from "../../docs/director-bundle/example/graphics/anime-caption.mjs?raw";
import { effectRecipes } from "./effects";
import { mixRecipes } from "./mix-recipes";
import { teaserRecipes } from "./teaser-recipes";
import { versionMediaRecipes } from "./version-media-recipes";
import { catalogueEffectRecipes } from "./catalogue-effects";
export const libraries = { p5, animejs, threejs };
export const recipes: {
  source: string;
  engine: string;
  version: string;
  mode: string;
  create: (c: GraphicsContext) => GraphicsInstance | Promise<GraphicsInstance>;
}[] = [
  {
    source: captionSource,
    engine: "animejs",
    version: "4.5.0",
    mode: "overlay",
    create: caption,
  },
  {
    source: ringsSource,
    engine: "p5",
    version: "2.3.4",
    mode: "overlay",
    create: rings,
  },
  {
    source: barsSource,
    engine: "animejs",
    version: "4.5.0",
    mode: "overlay",
    create: bars,
  },
  {
    source: titleSource,
    engine: "animejs",
    version: "4.5.0",
    mode: "overlay",
    create: title,
  },
  {
    source: ditherSource,
    engine: "threejs",
    version: "0.180.0",
    mode: "filter",
    create: dither,
  },
  {
    source: crtSource,
    engine: "threejs",
    version: "0.180.0",
    mode: "filter",
    create: crt,
  },
  ...effectRecipes,
  ...mixRecipes,
  ...teaserRecipes,
  ...versionMediaRecipes,
  ...catalogueEffectRecipes,
];
