import { mixProject, type MixMedia } from "../../shared/templates/mix";
import type { HouseTemplate } from "../../shared/templates/types";
import { digest, loadExample, validateFiles, type Bundle } from "./bundle";

/**
 * A mix template as a Director project (`shared/templates/mix.ts`): its
 * bundled clips, end card and track, and the recipes its overlays use, taken
 * from the studio example so each module file is the registry's own bytes.
 * The same template and media give the same bundle.
 */
export async function buildMixBundle(
  template: HouseTemplate,
  base: Bundle,
  bytes: Record<string, Uint8Array<ArrayBuffer>>,
): Promise<Bundle> {
  const mix = template.mix;
  if (!mix) throw new Error(`${template.name} is not a mix`);
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const media: Record<string, MixMedia> = {};
  for (const [id, m] of Object.entries(mix.media)) {
    const file = bytes[id];
    if (!file) throw new Error(`${template.name}: ${id} is missing`);
    files.set(m.path, file);
    media[id] = {
      kind: m.kind,
      path: m.path,
      durationSeconds: m.durationSeconds,
      sha256: await digest(file),
    };
  }
  const project = mixProject(
    mix.cut,
    template.name,
    media,
    base.project.modules,
  );
  for (const m of Object.values(project.modules)) {
    const file = base.files.get(m.file.path);
    if (!file) throw new Error(`The ${m.file.path} recipe is missing`);
    files.set(m.file.path, file);
  }
  return validateFiles({ project, files });
}

/** `/director?example=<id>` for a mix: fetch its media and build it. */
export async function loadMixTemplate(template: HouseTemplate) {
  const mix = template.mix;
  if (!mix) throw new Error(`${template.name} is not a mix`);
  const entries = await Promise.all(
    Object.entries(mix.media).map(async ([id, m]) => {
      const response = await fetch(m.url);
      if (!response.ok) throw new Error("Template media unavailable");
      return [id, new Uint8Array(await response.arrayBuffer())] as const;
    }),
  );
  return buildMixBundle(
    template,
    await loadExample(),
    Object.fromEntries(entries),
  );
}
