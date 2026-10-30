import { strToU8 } from "fflate";
import characterStill from "../../docs/director-bundle/templates/character-intro.png?url";
import type { Asset, Layer, Project } from "../../shared/director/types";
import { withShotCameras } from "../../shared/director/template-commands";
import {
  checkPicks,
  hasExample,
  isTemplateAudioExt,
  isTemplateImageExt,
  readTemplateMedia,
  type ReferencePicks,
  type TemplateMediaExt,
} from "../../shared/templates/intake";
import { planTemplate, TIER_LABEL } from "../../shared/templates/plan";
import type {
  HouseTemplate,
  TemplateInputs,
} from "../../shared/templates/types";
import { digest, loadExample, validateFiles, type Bundle } from "./bundle";
import { contrastRatio, platePng } from "./plate";
import { BRIEF_PATH, readBrief, type PromptBrief } from "./prompt-brief";

/** One file for one of a template's references. */
export interface TemplateMedia {
  bytes: Uint8Array<ArrayBuffer>;
  /** A track is WAV or MP3 (`shared/templates/intake.ts`). */
  ext: TemplateMediaExt;
  origin: "fixture" | "uploaded";
  /** Required for audio: the track's length bounds its lane. */
  durationSeconds?: number;
}
export type TemplateReferences = Record<string, TemplateMedia[]>;

const FPS = 30;
const frames = (seconds: number) => Math.round(seconds * FPS);
const still = {
  opacity: 1,
  position: { x: 0, y: 0 },
  scale: 1,
  rotationDegrees: 0,
};
/**
 * The dark scrim the caption recipe (`anime-caption.mjs`) draws under its
 * words. A type swatch must read on it at WCAG AA for large text and above.
 */
export const CAPTION_SCRIM = "#080c14";
export const TYPE_CONTRAST = 4.5;
export const shotLayerId = (shotId: string) => `shot-${shotId}`;
export const plateAssetId = (shotId: string) => `plate-${shotId}`;

/**
 * A house template as a Director project: one lane of shots (palette plates
 * until their clips exist), the type, graphics and audio lanes it declares,
 * one not-run generation plan per shot carrying the planned prompt, and the
 * house style as the project brief. Same template, inputs and media: same
 * bundle, byte for byte.
 */
