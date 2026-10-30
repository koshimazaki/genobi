import { createLayer as endCard } from "../../docs/director-bundle/version-media/version-mix-end-card-still.mjs";
import { createLayer as genImage } from "../../docs/director-bundle/version-media/version-teaser-gen-image.mjs";
import { createLayer as space } from "../../docs/director-bundle/version-media/version-teaser-space.mjs";
import endCardSource from "../../docs/director-bundle/version-media/version-mix-end-card-still.mjs?raw";
import genImageSource from "../../docs/director-bundle/version-media/version-teaser-gen-image.mjs?raw";
import spaceSource from "../../docs/director-bundle/version-media/version-teaser-space.mjs?raw";

export const versionMediaRecipes = [
  { source: endCardSource, create: endCard },
  { source: genImageSource, create: genImage },
  { source: spaceSource, create: space },
].map((r) => ({ ...r, engine: "animejs", version: "4.5.0", mode: "overlay" }));
