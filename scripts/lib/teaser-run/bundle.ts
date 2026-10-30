import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { mixProject, type MixSpec } from "../../../shared/templates/mix";
import { validateProject } from "../../../src/director/validate";
import { currentRecipes, runMedia } from "./legacy";
import { ROOT, verify } from "./verify";

/** Build the run as its own editable bundle without changing the template. */
export function runBundle(target: string): Uint8Array {
  const checked = verify(target);
  if (checked.exitCode) throw new Error(checked.text);
  const raw = JSON.parse(
    readFileSync(path.join(target, "cut.json"), "utf8"),
  ) as MixSpec;
  const cut = currentRecipes(raw);
  const media = runMedia(cut);
  const files: Record<string, Uint8Array> = {};
  const inputs = Object.fromEntries(
    Object.entries(media).map(([id, item]) => {
      const bytes = readFileSync(path.join(ROOT, "public", item.url));
      files[item.path] = bytes;
      return [
        id,
        { ...item, sha256: createHash("sha256").update(bytes).digest("hex") },
      ];
    }),
  );
  const registry = JSON.parse(
    readFileSync(
      path.join(ROOT, "docs/director-bundle/example/studio.json"),
      "utf8",
    ),
  );
  const built = mixProject(cut, "Teaser run", inputs, registry.modules);
  const project = validateProject({ ...built, id: "genobi-teaser-run" });
  for (const module of Object.values(project.modules))
    files[module.file.path] = readFileSync(
      path.join(ROOT, "docs/director-bundle/example", module.file.path),
    );
  files["project.json"] = strToU8(JSON.stringify(project));
  return zipSync(files, { level: 0 });
}
