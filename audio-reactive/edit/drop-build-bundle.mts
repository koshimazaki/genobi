// Acoustic Spaces v2, step 7: builds the template as an editable Director bundle (a project zip)
// from shared/templates/audio-reactive-drop.ts and its media under public/, with the repo's mix
// compiler and trusted recipe registry. Nothing in the repo changes.
//   npx tsx audio-reactive/edit/drop-build-bundle.mts <out.zip>
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { audioReactiveDrop } from "../../shared/templates/audio-reactive-drop";
import { mixProject, type MixMedia } from "../../shared/templates/mix";
import { validateProject } from "../../src/director/validate";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const out = process.argv[2];
if (!out) throw new Error("Name the zip to write");
const mix = audioReactiveDrop.mix!;
const files: Record<string, Uint8Array> = {};
const media: Record<string, MixMedia> = {};
for (const [id, m] of Object.entries(mix.media)) {
  const bytes = readFileSync(path.join(ROOT, "public", m.url));
  files[m.path] = bytes;
  media[id] = {
    ...m,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
const example = path.join(ROOT, "docs/director-bundle/example");
const registry = JSON.parse(
  readFileSync(path.join(example, "studio.json"), "utf8"),
);
const built = mixProject(
  mix.cut,
  audioReactiveDrop.name,
  media,
  registry.modules,
);
const project = validateProject({ ...built, id: audioReactiveDrop.id });
for (const m of Object.values(project.modules))
  files[m.file.path] ??= readFileSync(path.join(example, m.file.path));
files["project.json"] = strToU8(JSON.stringify(project));
writeFileSync(out, zipSync(files, { level: 0 }));
console.log(
  `${out}: ${Object.keys(files).length} files, ${project.layers.length} layers, ${project.composition.durationFrames} frames, ${project.composition.width}x${project.composition.height}`,
);
