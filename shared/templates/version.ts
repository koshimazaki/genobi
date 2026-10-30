import { applyCommand, type DirectorCommand } from "../director/commands";
import type { Project } from "../director/types";
import { planTemplate } from "./plan";
import { findHouseTemplate, findMixTemplate } from "./catalogue";
import type { HouseTemplate, TemplateReference } from "./types";

export const versionTemplate = (project: Project) =>
  findHouseTemplate(project.template?.id ?? project.id) ??
  findMixTemplate(project.template?.id ?? project.id);

export interface VersionSlot {
  id: string;
  label: string;
  kind: "image" | "audio" | "video";
  min: number;
  max: number;
  hint: string;
  reference?: TemplateReference;
  /** Stable layer identities, independent of which asset is currently there. */
  layers: string[];
  defaultAsset?: string;
  picture?: { layer: string; parameter: string; url: string };
}

/** Intake from declarations, including the cut/media of a finished mix. */
export function versionSlots(template: HouseTemplate): VersionSlot[] {
  const references = template.references.map((reference) => ({
    ...reference,
    reference,
    layers: template.tracks
      .filter((t) => t.kind === "audio" && t.reference === reference.id)
      .map((t) => t.id),
  }));
  const mix = template.mix;
  if (!mix) return references;
  return [
    ...references,
    ...Object.entries(mix.media).map(([id, m]): VersionSlot => ({
      id,
      label: m.kind === "audio" ? (mix.cut.trackName ?? "Track") : id,
      kind: m.kind,
      min: 1,
      max: 1,
      hint: "Replaces this source throughout the cut, keeping timing and overlays.",
      defaultAsset: id,
      layers:
        m.kind === "audio"
          ? mix.cut.track.asset === id
            ? ["track"]
            : []
          : mix.cut.shots.flatMap((s, i) =>
              s.asset === id
                ? [
                    `shot-${String(i + 1).padStart(2, "0")}`,
                    `shot-${String(i + 1).padStart(2, "0")}-hold`,
                  ]
                : [],
            ),
    })),
    ...mix.cut.layers.flatMap((layer) =>
      Object.entries(layer.parameters)
        .filter(
          ([, value]) =>
            typeof value === "string" &&
            /^\/media\/[a-z0-9/_-]+\.(png|jpg|webp)$/.test(value),
        )
        .map(([parameter, url]): VersionSlot => ({
          id: `${layer.id}-${parameter}`,
          label: `${layer.name} · ${parameter}`,
          kind: "image",
          min: 1,
          max: 1,
          hint: "The picture inside this graphic; its text and animation stay editable.",
          layers: [],
          picture: { layer: layer.id, parameter, url: String(url) },
        })),
    ),
  ];
}

/** Longest source range the current cut needs, including each clip's in-point. */
export function versionSourceSeconds(project: Project, slot: VersionSlot) {
  return Math.max(
    0,
    ...project.layers
      .filter((l) => slot.layers.includes(l.id))
      .map(
        (l) =>
          (("sourceStartFrame" in l ? l.sourceStartFrame : 0) +
            l.durationFrames) /
          project.composition.fps,
      ),
  );
}

/** A generated shot goes back to its declared plate, or its missing slot. */
export function versionPlacement(
  project: Project,
  template: HouseTemplate,
  shotId: string,
  assetId: string,
): DirectorCommand {
  const layerId = `shot-${shotId}`;
  if (project.layers.some((l) => l.id === layerId))
    return { op: "replace-plate", layerId, assetId };
  const shot = planTemplate(template, project.template?.inputs).shots.find(
    (s) => s.id === shotId,
  );
  if (!shot) throw new Error("This shot is not declared by the template.");
  const track = template.tracks.find((t) => t.kind === "shots")?.id;
  const fps = project.composition.fps;
  return {
    op: "add-clip",
    layerId,
    assetId,
    track:
      track && project.layers.some((l) => l.track === track) ? track : "new",
    startFrame: Math.round(shot.start * fps),
    durationFrames:
      Math.round((shot.start + shot.seconds) * fps) -
      Math.round(shot.start * fps),
    name: shot.label,
  };
}

/** The same shared command parser as agent writes, guarded by revision. */
export function versionCommand(
  project: Project,
  revision: number,
  command: DirectorCommand,
) {
  if (project.revision !== revision)
    throw new Error("Project changed; review the current timeline first.");
  const result = applyCommand({ project, prompt: "" }, command);
  if (!result.ok) throw new Error(result.error);
  return result.copy.project;
}
