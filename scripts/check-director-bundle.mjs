import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateBundle } from "./lib/director-bundle.mjs";
const directory = fileURLToPath(
  new URL("../docs/director-bundle/example/", import.meta.url),
);
const fixture = JSON.parse(readFileSync(`${directory}/project.json`));
const result = validateBundle(fixture, directory);
console.log(
  `PASS example: ${result.layers} layers, ${result.files} hashed files`,
);
// The motion effects' worked example is their catalogue; it must hold too.
const effects = fileURLToPath(
  new URL("../docs/director-bundle/effects/", import.meta.url),
);
const effectsResult = validateBundle(
  JSON.parse(readFileSync(`${effects}/project.json`)),
  effects,
);
console.log(
  `PASS effects: ${effectsResult.layers} layers, ${effectsResult.files} hashed files`,
);
const cases = [
  [
    "negative start",
    (p) => {
      p.layers[0].startFrame = -1;
    },
  ],
  [
    "duplicate layer ID",
    (p) => {
      p.layers[1].id = p.layers[0].id;
    },
  ],
  [
    "timeline overrun",
    (p) => {
      p.layers[1].durationFrames = 181;
    },
  ],
  [
    "source overrun",
    (p) => {
      p.layers[1].sourceStartFrame = 1;
    },
  ],
  [
    "missing asset",
    (p) => {
      p.layers[1].assetId = "absent";
    },
  ],
  [
    "reference used as footage",
    (p) => {
      p.assets.video.use = "reference";
    },
  ],
  [
    "wrong media kind",
    (p) => {
      p.layers[0].assetId = "video";
    },
  ],
  [
    "unknown module",
    (p) => {
      p.layers[2].moduleId = "absent";
    },
  ],
  [
    "filter/overlay mismatch",
    (p) => {
      p.layers[2].moduleId = "dither";
    },
  ],
  [
    "bad recipe parameter",
    (p) => {
      p.layers[4].parameters.levels = 0;
    },
  ],
  [
    "unknown recipe parameter",
    (p) => {
      p.layers[2].parameters.typo = 1;
    },
  ],
  [
    "path traversal",
    (p) => {
      p.assets.audio.file.path = "../outside.wav";
    },
  ],
  [
    "file integrity",
    (p) => {
      p.assets.audio.file.sha256 = "0".repeat(64);
    },
  ],
  [
    "unknown generation reference",
    (p) => {
      p.generationPlans[0].referenceAssetIds = ["absent"];
    },
  ],
  [
    "false generated provenance",
    (p) => {
      p.assets.video.origin = "generated";
    },
  ],
  [
    "unexpected executable field",
    (p) => {
      p.layers[2].code = "run()";
    },
  ],
];
for (const [label, mutate] of cases) {
  const invalid = structuredClone(fixture);
  mutate(invalid);
  assert.throws(() => validateBundle(invalid, directory), undefined, label);
}
console.log(`PASS ${cases.length} invalid-bundle rejection checks`);
