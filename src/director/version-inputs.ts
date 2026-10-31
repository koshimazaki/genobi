import { aliasAsset } from "../../shared/director/assets";
import { MAX_IMAGE_BYTES } from "../../shared/image";
import { MAX_AUDIO_BYTES } from "../../shared/audio";
import { checkReferences } from "../../shared/director/types";
import { readInputs } from "../../shared/templates/plan";
import { readTemplateMedia } from "../../shared/templates/intake";
import {
  versionCommand,
  versionSlots,
  type VersionSlot,
} from "../../shared/templates/version";
import type {
  HouseTemplate,
  TemplateInputs,
} from "../../shared/templates/types";
import { validateFiles, type Bundle } from "./bundle";
import { importAssets } from "./import-media";
import { BRIEF_PATH, readBrief, writeBrief } from "./prompt-brief";
import { bindVersionPicture } from "./version-pictures";
import { projectPlan } from "./house-template";
import { readVersionBrief } from "./version-brief";

export type VersionPicks = Record<string, string[]>;

function mixTitleFields(template: HouseTemplate) {
  return (
    template.mix?.cut.layers.flatMap((layer) =>
      Object.entries(layer.parameters)
        .filter(([, value]) => value === template.inputs.title.default)
        .map(([key]) => ({ layer: layer.id, key })),
    ) ?? []
  );
}

/** Headline edits already made in the timeline are the current input. */
export function versionTextInputs(
  bundle: Bundle,
  template: HouseTemplate,
): TemplateInputs {
  if (!template.mix) return projectPlan(template, bundle.project).inputs;
  const inputs = readInputs(template, bundle.project.template?.inputs);
  for (const field of mixTitleFields(template)) {
    const layer = bundle.project.layers.find((l) => l.id === field.layer);
    if (
      layer &&
      "parameters" in layer &&
      typeof layer.parameters[field.key] === "string"
    ) {
      try {
        return readInputs(template, {
          ...inputs,
          title: layer.parameters[field.key],
        });
      } catch {
        /* A longer hand-edited headline stays on its layer. */
      }
    }
  }
  return inputs;
}

export function slotAssets(bundle: Bundle, slot: VersionSlot): string[] {
  if (slot.picture) {
    const layer = bundle.project.layers.find(
      (l) => l.id === slot.picture!.layer,
    );
    const value =
      layer &&
      "parameters" in layer &&
      layer.parameters[slot.picture.parameter];
    return typeof value === "string" && value.startsWith("asset:")
      ? [value.slice(6)]
      : [];
  }
  if (slot.layers.length) {
    const layer = bundle.project.layers.find(
      (l) => slot.layers.includes(l.id) && "assetId" in l,
    );
    if (layer && "assetId" in layer) return [layer.assetId];
    if (slot.reference?.kind === "audio") return [];
  }
  if (!slot.reference) return slot.defaultAsset ? [slot.defaultAsset] : [];
  const bound = readBrief(bundle)
    .references.filter((r) => r.id.startsWith(`brief-${slot.id}-`))
    .flatMap((r) => (r.assetId ? [r.assetId] : []));
  if (bound.length || bundle.files.has(BRIEF_PATH)) return bound;
  return Object.keys(bundle.project.assets).filter((id) =>
    new RegExp(`^${slot.id}-[0-9]+$`).test(id),
  );
}

export const versionPicks = (
  bundle: Bundle,
  template: HouseTemplate,
): VersionPicks =>
  Object.fromEntries(
    versionSlots(template).map((slot) => [slot.id, slotAssets(bundle, slot)]),
  );

