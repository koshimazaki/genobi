import { strToU8, zipSync } from "fflate";
import type { Bundle } from "./bundle";
import type { Asset } from "../../shared/director/types";

export const BRIEF_PATH = "brief/prompt.json";
export interface PromptReference {
  id: string;
  label: string;
  assetId?: string;
  font?: { name: string; file: Asset["file"] };
}
export interface PromptBrief {
  version: 1;
  text: string;
  references: PromptReference[];
}
const safePath = /^brief\/fonts\/[A-Za-z0-9_-]+\.(ttf|otf|woff|woff2)$/;
export const emptyBrief = (): PromptBrief => ({
  version: 1,
  text: "",
  references: [],
});
export function readBrief(bundle: Bundle): PromptBrief {
  const bytes = bundle.files.get(BRIEF_PATH);
  if (!bytes) return emptyBrief();
  if (bytes.length > 64000) throw new Error("Prompt brief exceeds 64 KB");
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (
    !value ||
    value.version !== 1 ||
    typeof value.text !== "string" ||
    value.text.length > 12000 ||
    !Array.isArray(value.references) ||
    value.references.length > 32 ||
    Object.keys(value).some(
      (k) => !["version", "text", "references"].includes(k),
    )
  )
    throw new Error("Invalid project prompt");
  const ids = new Set<string>(),
    labels = new Set<string>();
  for (const r of value.references) {
    if (
      !r ||
      typeof r !== "object" ||
      typeof r.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(r.id) ||
      ids.has(r.id) ||
      typeof r.label !== "string" ||
      !/^(Image|Video|Inspiration|Font) [1-9][0-9]?$/.test(r.label) ||
      labels.has(r.label) ||
      Object.keys(r).some(
        (k) => !["id", "label", "assetId", "font"].includes(k),
      ) ||
      (r.assetId !== undefined) === (r.font !== undefined)
    )
      throw new Error("Invalid prompt reference");
    if (
      r.assetId !== undefined &&
      (typeof r.assetId !== "string" ||
        !/^[A-Za-z0-9_-]{1,80}$/.test(r.assetId))
    )
      throw new Error("Invalid prompt asset");
    if (r.font !== undefined) {
      const f = r.font;
      if (
        !f ||
        typeof f.name !== "string" ||
        f.name.length > 120 ||
        !f.file ||
        typeof f.file.path !== "string" ||
        typeof f.file.sha256 !== "string" ||
        !safePath.test(f.file.path) ||
        !/^[a-f0-9]{64}$/.test(f.file.sha256) ||
        Object.keys(f).some((k) => !["name", "file"].includes(k)) ||
        Object.keys(f.file).some((k) => !["path", "sha256"].includes(k))
      )
        throw new Error("Invalid prompt font");
    }
    ids.add(r.id);
    labels.add(r.label);
  }
  return value;
}
export function activeReferences(brief: PromptBrief) {
  return brief.references.filter((r) => brief.text.includes(`[${r.label}]`));
}
/**
 * Room for one more reference: at the 32 cap, bindings whose tokens were
 * deleted from the text are dropped. Below it they stay, so retyping a token
 * restores its file. Undefined when every slot is still in use.
 */
export function withReferenceRoom(brief: PromptBrief) {
  if (brief.references.length < 32) return brief;
  const active = activeReferences(brief);
  return active.length < 32 ? { ...brief, references: active } : undefined;
}
export function briefFileEntries(bundle: Bundle) {
  const brief = readBrief(bundle);
  return brief.references.flatMap((r) => (r.font ? [r.font] : []));
}
export function writeBrief(bundle: Bundle, brief: PromptBrief): Bundle {
  const files = new Map(bundle.files);
  files.set(BRIEF_PATH, strToU8(JSON.stringify(brief)));
  const next = {
    project: { ...bundle.project, revision: bundle.project.revision + 1 },
    files,
  };
  readBrief(next);
  return next;
}
export function referenceFile(bundle: Bundle, reference: PromptReference) {
  return (
    reference.font?.file ??
    (reference.assetId
      ? bundle.project.assets[reference.assetId]?.file
      : undefined)
  );
}
export function resolveBrief(bundle: Bundle) {
  const brief = readBrief(bundle);
  for (const token of brief.text.matchAll(
    /\[(?:Image|Video|Inspiration|Font) [1-9][0-9]?\]/g,
  )) {
    if (!brief.references.some((r) => `[${r.label}]` === token[0]))
      throw new Error(
        `${token[0]} is not assigned. Insert a reference using the Image, Video or Font picker.`,
      );
  }
  const references = activeReferences(brief).map((r) => {
    const asset = r.assetId ? bundle.project.assets[r.assetId] : undefined;
    const file = referenceFile(bundle, r);
    if (!file || !bundle.files.has(file.path))
      throw new Error(`${r.label} is missing. Choose another file.`);
    return {
      label: r.label,
      assetId: r.assetId,
      kind: r.font ? "font" : asset!.kind,
      role: r.font ? "font" : asset!.use,
      ...file,
    };
  });
  return {
    version: 1,
    projectId: bundle.project.id,
    prompt: brief.text,
    references,
  };
}
export function briefArchive(bundle: Bundle) {
  const brief = resolveBrief(bundle);
  const files: Record<string, Uint8Array> = {
    "brief.json": strToU8(JSON.stringify(brief, null, 2)),
  };
  for (const r of brief.references) files[r.path] = bundle.files.get(r.path)!;
  return new Blob([new Uint8Array(zipSync(files, { level: 0 }))], {
    type: "application/zip",
  });
}
export function nextReferenceLabel(
  brief: PromptBrief,
  kind: "Image" | "Video" | "Inspiration" | "Font",
) {
  for (let n = 1; n <= 99; n++) {
    const label = `${kind} ${n}`;
    if (!brief.references.some((r) => r.label === label)) return label;
  }
  throw new Error("Too many references");
}
