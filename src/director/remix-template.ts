import { digest, loadExample, validateFiles, type Bundle } from "./bundle";
import type { Layer } from "../../shared/director/types";
import { templates, type TemplateId } from "./template-catalogue";

export async function loadRemix(
  id: TemplateId = "character-intro",
): Promise<Bundle> {
  const template = templates.find((t) => t.id === id)!;
  return buildRemix(
    await loadExample(),
    id,
    await Promise.all(
      template.slots.map(async (slot) => {
        const response = await fetch(slot.url);
        if (!response.ok) throw new Error("Template media unavailable");
        return new Uint8Array(await response.arrayBuffer());
      }),
    ),
  );
}
/** Build the same portable bundle used by both editor modes and ZIP exports. */
export async function buildRemix(
  base: Bundle,
  id: TemplateId,
  images: Uint8Array<ArrayBuffer>[],
): Promise<Bundle> {
  const template = templates.find((t) => t.id === id)!;
  if (images.length !== template.slots.length)
    throw new Error("Template media is incomplete");
  const project = structuredClone(base.project);
  project.id = id;
  project.name = template.name;
  project.composition = {
    ...project.composition,
    width: 360,
    height: 640,
    durationFrames: 180,
    fps: 30,
  };
  project.assets = { audio: project.assets.audio };
  project.modules = { caption: project.modules.caption };
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const shots: Layer[] = [];
  for (const [index, slot] of template.slots.entries()) {
    const path = `media/${slot.id}.png`,
      bytes = images[index];
    files.set(path, bytes);
    project.assets[slot.id] = {
      kind: "image",
      use: "production",
      origin: "fixture",
      file: { path, sha256: await digest(bytes) },
    };
    for (const [i, layerId] of slot.layerIds.entries()) {
      const shotIndex = id === "outfit-reveal" ? index : i;
      shots.push({
        id: layerId,
        name: slot.label + (slot.layerIds.length > 1 ? ` / ${i + 1}` : ""),
        kind: "image",
        assetId: slot.id,
        startFrame: id === "poster-motion" ? 0 : shotIndex * 90,
        durationFrames: id === "poster-motion" ? 180 : 90,
        locked: false,
        fit: "contain",
        opacity: 1,
        position: { x: 0, y: 0 },
        scale: 1,
        rotationDegrees: 0,
        motion: {
          scaleTo: id === "poster-motion" ? 1.12 : 1.045,
          xTo: 0,
          yTo: 0,
          opacityTo: 1,
        },
      });
    }
  }
  project.layers = [
    { ...project.layers[0], locked: true },
    ...shots,
    {
      id: "title",
      name: "Headline",
      kind: "graphics",
      moduleId: "caption",
      startFrame: 0,
      durationFrames: 180,
      locked: false,
      opacity: 1,
      position: { x: 0, y: 0 },
      scale: 1,
      rotationDegrees: 0,
      parameters: {
        text: template.headline,
        color: template.color,
        size: 36,
        bpm: 120,
      },
    },
  ];
  project.generationPlans = [];
  project.generations = [];
  for (const item of [project.assets.audio, project.modules.caption])
    files.set(item.file.path, base.files.get(item.file.path)!);
  return validateFiles({ project, files });
}
