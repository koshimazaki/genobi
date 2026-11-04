// The mix's pixel face, Nokia Cellphone FC (mix-fonts.css), and its
// fallback Pixelify Sans are registered by font-registry.ts with the
// Director's other bundled faces, so the preview and the MP4 agree in any
// browser.
import type { GraphicsContext, GraphicsInstance } from "./module-types";
import { createLayer as screenOpen } from "../../docs/director-bundle/example/graphics/mix-screen-open.mjs";
import { createLayer as buildPanel } from "../../docs/director-bundle/example/graphics/mix-build-panel.mjs";
import { createLayer as scan } from "../../docs/director-bundle/example/graphics/mix-scan.mjs";
import { createLayer as kinetic } from "../../docs/director-bundle/example/graphics/mix-kinetic.mjs";
import { createLayer as hud } from "../../docs/director-bundle/example/graphics/mix-hud.mjs";
import { createLayer as wireScan } from "../../docs/director-bundle/example/graphics/mix-wire-scan.mjs";
import { createLayer as sliceGlitch } from "../../docs/director-bundle/example/graphics/mix-slice-glitch.mjs";
import { createLayer as endCard } from "../../docs/director-bundle/example/graphics/mix-end-card.mjs";
import { createLayer as endCardStill } from "../../docs/director-bundle/example/graphics/mix-end-card-still.mjs";
import { createLayer as speechBubble } from "../../docs/director-bundle/example/graphics/mix-speech-bubble.mjs";
import { createLayer as spriteShower } from "../../docs/director-bundle/example/graphics/mix-sprite-shower.mjs";
import { createLayer as boxScan } from "../../docs/director-bundle/example/graphics/mix-box-scan.mjs";
import { createLayer as scanLock } from "../../docs/director-bundle/example/graphics/mix-scan-lock.mjs";
import { createLayer as spriteSwarm } from "../../docs/director-bundle/example/graphics/mix-sprite-swarm.mjs";
import { createLayer as typewriter } from "../../docs/director-bundle/example/graphics/mix-typewriter.mjs";
import screenOpenSource from "../../docs/director-bundle/example/graphics/mix-screen-open.mjs?raw";
import buildPanelSource from "../../docs/director-bundle/example/graphics/mix-build-panel.mjs?raw";
import scanSource from "../../docs/director-bundle/example/graphics/mix-scan.mjs?raw";
import kineticSource from "../../docs/director-bundle/example/graphics/mix-kinetic.mjs?raw";
import hudSource from "../../docs/director-bundle/example/graphics/mix-hud.mjs?raw";
import wireScanSource from "../../docs/director-bundle/example/graphics/mix-wire-scan.mjs?raw";
import sliceGlitchSource from "../../docs/director-bundle/example/graphics/mix-slice-glitch.mjs?raw";
import endCardSource from "../../docs/director-bundle/example/graphics/mix-end-card.mjs?raw";
import endCardStillSource from "../../docs/director-bundle/example/graphics/mix-end-card-still.mjs?raw";
import speechBubbleSource from "../../docs/director-bundle/example/graphics/mix-speech-bubble.mjs?raw";
import spriteShowerSource from "../../docs/director-bundle/example/graphics/mix-sprite-shower.mjs?raw";
import boxScanSource from "../../docs/director-bundle/example/graphics/mix-box-scan.mjs?raw";
import scanLockSource from "../../docs/director-bundle/example/graphics/mix-scan-lock.mjs?raw";
import spriteSwarmSource from "../../docs/director-bundle/example/graphics/mix-sprite-swarm.mjs?raw";
import typewriterSource from "../../docs/director-bundle/example/graphics/mix-typewriter.mjs?raw";

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
const filter = (source: string, create: Create) => ({
  source,
  engine: "threejs",
  version: "0.180.0",
  mode: "filter",
  create,
});

/**
 * The mix recipes (docs/dimensions-mix.md): the screen open, the build
 * panel, the scan, the kinetic impact screen, the HUD and the construction
 * end card (and its copy with the piece's own still, `end-card-still`, for
 * Bloom), a comic speech bubble (`speech-bubble`) and a pixel-art fruit
 * shower (`sprite-shower`) and swarm (`sprite-swarm`), a scan with its own
 * lock line (`scan-lock`) and a line typed on the beat (`typewriter`, all
 * Dance with Fruits) as Canvas overlays under
 * the `animejs` entry, and the wireframe scan, slice glitch and the boxed
 * surveillance treatment (`box-scan`) as Three.js filters. Browser only: the sources come
 * through Vite's `?raw`, and the end card loads the construction effect
 * from /motion/construction/ at run time.
 */
export const mixRecipes = [
  overlay(screenOpenSource, screenOpen),
  overlay(buildPanelSource, buildPanel),
  overlay(scanSource, scan),
  overlay(kineticSource, kinetic),
  overlay(hudSource, hud),
  filter(wireScanSource, wireScan),
  filter(sliceGlitchSource, sliceGlitch),
  overlay(endCardSource, endCard),
  overlay(endCardStillSource, endCardStill),
  overlay(speechBubbleSource, speechBubble),
  overlay(spriteShowerSource, spriteShower),
  filter(boxScanSource, boxScan),
  overlay(scanLockSource, scanLock),
  overlay(spriteSwarmSource, spriteSwarm),
  overlay(typewriterSource, typewriter),
];
