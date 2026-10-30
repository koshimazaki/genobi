import type { GraphicsModule, Layer, Project } from "../director/types";
import { dimensionsMix } from "./dimensions-mix";

/**
 * Dimensions mix projects saved before 30 October 2026 (#221) carry the end
 * card as a baked capture: a video layer on `media/mix-end.mp4`, frames
 * 453 to 555, whose credit line is pixels. The studio no longer ships that
 * file, and a project copy opened in place of the template keeps it, so an
 * owner who hid the capture (an agent set its opacity to 0 when the credit
 * was wrong) sees black there. `upgradeEndCard` adds the editable `end-card`
 * recipe layer over the same frames, with the current cut's words; the old
 * video layer stays where it was, never dropped, so Undo or a delete is the
 * person's choice. See docs/dimensions-mix.md#projects-saved-before-the-editable-card.
 */
export const LEGACY_END_CARD = { asset: "mix-end", path: "media/mix-end.mp4" };
export const END_CARD_MODULE = "end-card";

const template = dimensionsMix.mix!.cut.layers.find(
  (l) => l.module === END_CARD_MODULE,
)!;
type Video = Extract<Layer, { kind: "video" }>;

/** The bundled clips and track every Dimensions mix copy carries. */
const LINEAGE: Record<string, string> = {
  "media/mix-01.mp4":
    "e7c7afc43122bc5b3947c0651f8c77f9edd38f6684b7ea81c8ef2b95617a1ad7",
  "media/mix-02.mp4":
    "b749a9b1ede414a9be563d0d9bcd188296a2e97ec688a105b48c1312a2fda4f4",
  "media/mix-03.mp4":
    "d4bbda0fc4f75bf243827c4b50767d240b8c3cb4c6e9b85bf8d52223a9d6fcf9",
  "media/mix-track.wav":
    "3528cd7a7b67732faee0f371bbab89de7952e5c3d06722f4a9490f12f9604286",
};
/**
 * A Dimensions mix by lineage, not by one file name: its own id (or a
 * showcase version's, `dimensions-mix-v<N>`), and the template's three
 * clips and track at their bundled paths and bytes. Another project that
 * happens to hold a `mix-end` file is not one.
 */
const MIX_ID = /^dimensions-mix(-v[1-9][0-9]*)?$/;
export function isDimensionsMix(project: Project) {
  if (!MIX_ID.test(project.id)) return false;
  const held = new Map(
    Object.values(project.assets).map((a) => [a.file.path, a.file.sha256]),
  );
  return Object.entries(LINEAGE).every(([path, sha]) => held.get(path) === sha);
}

/**
 * The baked card's video layers, when the project is a Dimensions mix that
 * never had the editable card (no `end-card` recipe); none for any other.
 */
export function legacyEndCards(project: Project): Video[] {
  if (
    !isDimensionsMix(project) ||
    // Once only: the upgrade adds the recipe, which stays when the person
    // later deletes the card, so a deleted card is not brought back.
    project.modules[END_CARD_MODULE]
  )
    return [];
  return project.layers.filter(
    (l): l is Video =>
      l.kind === "video" &&
      (l.assetId === LEGACY_END_CARD.asset ||
        project.assets[l.assetId]?.file.path === LEGACY_END_CARD.path),
  );
}

/**
 * The title slam's words on one line ("SUPERNATURAL / CREATURES" becomes
 * "SUPERNATURAL CREATURES"), when the project still has that slam and they
 * fit the card's subtitle; otherwise the cut's own subtitle.
 */
function subtitle(project: Project) {
  const slam = project.layers.find(
    (l) =>
      l.id === "title" && l.kind === "graphics" && l.moduleId === "kinetic",
  );
  const text =
    slam && slam.kind === "graphics" && typeof slam.parameters.text === "string"
      ? slam.parameters.text.replace(/\s*\/\s*/g, " ").trim()
      : "";
  return text && text.length <= 36 && !/[\u0000-\u001f\u007f]/.test(text)
    ? text
    : template.parameters.subtitle;
}

const freeId = (project: Project, id: string) => {
  const taken = new Set(project.layers.map((l) => l.id));
  let n = 1;
  let next = id;
  while (taken.has(next)) next = `${id}-${++n}`;
  return next;
};

export interface EndCardUpgrade {
  project: Project;
  /** The new layer's id, and the old video layers it now covers. */
  layerId: string;
  covers: string[];
}

/**
 * The project with the editable end card added over its baked one, or
 * undefined when it has none to replace. `module` is the trusted registry's
 * `end-card` recipe; the caller adds its file to the bundle. The revision is
 * left to the caller, which saves the change as an edit.
 */
export function upgradeEndCard(
  project: Project,
  module: GraphicsModule,
): EndCardUpgrade | undefined {
  const legacy = legacyEndCards(project);
  if (!legacy.length) return undefined;
  const startFrame = Math.min(...legacy.map((l) => l.startFrame));
  const end = Math.max(...legacy.map((l) => l.startFrame + l.durationFrames));
  const id = freeId(project, END_CARD_MODULE);
  const layer: Layer = {
    id,
    name: template.name,
    kind: "graphics",
    moduleId: END_CARD_MODULE,
    parameters: { ...template.parameters, subtitle: subtitle(project) },
    startFrame,
    durationFrames: end - startFrame,
    locked: false,
    opacity: 1,
    scale: 1,
    rotationDegrees: 0,
    position: { x: 0, y: 0 },
  };
  // Right above the last baked layer, where the template puts the card:
  // over the shots, under the glitch that hits on its first frame.
  const after = Math.max(...legacy.map((l) => project.layers.indexOf(l)));
  const layers = [...project.layers];
  layers.splice(after + 1, 0, layer);
  return {
    project: {
      ...project,
      modules: { ...project.modules, [END_CARD_MODULE]: module },
      layers,
    },
    layerId: id,
    covers: legacy.map((l) => l.id),
  };
}
