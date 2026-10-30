/** Direct, curated demos, checked against upstream links on 30 October 2026.
 * These remote examples are embedded, not bundled or claimed as Genobi work.
 */
export interface TasteDemo {
  url: string;
  hint: string;
  credit: string;
}
const uncommon = (path: string, hint: string): TasteDemo => ({
  url: `https://webdev.teknium.io/d/${path}/`,
  hint,
  credit: "Demo via Teknium’s Uncommon Web · Hermes Agent",
});
export const tasteDemos: Record<string, TasteDemo> = {
  "paper-shaders": uncommon(
    "dither/demos/paper-shaders-dithering",
    "Move the pointer; choose a shape, palette or dither pattern.",
  ),
  "pixi-filters": uncommon(
    "dither/demos/pixi-filters-crt",
    "Toggle filters and move the pointer to mix the effects.",
  ),
  three: uncommon(
    "dither/demos/three-ascii-effect",
    "Drag to turn the scene; switch glyphs and colours.",
  ),
  "crt-terminal": uncommon(
    "glyph2/demos/crt-terminal-shell",
    "Type a command or choose a phosphor colour.",
  ),
  glyphcss: uncommon(
    "glyph2/demos/glyphcss-ascii-3d",
    "Drag to orbit; switch between text rendering styles.",
  ),
  "textmode-js": uncommon(
    "glyph/demos/textmode-js",
    "Switch sketches and palettes; drag to steer.",
  ),
  "play-core": uncommon(
    "glyph/demos/play-core-ascii",
    "Choose a program; drag to change the field.",
  ),
  "ascii-magic-art": uncommon(
    "glyph/demos/ascii-magic-art-gallery",
    "Browse animations with the arrows and change their look.",
  ),
  "cli-spinners": uncommon(
    "glyph/demos/cli-spinners-gallery",
    "Choose a spinner and adjust its speed.",
  ),
  "matrix-rain": uncommon(
    "glyph2/demos/matrix-digital-rain",
    "Tap the rain to cycle through variants.",
  ),
  "svgbob-wasm": uncommon(
    "glyph2/demos/svgbob-live-diagram",
    "Edit the text diagram and see the SVG change.",
  ),
  krbn: uncommon(
    "gen3/demos/krbn-graphite-orbit",
    "Explore a graphite-style 3D scene.",
  ),
  dithercn: uncommon(
    "dither/demos/dithercn-globe-hero",
    "Drag the globe and hover over the controls.",
  ),
  "drawille-canvas": uncommon(
    "glyph/demos/drawille-braille",
    "Drag to rotate; use the arrows to change the wireframe.",
  ),
  "alien-js": {
    url: "https://alien.js.org/examples/three/shader_fluid_distortion_rgbshift.html",
    hint: "Move the pointer through the scene to stir fluid distortion and RGB shifts.",
    credit: "Upstream demo · Patrick Schroen / Alien.js",
  },
  "p5-brush": {
    url: "https://acamposuribe.github.io/p5.brush/tools/brush-maker.html",
    hint: "Adjust brush parameters and try the live drawing preview.",
    credit: "Upstream demo · Alejandro Campos Uribe / p5.brush",
  },
  "space-js": {
    url: "https://space.js.org/examples/graph_markers.html",
    hint: "Click a graph to add a marker; drag markers to reposition them.",
    credit: "Upstream demo · Patrick Schroen / Space.js",
  },
};

export const localDemos: Record<string, string> = {
  koda: "Explore the character-sheet and storyboard workflow that inspired Scrolls.",
  "andrew-zellinger":
    "Explore the push-to-talk interaction described by Andrew’s TTS/STT Voice MCP project.",
  "transitions-ui-generation":
    "Play Genobi’s construction study, made with the UI generation effect.",
  animejs: "Click any dot to send an elastic ripple through the grid.",
  p5: "Move the pointer to bend the ribbons; click to change the ink.",
  "ibm-plex-mono": "Type your own words to try IBM Plex Mono.",
  geist: "Type your own words to try Geist.",
};
