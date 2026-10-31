import { createHash } from "node:crypto";
import { z } from "zod";
import { COPY_ID, DIRECTOR_ID } from "../shared/director/commands";
import type { Asset, Project } from "../shared/director/types";
import {
  inspectImage,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_REFERENCES,
  MAX_IMAGE_REQUEST_BYTES,
} from "../shared/image";
import type { GenobiApi } from "./api";

/** A file of a project this session already owns or explicitly linked. */
export const projectAssetSchema = z.strictObject({
  copyId: z.string().regex(COPY_ID),
  assetId: z.string().regex(DIRECTOR_ID),
});
export type ProjectAssetReference = z.infer<typeof projectAssetSchema>;

/** The server authorizes both reads; a manifest never grants another copy's files. */
export async function readProjectAsset(
  api: GenobiApi,
  reference: ProjectAssetReference,
  limit: number,
  kind?: Asset["kind"],
) {
  const { copyId, assetId } = projectAssetSchema.parse(reference);
  const route = `/api/projects/${encodeURIComponent(copyId)}` as const;
  const { project } = await api.get<{ project: Project }>(route);
  const asset = Object.hasOwn(project.assets, assetId)
    ? project.assets[assetId]
    : undefined;
  if (!asset || (kind && asset.kind !== kind))
    throw new Error(
      `Choose ${kind ? `an asset of kind ${kind}` : "an asset"} from this linked project.`,
    );
  if (!/^[a-f0-9]{64}$/.test(asset.file.sha256))
    throw new Error("The project asset has an invalid file hash.");
  const bytes = await api.bytes(`${route}/files/${asset.file.sha256}`, limit);
  if (createHash("sha256").update(bytes).digest("hex") !== asset.file.sha256)
    throw new Error(
      "The project asset changed while it was read. Read the project again.",
    );
  return { asset, bytes };
}

/** Resolve references inside the adapter; never make an LLM copy base64 media. */
export async function projectImageReferences(api: GenobiApi, value: unknown) {
  const references = z
    .array(projectAssetSchema)
    .min(1)
    .max(MAX_IMAGE_REFERENCES)
    .parse(value);
  const images: string[] = [];
  let total = 0;
  for (const reference of references) {
    const { bytes } = await readProjectAsset(
      api,
      reference,
      MAX_IMAGE_BYTES,
      "image",
    );
    total += bytes.length;
    if (total > MAX_IMAGE_REQUEST_BYTES * 0.7)
      throw new Error("Keep all references under 11 MB combined.");
    const { contentType } = inspectImage(bytes);
    images.push(
      `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`,
    );
  }
  return images;
}