/** Read headers for existing assets too; metadata or a filename is not proof. */
export async function validateVersionAsset(
  bundle: Bundle,
  slot: VersionSlot,
  id: string,
) {
  const asset = bundle.project.assets[id];
  if (!asset || asset.kind !== slot.kind)
    throw new Error(`${slot.label}: choose ${slot.kind} media.`);
  const bytes = bundle.files.get(asset.file.path);
  if (!bytes) throw new Error(`${slot.label}: the media file is missing.`);
  if (slot.kind !== "video") {
    const facts = await readTemplateMedia(
      { label: slot.label, kind: slot.kind },
      bytes,
    );
    if (
      facts.durationSeconds !== undefined &&
      Math.abs(facts.durationSeconds - (asset.durationSeconds ?? 0)) > 0.05
    )
      throw new Error(`${slot.label}: the measured audio length changed.`);
  }
  const fps = bundle.project.composition.fps;
  for (const layer of bundle.project.layers.filter((l) =>
    slot.layers.includes(l.id),
  )) {
    if (layer.locked) throw new Error(`Unlock ${layer.name} first.`);
    if (asset.kind !== "image") {
      const end =
        (("sourceStartFrame" in layer ? layer.sourceStartFrame : 0) +
          layer.durationFrames) /
        fps;
      if ((asset.durationSeconds ?? 0) + 0.02 < end)
        throw new Error(
          `${slot.label}: needs at least ${end.toFixed(2)} seconds to keep the current timing.`,
        );
    }
  }
}

export async function importVersionFiles(
  bundle: Bundle,
  slot: VersionSlot,
  files: File[],
) {
  if (files.length < 1 || files.length > slot.max)
    throw new Error(`${slot.label}: choose 1 to ${slot.max} files.`);
  const limit =
    slot.kind === "image"
      ? MAX_IMAGE_BYTES
      : slot.kind === "audio"
        ? MAX_AUDIO_BYTES
        : Infinity;
  if (files.some((file) => file.size > limit))
    throw new Error(
      `${slot.label}: use ${slot.kind} under ${slot.kind === "image" ? "5" : "50"} MB.`,
    );
  // Validate before decoding/importing or mutating the draft.
  if (slot.kind !== "video")
    for (const file of files)
      await readTemplateMedia(
        { label: slot.label, kind: slot.kind },
        new Uint8Array(await file.arrayBuffer()),
      );
  const imported = await importAssets(
    bundle,
    files,
    slot.reference && slot.kind === "image" ? "reference" : "production",
  );
  for (const id of imported.assetIds)
    await validateVersionAsset(imported.bundle, slot, id);
  return imported;
}

