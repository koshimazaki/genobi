import { NOTE_TEXT_LIMIT } from "../../shared/director/notes";
import type { Project } from "../../shared/director/types";
import type { ShowcaseRecord } from "../../shared/showcase/types";
import {
  END_CARD_MODULE,
  upgradeEndCard,
} from "../../shared/templates/mix-end-card-upgrade";
import { loadExample, validateFiles, type Bundle } from "./bundle";

// The showcase projects (docs/director-bundle/showcase/): each record is
// small and read eagerly, so the gallery can list versions; a version's
// project file is read only when it opens.
const records = import.meta.glob(
  "../../docs/director-bundle/showcase/*/memory.json",
  { eager: true, import: "default" },
) as Record<string, ShowcaseRecord>;
const projects = import.meta.glob(
  "../../docs/director-bundle/showcase/*/project-v*.json",
  { import: "default" },
) as Record<string, () => Promise<Project>>;

export const showcases: ShowcaseRecord[] = Object.values(records);
export const findShowcase = (project: string | null | undefined) =>
  showcases.find((r) => r.project === project);
export const showcaseForTemplate = (template: string) =>
  showcases.find((r) => r.template === template);

export interface OpenedShowcase {
  bundle: Bundle;
  /** Said to the person when the version opens other than as recorded. */
  note: string;
}

/**
 * One version as an editable Director project, under its own id
 * (`<project>-v<N>`), so the person's edits are a copy of their own and the
 * record stays as it was. Media comes from the public URLs the record names.
 * A file the studio no longer ships (the Dimensions mix's baked end card,
 * versions 1 and 2) is not fetched: when it is the baked card, the editable
 * card stands in over the same frames and the note says so; anything else
 * refuses to open, naming where git keeps it.
 */
export async function loadShowcase(
  name: string,
  version: number,
  example: () => Promise<Bundle> = loadExample,
): Promise<OpenedShowcase> {
  const record = findShowcase(name);
  const entry = record?.versions.find((v) => v.version === version);
  const read = entry
    ? projects[`../../docs/director-bundle/showcase/${name}/${entry.file}`]
    : undefined;
  if (!record || !entry || !read)
    throw new Error("This showcase version is unavailable.");
  let project = structuredClone(await read());
  const base = await example();
  const missing = Object.entries(project.assets).filter(
    ([, a]) => !record.media[a.file.sha256]?.url,
  );
  let note = "";
  if (missing.length) {
    const upgraded = upgradeEndCard(
      project,
      base.project.modules[END_CARD_MODULE],
    );
    const ids = new Set(missing.map(([id]) => id));
    const stood =
      upgraded &&
      upgraded.covers.every((layer) =>
        ids.has(
          (project.layers.find((l) => l.id === layer) as { assetId?: string })
            .assetId ?? "",
        ),
      );
    if (!upgraded || !stood) {
      const [, asset] = missing[0];
      const git = record.media[asset.file.sha256]?.git;
      throw new Error(
        `${asset.file.path} is not shipped${git ? `; git show ${git.commit}:${git.path} recovers it` : ""}.`,
      );
    }
    const covered = new Set(upgraded.covers);
    project = {
      ...upgraded.project,
      assets: Object.fromEntries(
        Object.entries(upgraded.project.assets).filter(([id]) => !ids.has(id)),
      ),
      layers: upgraded.project.layers.filter((l) => !covered.has(l.id)),
    };
    const files = missing.map(([, a]) => a.file.path).join(", ");
    note =
      `v${version}'s baked end card (${files}) is not shipped: ${record.media[missing[0][1].file.sha256]?.reason ?? "the studio no longer carries it."} The editable end card stands in over the same frames.`.slice(
        0,
        NOTE_TEXT_LIMIT,
      );
    // Kept on the card as a frame note, so the change travels with the
    // project and is never silent, whichever way it was opened.
    const card = project.layers.find((l) => l.id === upgraded.layerId)!;
    project.notes = [
      ...(project.notes ?? []),
      {
        id: "showcase-stand-in",
        frame: card.startFrame,
        layerId: card.id,
        text: note,
        author: "agent",
      },
    ];
  }
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const m of Object.values(project.modules)) {
    const bytes = base.files.get(m.file.path);
    if (!bytes) throw new Error(`The ${m.file.path} recipe is missing`);
    files.set(m.file.path, bytes);
  }
  await Promise.all(
    Object.values(project.assets).map(async (a) => {
      const response = await fetch(record.media[a.file.sha256].url!);
      if (!response.ok) throw new Error("Showcase media unavailable");
      files.set(a.file.path, new Uint8Array(await response.arrayBuffer()));
    }),
  );
  return { bundle: await validateFiles({ project, files }), note };
}
