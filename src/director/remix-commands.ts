import {
  BRIEF_PATH,
  briefFileEntries,
  activeReferences,
  readBrief,
  resolveBrief,
} from "./prompt-brief";
import {
  readParameters,
  setParameters,
} from "../../shared/director/layer-commands";
import { splitLayer } from "../../shared/director/split";
import {
  applyCommand as applyDirectorCommand,
  parseCommand as parseDirectorCommand,
} from "../../shared/director/commands";
import {
  isClipOp,
  type ClipCommand,
} from "../../shared/director/clip-commands";
import { validateFiles, type Bundle } from "./bundle";
import { validateProject } from "./validate";
import { importAssets } from "./import-media";
import {
  aliasAsset,
  assetUses,
  placeAsset,
  addTrack,
  placeTrack,
  removeAsset,
} from "../../shared/director/assets";
import { missingTrack } from "../../shared/director/track-slot";
import { checkAssetMedia } from "../../shared/director/asset-media";
import type { ApplyEffectCommand } from "../../shared/effects/types";
import { applyEffectToBundle } from "./effect-bundle";

export type DirectorCommand =
  | ApplyEffectCommand
  | (ClipCommand & { revision: number })
  | { op: "inspect" }
  | { op: "brief" }
  | { op: "assets" }
  | { op: "import-asset"; revision: number; use: "production" | "reference" }
  | { op: "use-asset"; revision: number; assetId: string; layerIds: string[] }
  | {
      op: "alias-asset";
      revision: number;
      assetId: string;
      use: "production" | "reference";
    }
  | { op: "remove-asset"; revision: number; assetId: string }
  | { op: "plate"; revision: number }
  | { op: "text"; revision: number; layerId: string; text: string }
  | { op: "replace"; revision: number; layerIds: string[] }
  | {
      op: "split";
      revision: number;
      layerId: string;
      frame: number;
      newId: string;
    }
  | { op: "project"; revision: number; project: unknown }
  | { op: "frame"; revision: number; assetId: string; frame: number }
  | { op: "cut"; revision: number; assetId: string; in: number; out: number };
export function parseCommand(value: unknown): DirectorCommand {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Command must be an object");
  const c = value as Record<string, unknown>;
  if (c.op === "apply-effect-preset")
    return parseDirectorCommand(c) as ApplyEffectCommand;
  if (typeof c.op === "string" && isClipOp(c.op)) {
    if (!Number.isSafeInteger(c.revision) || Number(c.revision) < 0)
      throw new Error("revision must be an integer");
    const { revision, ...command } = c;
    return {
      ...(parseDirectorCommand(command) as ClipCommand),
      revision: revision as number,
    };
  }
  const fields: Record<string, string[]> = {
    inspect: [],
    brief: [],
    assets: [],
    "import-asset": ["use"],
    "use-asset": ["assetId", "layerIds"],
    "alias-asset": ["assetId", "use"],
    "remove-asset": ["assetId"],
    plate: [],
    text: ["layerId", "text"],
    replace: ["layerIds"],
    split: ["layerId", "frame", "newId"],
    project: ["project"],
    frame: ["assetId", "frame"],
    cut: ["assetId", "in", "out"],
  };
  if (typeof c.op !== "string" || !Object.hasOwn(fields, c.op))
    throw new Error("Unknown command");
  const allowed = [
    "op",
    ...(["inspect", "assets", "brief"].includes(c.op) ? [] : ["revision"]),
    ...fields[c.op],
  ];
  if (
    Object.keys(c).some((k) => !allowed.includes(k)) ||
    allowed.some((k) => !(k in c))
  )
    throw new Error("Unexpected or missing command fields");
  if (
    !["inspect", "assets", "brief"].includes(c.op as string) &&
    (!Number.isInteger(c.revision) || Number(c.revision) < 0)
  )
    throw new Error("revision must be an integer");
  for (const k of ["frame", "in", "out"])
    if (k in c && (!Number.isInteger(c[k]) || Number(c[k]) < 0))
      throw new Error(`${k} must be a non-negative frame index`);
  for (const k of ["layerId", "assetId", "newId"])
    if (
      k in c &&
      (typeof c[k] !== "string" ||
        !/^[A-Za-z0-9_-]{1,80}$/.test(c[k] as string))
    )
      throw new Error(`Invalid ${k}`);
  if (c.op === "text" && (typeof c.text !== "string" || c.text.length > 80))
    throw new Error("Text limit is 80 characters");
  if (
    ["replace", "use-asset"].includes(c.op as string) &&
    (!Array.isArray(c.layerIds) ||
      !c.layerIds.length ||
      c.layerIds.length > 64 ||
      c.layerIds.some((id) => typeof id !== "string"))
  )
    throw new Error("Provide 1–64 layer IDs");
  if ("use" in c && c.use !== "production" && c.use !== "reference")
    throw new Error("Choose production or reference");
  return c as DirectorCommand;
}

