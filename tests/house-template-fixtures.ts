import { readFileSync } from "node:fs";
import { hasExample } from "../shared/templates/intake";
import type { HouseTemplate } from "../shared/templates/types";
import type { Bundle } from "../src/director/bundle";
import type { TemplateReferences } from "../src/director/house-template";

const root = new URL("../docs/director-bundle/example/", import.meta.url);
/** The studio example bundle a template borrows its recipes and track from. */
export function base(): Bundle {
  const project = JSON.parse(
    readFileSync(new URL("studio.json", root), "utf8"),
  );
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const item of [
    ...Object.values(project.assets),
    ...Object.values(project.modules),
  ] as { file: { path: string } }[])
    files.set(
      item.file.path,
      new Uint8Array(readFileSync(new URL(item.file.path, root))),
    );
  return { project, files };
}
/** The sample media the Director opens each template with (`sampleReferences`). */
export function samples(template: HouseTemplate): TemplateReferences {
  const read = (url: URL) => new Uint8Array(readFileSync(url));
  const out: TemplateReferences = {};
  for (const ref of template.references) {
    if (ref.example)
      out[ref.id] = [
        {
          bytes: read(new URL(`../public${ref.example}`, import.meta.url)),
          ext: ref.example.endsWith(".png") ? "png" : "jpg",
          origin: "fixture",
        },
      ];
    else if (!hasExample(ref)) continue;
    else if (ref.role === "character")
      out[ref.id] = [
        {
          bytes: read(
            new URL(
              "../docs/director-bundle/templates/character-intro.png",
              import.meta.url,
            ),
          ),
          ext: "png",
          origin: "fixture",
        },
      ];
    else if (ref.role === "track")
      out[ref.id] = [
        {
          bytes: read(new URL("media/pulse.wav", root)),
          ext: "wav",
          origin: "fixture",
          durationSeconds: 6,
        },
      ];
  }
  return out;
}
