import { readFileSync } from "node:fs";
import type { Bundle } from "../src/director/bundle";
import { characterPiece, dimensionsMix } from "../shared/templates/catalogue";
import { buildTemplateBundle } from "../src/director/house-template";
import { buildMixBundle } from "../src/director/mix-template";

// File paths also work under jsdom, whose import.meta.url is an HTTP URL.
const read = (path: string) => new Uint8Array(readFileSync(path));
export function versionBase(): Bundle {
  const dir = "docs/director-bundle/example/";
  const project = JSON.parse(readFileSync(`${dir}studio.json`, "utf8"));
  return {
    project,
    files: new Map(
      [...Object.values(project.assets), ...Object.values(project.modules)].map(
        (item) => {
          const { file } = item as { file: { path: string } };
          return [file.path, read(dir + file.path)];
        },
      ),
    ),
  };
}
export const versionCharacter = () =>
  buildTemplateBundle(
    versionBase(),
    characterPiece,
    {},
    {
      character: [
        {
          bytes: read("docs/director-bundle/templates/character-intro.png"),
          ext: "png",
          origin: "fixture",
        },
      ],
    },
  );
export const versionMix = () =>
  buildMixBundle(
    dimensionsMix,
    versionBase(),
    Object.fromEntries(
      Object.entries(dimensionsMix.mix!.media).map(([id, m]) => [
        id,
        read("public" + m.url),
      ]),
    ),
  );
