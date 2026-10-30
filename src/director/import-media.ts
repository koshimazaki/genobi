import type { Bundle } from "./bundle";
import { digest } from "./bundle";
import type { Layer, Asset } from "../../shared/director/types";
import { waitFor } from "./media";
import { videoDuration } from "./video-source";
import {
  DIRECTOR_MEDIA_BYTES,
  DIRECTOR_MEDIA_LIMIT,
  DIRECTOR_PROJECT_BYTES,
  DIRECTOR_PROJECT_LIMIT,
  MEDIA_DURATION_EPSILON_SECONDS,
} from "../../shared/director/types";
import { validateProject } from "./validate";
import { placeAsset } from "../../shared/director/assets";
export async function ingestFile(file: File) {
  if (file.size > DIRECTOR_MEDIA_BYTES)
    throw new Error(`Each media file must be under ${DIRECTOR_MEDIA_LIMIT}`);
  const kind = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/")
        ? "audio"
        : null;
  if (!kind) throw new Error(`Unsupported media: ${file.name}`);
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !/^[a-z0-9]+$/.test(ext)) throw new Error("Unsupported filename");
  if (kind === "image" && !["png", "jpg", "jpeg", "webp"].includes(ext))
    throw new Error("Use PNG, JPEG or WebP images");
  const id = `asset-${crypto.randomUUID()}`,
    path = `media/${id}/${
      (file.name
        .slice(0, -(ext.length + 1))
        .replace(/[^A-Za-z0-9_-]/g, "_")
        .slice(-60) || "media") +
      "." +
      ext
    }`,
    bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === "image") {
    const image = await createImageBitmap(file);
    try {
      if (
        !image.width ||
        !image.height ||
        image.width * image.height > 16000000
      )
        throw new Error("Image exceeds 16 megapixels");
    } finally {
      image.close();
    }
  }
  let duration: number | undefined;
  if (kind === "video") {
    duration = await videoDuration(bytes);
  } else if (kind === "audio") {
    const media = document.createElement(kind),
      url = URL.createObjectURL(file);
    media.preload = "metadata";
    media.src = url;
    try {
      await waitFor(media, "loadedmetadata", () => media.readyState >= 1);
      duration = media.duration;
      if (!Number.isFinite(duration))
        throw new Error("Media duration unavailable");
    } finally {
      media.removeAttribute("src");
      media.load();
      URL.revokeObjectURL(url);
    }
  }
  const asset: Asset = {
    kind,
    use: "production",
    origin: "uploaded",
    file: { path, sha256: await digest(bytes) },
    ...(duration !== undefined ? { durationSeconds: duration } : {}),
  };
  return { id, asset, bytes };
}

export async function importAssets(
  bundle: Bundle,
  files: File[],
  use: Asset["use"],
) {
  const project = structuredClone(bundle.project),
    data = new Map(bundle.files);
  const assetIds: string[] = [];
  for (const file of files) {
    const item = await ingestFile(file);
    const duplicate = Object.entries(project.assets).find(
      ([, a]) =>
        a.kind === item.asset.kind &&
        a.use === use &&
        a.file.sha256 === item.asset.file.sha256,
    );
    if (duplicate) {
      assetIds.push(duplicate[0]);
      continue;
    }
    const shared = Object.values(project.assets).find(
      (a) => a.file.sha256 === item.asset.file.sha256,
    );
    if (shared) item.asset.file = { ...shared.file };
    item.asset.use = use;
    project.assets[item.id] = item.asset;
    data.set(item.asset.file.path, item.bytes);
    assetIds.push(item.id);
  }
  if (
    [...data.values()].reduce((n, b) => n + b.byteLength, 0) >
    DIRECTOR_PROJECT_BYTES
  )
    throw new Error(`Project media exceeds ${DIRECTOR_PROJECT_LIMIT}`);
  project.revision++;
  validateProject(project);
  return { bundle: { project, files: data }, assetIds };
}

export async function addMedia(
  bundle: Bundle,
  files: File[],
  frame: number,
  replaceId?: string,
  imageFrames = bundle.project.composition.fps,
): Promise<Bundle> {
  let project = structuredClone(bundle.project);
  const data = new Map(bundle.files),
    { fps, durationFrames } = project.composition;
  let start = frame;
  for (const file of files) {
    const { id, asset, bytes } = await ingestFile(file);
    const {
      kind,
      durationSeconds: duration,
      file: { path },
    } = asset;
    project.assets[id] = asset;
    data.set(path, bytes);
    if (replaceId) {
      const l = project.layers.find((l) => l.id === replaceId);
      if (!l || !("assetId" in l) || l.locked)
        throw new Error("Replacement must match an unlocked media layer");
      if (l.kind === kind) l.assetId = id;
      // A clip over a still (a template plate) or a still over a clip keeps
      // the layer's place and length; placeAsset checks the source covers it.
      else if (l.kind !== "audio" && kind !== "audio")
        project = placeAsset(project, id, [replaceId], id);
      else throw new Error("Replacement must match an unlocked media layer");
    } else {
      if (start >= durationFrames)
        throw new Error(
          "No room for all files; move playhead earlier or extend the composition",
        );
      const durationFramesForLayer = Math.max(
        1,
        Math.min(
          durationFrames - start,
          kind === "image"
            ? imageFrames
            : Math.floor((duration! + MEDIA_DURATION_EPSILON_SECONDS) * fps),
        ),
      );
      const base = {
        id: `layer-${crypto.randomUUID().slice(0, 8)}`,
        name: file.name.slice(0, 120),
        kind,
        startFrame: start,
        durationFrames: durationFramesForLayer,
        locked: false,
        assetId: id,
      };
      const layer = {
        ...base,
        ...(kind === "audio"
          ? { sourceStartFrame: 0, gain: 1 }
          : {
              fit: "contain",
              opacity: 1,
              position: { x: 0, y: 0 },
              scale: 1,
              rotationDegrees: 0,
              ...(kind === "video" ? { sourceStartFrame: 0 } : {}),
            }),
      } as Layer;
      const firstGraphic = project.layers.findIndex(
        (l) => l.kind === "graphics" || l.kind === "filter",
      );
      project.layers.splice(
        firstGraphic < 0 ? project.layers.length : firstGraphic,
        0,
        layer,
      );
      if (kind === "image") start += durationFramesForLayer;
    }
  }
  if (
    [...data.values()].reduce((n, b) => n + b.byteLength, 0) >
    DIRECTOR_PROJECT_BYTES
  )
    throw new Error(`Project media exceeds ${DIRECTOR_PROJECT_LIMIT}`);
  project.revision = bundle.project.revision + 1;
  validateProject(project);
  return { project, files: data };
}