export async function buildTemplateBundle(
  base: Bundle,
  template: HouseTemplate,
  value: unknown = {},
  references: TemplateReferences = {},
): Promise<Bundle> {
  const plan = planTemplate(template, value);
  const { inputs } = plan;
  const portrait = inputs.aspect === "9:16";
  const [width, height] = portrait ? [360, 640] : [640, 360];
  const durationFrames = frames(plan.seconds);
  const { swatches } = template.style;
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const assets: Project["assets"] = {};
  const modules: Project["modules"] = {};
  async function add(
    id: string,
    asset: Omit<Asset, "file">,
    path: string,
    bytes: Uint8Array<ArrayBuffer>,
  ) {
    files.set(path, bytes);
    assets[id] = { ...asset, file: { path, sha256: await digest(bytes) } };
  }
  function module(id: "caption" | "rings") {
    const m = base.project.modules[id];
    const bytes = m && base.files.get(m.file.path);
    if (!bytes) throw new Error(`The ${id} recipe is missing from the base`);
    modules[id] = m;
    files.set(m.file.path, bytes);
  }

  const referenceIds: Record<string, string[]> = {};
  for (const ref of template.references) {
    const media = references[ref.id] ?? [];
    if (media.length < ref.min || media.length > ref.max)
      throw new Error(`${ref.label}: add ${ref.min} to ${ref.max}`);
    referenceIds[ref.id] = [];
    for (const [i, m] of media.entries()) {
      const id = `${ref.id}-${i + 1}`;
      if (
        !(ref.kind === "audio"
          ? isTemplateAudioExt(m.ext)
          : isTemplateImageExt(m.ext))
      )
        throw new Error(`${ref.label} takes ${ref.kind} files`);
      if (ref.kind === "audio" && !(m.durationSeconds! > 0))
        throw new Error(`${ref.label} needs its length`);
      await add(
        id,
        {
          kind: ref.kind,
          // A track plays on the timeline; stills only guide the shots.
          use: ref.kind === "audio" ? "production" : "reference",
          origin: m.origin,
          ...(ref.kind === "audio"
            ? { durationSeconds: m.durationSeconds }
            : {}),
        },
        `${ref.kind === "audio" ? "media" : "references"}/${id}.${m.ext}`,
        m.bytes,
      );
      referenceIds[ref.id].push(id);
    }
  }

  const [plateW, plateH] = portrait ? [36, 64] : [64, 36];
  // A World Builder take stands on the shots lane like a shot, after them.
  const slots = [...plan.shots, ...plan.takes];
  for (const [i, shot] of slots.entries())
    await add(
      plateAssetId(shot.id),
      { kind: "image", use: "production", origin: "fixture" },
      `media/plate-${shot.id}.png`,
      platePng(
        plateW,
        plateH,
        swatches[i % swatches.length].hex,
        swatches[(i + 1) % swatches.length].hex,
      ),
    );

  const layers: Layer[] = [];
  for (const track of template.tracks) {
    if (track.kind === "audio") {
      const assetId = referenceIds[track.reference][0];
      // An optional track not supplied yet: no lane until one is added.
      if (!assetId) continue;
      const seconds = assets[assetId].durationSeconds ?? 0;
      layers.push({
        id: track.id,
        name: track.name,
        kind: "audio",
        assetId,
        sourceStartFrame: 0,
        gain: 1,
        startFrame: 0,
        durationFrames: Math.min(durationFrames, Math.floor(seconds * FPS)),
        locked: false,
      });
    } else if (track.kind === "take-sound") {
      // No lane until the take's roomed WAV is in the project's assets.
      continue;
    } else if (track.kind === "shots") {
      for (const [i, shot] of slots.entries()) {
        const start = frames(shot.start);
        layers.push({
          id: shotLayerId(shot.id),
          name: `${String(i + 1).padStart(2, "0")} ${shot.label}`,
          kind: "image",
          assetId: plateAssetId(shot.id),
          track: track.id,
          startFrame: start,
          durationFrames: frames(shot.start + shot.seconds) - start,
          locked: false,
          fit: "contain",
          ...still,
        });
      }
    } else if (track.kind === "graphics") {
      module(track.module);
      layers.push({
        id: track.id,
        name: track.name,
        kind: "graphics",
        moduleId: track.module,
        parameters: { color: swatches[track.swatch].hex, count: track.count },
        startFrame: 0,
        durationFrames,
        locked: false,
        ...still,
        opacity: track.opacity,
      });
    } else {
      module("caption");
      const color = swatches[track.swatch].hex;
      if (contrastRatio(color, CAPTION_SCRIM) < TYPE_CONTRAST)
        throw new Error(
          `${track.name} would be unreadable on the caption scrim`,
        );
      const from = frames(plan.shots.find((s) => s.id === track.from)!.start);
      layers.push({
        id: track.id,
        name: track.name,
        kind: "graphics",
        moduleId: "caption",
        parameters: {
          text: inputs.title,
          color,
          size: track.size,
          bpm: inputs.bpm ?? 120,
        },
        startFrame: from,
        durationFrames: durationFrames - from,
        locked: false,
        ...still,
      });
    }
  }

  const project: Project = {
    schemaVersion: "director.bundle.v1",
    id: template.id,
    name: template.name,
    revision: 1,
    composition: {
      fps: FPS,
      durationFrames,
      width,
      height,
      colorSpace: "srgb",
      alpha: "straight",
      background: "#101316",
      ...(inputs.bpm ? { bpm: inputs.bpm } : {}),
    },
    assets,
    modules,
    layers,
    generationPlans: plan.shots.map((shot) => ({
      id: `plan-${shot.id}`,
      status: "not-run",
      replaceAssetId: plateAssetId(shot.id),
      referenceAssetIds: shot.references.flatMap((r) => referenceIds[r]),
      prompt: shot.prompt,
    })),
    generations: [],
    // The inputs travel with the project, so a reopened ZIP still knows its
    // subject, title, tempo and room.
    template: { id: template.id, inputs },
  };
  const bundle = { project, files };
  files.set(
    BRIEF_PATH,
    strToU8(JSON.stringify(brief(template, plan, referenceIds))),
  );
  readBrief(bundle);
  return validateFiles(bundle);
}

/** The house style as the project prompt, with the stills bound as tokens. */
function brief(
  template: HouseTemplate,
  plan: ReturnType<typeof planTemplate>,
  referenceIds: Record<string, string[]>,
): PromptBrief {
  const { style } = template;
  const stills = template.references
    .filter((r) => r.kind === "image")
    .flatMap((r) => referenceIds[r.id]);
  const references = stills.map((assetId, i) => ({
    id: `brief-${assetId}`,
    label: `Image ${i + 1}`,
    assetId,
  }));
  const text = [
    `${template.name} · ${style.name} · ${TIER_LABEL[template.tier]}`,
    `${template.inputs.subject.label}: ${plan.inputs.subject}`,
    `${template.inputs.title.label}: ${plan.inputs.title}`,
    `Look: ${style.look}`,
    `Lighting: ${style.lighting}`,
    `Palette: ${style.palette} (${style.swatches.map((s) => `${s.name} ${s.hex}`).join(", ")})`,
    `Negative space: ${style.negativeSpace}`,
    `Shots: ${plan.shots.map((s, i) => `${i + 1}. ${s.label}, ${s.seconds.toFixed(2).replace(/\.?0+$/, "")} s`).join("; ")}`,
    ...(plan.takes.length
      ? [
          `World Builder takes: ${plan.takes.map((t) => `${t.label} (${t.take}), ${t.seconds.toFixed(2)} s`).join("; ")}`,
        ]
      : []),
    ...(references.length
      ? [`References: ${references.map((r) => `[${r.label}]`).join(" ")}`]
      : []),
  ].join("\n");
  return { version: 1, text, references };
}