export async function runDirectorCommand(
  bundle: Bundle,
  value: unknown,
  file?: File,
) {
  const c = parseCommand(value),
    p = bundle.project;
  if (c.op === "apply-effect-preset") {
    const { op: _op, ...input } = c;
    return applyEffectToBundle(bundle, input);
  }
  if (c.op === "brief") return { receipt: resolveBrief(bundle) };
  if (c.op === "inspect") return { receipt: structuredClone(p) };
  if (c.op === "assets")
    return {
      receipt: Object.entries(p.assets).map(([id, asset]) => ({
        id,
        ...structuredClone(asset),
        uses: [
          ...assetUses(p, id),
          ...activeReferences(readBrief(bundle))
            .filter((r) => r.assetId === id)
            .map((r) => `Prompt: ${r.label}`),
        ],
      })),
    };
  if (c.revision !== p.revision)
    throw new Error(
      "Project changed; inspect and retry with its current revision",
    );
  if (c.op === "plate")
    return (await import("./remix-media")).exportCleanPlate(bundle);
  if (c.op === "frame")
    return (await import("./remix-media")).exportAssetFrame(
      bundle,
      c.assetId,
      c.frame,
    );
  if (c.op === "cut")
    return (await import("./remix-media")).cutAssetVideo(
      bundle,
      c.assetId,
      c.in,
      c.out,
    );
  let next: Bundle;
  let assetIds: string[] | undefined;
  if (
    c.op === "split-clip" ||
    c.op === "duplicate-clip" ||
    c.op === "remove-clip" ||
    c.op === "set-muted" ||
    c.op === "set-gain"
  ) {
    const { revision: _revision, ...command } = c;
    const result = applyDirectorCommand({ project: p, prompt: "" }, command);
    if (!result.ok) throw new Error(result.error);
    next = { ...bundle, project: result.copy.project };
  } else if (c.op === "text") {
    const layer = p.layers.find((l) => l.id === c.layerId);
    if (layer?.kind !== "graphics" || !("text" in layer.parameters))
      throw new Error("Choose a text graphics layer");
    // The agents' set-parameters rule: declared, typed, within length.
    const project = setParameters(
      p,
      layer.id,
      readParameters({ text: c.text }),
    );
    next = { ...bundle, project: { ...project, revision: p.revision + 1 } };
  } else if (c.op === "split") {
    next = { ...bundle, project: splitLayer(p, c.layerId, c.frame, c.newId) };
  } else if (c.op === "project") {
    const project = structuredClone(validateProject(c.project));
    project.revision = p.revision + 1;
    next = { ...bundle, project };
  } else if (c.op === "import-asset") {
    if (!file) throw new Error("Attach a media file");
    const imported = await importAssets(bundle, [file], c.use);
    next = imported.bundle;
    assetIds = imported.assetIds;
  } else if (c.op === "use-asset") {
    next = {
      ...bundle,
      project: onTrack(p, c.layerIds)
        ? putTrack(p, c.assetId, c.layerIds[0], `asset-${crypto.randomUUID()}`)
        : placeAsset(p, c.assetId, c.layerIds, `asset-${crypto.randomUUID()}`),
    };
  } else if (c.op === "alias-asset") {
    const project = structuredClone(p);
    const id = aliasAsset(
      project,
      c.assetId,
      c.use,
      `asset-${crypto.randomUUID()}`,
    );
    project.revision++;
    next = { ...bundle, project };
    assetIds = [id];
  } else if (c.op === "remove-asset") {
    if (
      activeReferences(readBrief(bundle)).some((r) => r.assetId === c.assetId)
    )
      throw new Error(
        "Asset is used in the project prompt. Swap or remove that reference first.",
      );
    const project = removeAsset(p, c.assetId);
    const paths = new Set(
      [...Object.values(project.assets), ...Object.values(project.modules)].map(
        (a) => a.file.path,
      ),
    );
    next = {
      project,
      files: new Map(
        [...bundle.files].filter(
          ([path]) =>
            paths.has(path) ||
            path === BRIEF_PATH ||
            briefFileEntries(bundle).some((f) => f.file.path === path),
        ),
      ),
    };
  } else if (onTrack(p, c.layerIds)) {
    // The Track slot: WAV, MP3 or FLAC by the shared asset rule.
    if (
      !file ||
      checkAssetMedia({
        filename: file.name,
        contentType: file.type,
        size: file.size,
      }).kind !== "audio"
    )
      throw new Error("Attach a WAV, MP3 or FLAC track");
    const imported = await importAssets(bundle, [file], "production");
    const project = putTrack(
      imported.bundle.project,
      imported.assetIds[0],
      c.layerIds[0],
      `asset-${crypto.randomUUID()}`,
    );
    project.revision = p.revision + 1;
    next = { ...imported.bundle, project };
  } else {
    if (!file || !/^(image|video)\//.test(file.type))
      throw new Error("Attach a replacement image or video");
    const imported = await importAssets(bundle, [file], "production");
    const project = placeAsset(
      imported.bundle.project,
      imported.assetIds[0],
      c.layerIds,
      `asset-${crypto.randomUUID()}`,
    );
    project.revision = p.revision + 1;
    next = { ...imported.bundle, project };
  }
  await validateFiles(next);
  return {
    bundle: next,
    receipt: {
      op: c.op,
      revision: next.project.revision,
      ...(assetIds ? { assetIds } : {}),
    },
  };
}

/**
 * One audio layer as the target: a track replacement, not a plate. The
 * layer may be the template's declared track the project has no lane for.
 */
function onTrack(project: Bundle["project"], layerIds: string[]) {
  const missing = missingTrack(project)?.id;
  const audio = layerIds.filter(
    (id) =>
      id === missing ||
      project.layers.find((l) => l.id === id)?.kind === "audio",
  );
  if (!audio.length) return false;
  if (layerIds.length !== 1)
    throw new Error("A track replaces one audio layer");
  return true;
}
/** Place on the audio layer, or add the template's missing track first. */
function putTrack(
  project: Bundle["project"],
  assetId: string,
  layerId: string,
  aliasId: string,
) {
  const missing = missingTrack(project);
  return missing?.id === layerId
    ? addTrack(project, assetId, missing, missing.below, aliasId)
    : placeTrack(project, assetId, layerId, aliasId);
}