/** A new bundle only: the caller commits once against the bundle it opened. */
export async function applyVersionInputs(
  bundle: Bundle,
  template: HouseTemplate,
  picks: VersionPicks,
  value: TemplateInputs,
  make: string[] = [],
) {
  const inputs = readInputs(template, value);
  const currentInputs = versionTextInputs(bundle, template);
  let next = {
    ...bundle,
    project: structuredClone(bundle.project),
    files: new Map(bundle.files),
  };
  let brief = readVersionBrief(next);
  const slots = versionSlots(template);
  if (Object.keys(picks).some((id) => !slots.some((slot) => slot.id === id)))
    throw new Error("Unknown template input slot.");
  const bindings: VersionPicks = {};
  for (const slot of slots) {
    const ids = picks[slot.id] ?? [];
    // A picture's declared static default is valid without an imported asset.
    const plannedInput = make.includes(slot.id);
    if (
      !(slot.picture && ids.length === 0) &&
      (ids.length > slot.max || (!plannedInput && ids.length < slot.min))
    )
      throw new Error(
        `${slot.label}: choose ${slot.min} to ${slot.max} files.`,
      );
    if (new Set(ids).size !== ids.length)
      throw new Error(`${slot.label}: choose distinct files.`);
    for (const id of ids) await validateVersionAsset(next, slot, id);
    bindings[slot.id] = ids;
    if (slot.picture) {
      if (ids[0]) next = await bindVersionPicture(next, slot, ids[0]);
      else
        next.project = versionCommand(next.project, next.project.revision, {
          op: "set-parameters",
          layerId: slot.picture.layer,
          parameters: { [slot.picture.parameter]: slot.picture.url },
        });
      continue;
    }
    if (slot.reference?.kind === "image") {
      const old = brief.references.filter((r) =>
        r.id.startsWith(`brief-${slot.id}-`),
      );
      brief = {
        ...brief,
        references: brief.references.filter((r) => !old.includes(r)),
      };
      for (const [i, assetId] of ids.entries()) {
        const used = new Set(brief.references.map((r) => r.label));
        const label =
          old[i]?.label ??
          Array.from({ length: 99 }, (_, n) => `Image ${n + 1}`).find(
            (label) => !used.has(label),
          );
        if (!label || used.has(label))
          throw new Error("No room for another template reference.");
        brief.references.push({
          id: `brief-${slot.id}-${i + 1}`,
          label,
          assetId,
        });
        if (!brief.text.includes(`[${label}]`)) brief.text += `\n[${label}]`;
      }
    }
    if (!ids[0] && slot.reference?.kind === "audio") {
      if (
        next.project.layers.some((l) => slot.layers.includes(l.id) && l.locked)
      )
        throw new Error(`Unlock ${slot.label} first.`);
      next.project.layers = next.project.layers.filter(
        (l) => !slot.layers.includes(l.id),
      );
    }
    if (!ids[0] || !slot.layers.length) continue;
    const assetId = aliasAsset(
      next.project,
      ids[0],
      "production",
      `version-${crypto.randomUUID()}`,
    );
    const targets = next.project.layers.filter((l) =>
      slot.layers.includes(l.id),
    );
    for (const layer of targets) {
      if (!("assetId" in layer)) continue;
      if (layer.kind === "audio") {
        next.project.layers = next.project.layers.map((l) =>
          l.id === layer.id ? { ...layer, assetId } : l,
        );
      } else {
        const inPoint =
          "sourceStartFrame" in layer ? layer.sourceStartFrame : 0;
        next.project = versionCommand(next.project, next.project.revision, {
          op: "replace-plate",
          layerId: layer.id,
          assetId,
        });
        next.project.layers = next.project.layers.map((l) =>
          l.id === layer.id && l.kind === "video"
            ? { ...l, sourceStartFrame: inPoint }
            : l,
        );
      }
    }
    if (!targets.length && slot.reference?.kind === "audio") {
      next.project = versionCommand(next.project, next.project.revision, {
        op: "add-clip",
        layerId: slot.layers[0],
        assetId,
        track: "new",
        startFrame: 0,
        durationFrames: Math.min(
          next.project.composition.durationFrames,
          Math.floor(
            next.project.assets[assetId].durationSeconds! *
              next.project.composition.fps,
          ),
        ),
        name: slot.label,
      });
    }
  }
  if (!template.mix) {
    next.project = versionCommand(next.project, next.project.revision, {
      op: "set-template-inputs",
      inputs: {
        subject: inputs.subject,
        ...(inputs.title !== currentInputs.title
          ? { title: inputs.title }
          : {}),
      },
    });
    next.project.generationPlans = next.project.generationPlans.map((g) => {
      const shot = template.shots.find((s) => `plan-${s.id}` === g.id);
      return shot
        ? {
            ...g,
            referenceAssetIds: shot.references.flatMap(
              (id) => bindings[id] ?? [],
            ),
          }
        : g;
    });
  } else {
    for (const field of mixTitleFields(template)) {
      const layer = next.project.layers.find((l) => l.id === field.layer);
      if (
        layer &&
        "parameters" in layer &&
        inputs.title !== currentInputs.title
      )
        next.project = versionCommand(next.project, next.project.revision, {
          op: "set-parameters",
          layerId: field.layer,
          parameters: { [field.key]: inputs.title },
        });
    }
    next.project.template = { id: template.id, inputs };
  }
  checkReferences(next.project);
  next = writeBrief(next, brief);
  return validateFiles(next);
}