/**
 * The plan for the inputs the project was built with, read back from the
 * bundle, with the project's current frame, tempo and headline over them.
 * Each value is checked on its own: one the template cannot take (a stale
 * saved room, a headline over the title limit) falls back alone, to the saved
 * value or the template's default, and every other value is kept. A shot's
 * camera set by a Director command replaces the template's.
 */
export function projectPlan(template: HouseTemplate, project: Project) {
  const saved: Partial<TemplateInputs> =
    project.template?.id === template.id ? project.template.inputs : {};
  const { width, height, bpm } = project.composition;
  // The headline field edits the type layer, so its words are the title now.
  const type = project.layers.find((l) => l.id === "title");
  const current: Partial<TemplateInputs> = {
    aspect: width < height ? "9:16" : "16:9",
    ...(type?.kind === "graphics" && typeof type.parameters.text === "string"
      ? { title: type.parameters.text }
      : {}),
    ...(bpm ? { bpm } : {}),
  };
  const fits = (value: Partial<TemplateInputs>) => {
    try {
      planTemplate(template, value);
      return true;
    } catch {
      return false;
    }
  };
  let value: Partial<TemplateInputs> = {};
  for (const layer of [saved, current])
    for (const [key, field] of Object.entries(layer)) {
      const next = { ...value, [key]: field };
      if (fits(next)) value = next;
    }
  return withShotCameras(planTemplate(template, value), project);
}

async function fetchBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Template media unavailable");
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The sample media a template opens with: a reference's own `example` (the
 * anime teaser's Scrolls sheet and storyboard), else the remix character
 * still for character stills and the studio example's 120 BPM pulse for a
 * track, unless Genobi can make the reference (`hasExample`): the anime
 * teaser's track opens with no lane until one is dropped or made. Product
 * photos are optional, so none.
 */
export async function sampleReferences(
  template: HouseTemplate,
  base: Bundle,
): Promise<TemplateReferences> {
  const out: TemplateReferences = {};
  for (const ref of template.references) {
    if (ref.example) {
      const bytes = await fetchBytes(ref.example);
      const { ext, durationSeconds } = await readTemplateMedia(ref, bytes);
      out[ref.id] = [
        {
          bytes,
          ext,
          origin: "fixture",
          ...(durationSeconds ? { durationSeconds } : {}),
        },
      ];
    } else if (!hasExample(ref)) continue;
    else if (ref.role === "character")
      out[ref.id] = [
        {
          bytes: await fetchBytes(characterStill),
          ext: "png",
          origin: "fixture",
        },
      ];
    else if (ref.role === "track") {
      const audio = base.project.assets.audio;
      out[ref.id] = [
        {
          bytes: base.files.get(audio.file.path)!,
          ext: "wav",
          origin: "fixture",
          durationSeconds: audio.durationSeconds,
        },
      ];
    }
  }
  return out;
}

/** `/director?example=<id>`, with an optional `aspect` for the other variant. */
export async function loadHouseTemplate(
  template: HouseTemplate,
  search = "",
): Promise<Bundle> {
  const aspect = new URLSearchParams(search).get("aspect");
  const base = await loadExample();
  return buildTemplateBundle(
    base,
    template,
    aspect ? { aspect } : {},
    await sampleReferences(template, base),
  );
}

/**
 * The references a template opens with from the gallery's picks: the
 * person's dropped files, the samples where they kept the example, nothing
 * where they left it for Genobi to make (`shared/templates/intake.ts`).
 */
export function pickReferences(
  template: HouseTemplate,
  picks: ReferencePicks,
  samples: TemplateReferences,
  dropped: TemplateReferences,
): TemplateReferences {
  checkPicks(template, picks);
  const out: TemplateReferences = {};
  for (const ref of template.references) {
    const state = picks[ref.id] ?? "example";
    if (state === "missing") continue;
    const media = (state === "yours" ? dropped : samples)[ref.id] ?? [];
    if (state === "yours" && !media.length)
      throw new Error(`${ref.label}: drop a file, or keep the example`);
    out[ref.id] = media;
  }
  return out;
}

/**
 * The template as the gallery starts it, with the person's picks and the
 * inputs they edited there (the brief), checked by `readInputs`.
 */
export async function loadTemplateWith(
  template: HouseTemplate,
  picks: ReferencePicks,
  dropped: TemplateReferences,
  inputs: unknown = {},
): Promise<Bundle> {
  const base = await loadExample();
  const samples = await sampleReferences(template, base);
  return buildTemplateBundle(
    base,
    template,
    inputs,
    pickReferences(template, picks, samples, dropped),
  );
}
