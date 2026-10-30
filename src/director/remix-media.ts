import type { Bundle } from "./bundle";
import { FrameSource } from "../dual-editor/frame-source";
import { captureDecodedFrame } from "../dual-editor/export-frame";
import { renderEdit } from "../dual-editor/timeline-export";

function assetFile(bundle: Bundle, id: string) {
  const asset = bundle.project.assets[id];
  if (!asset || !["image", "video"].includes(asset.kind))
    throw new Error("Choose an image/video asset");
  const bytes = bundle.files.get(asset.file.path);
  if (!bytes) throw new Error("Missing media bytes");
  const name = asset.file.path.split("/").pop()!;
  const ext = name.split(".").pop()!;
  return new File([bytes], name, {
    type:
      asset.kind === "video"
        ? `video/${ext === "mov" ? "quicktime" : ext}`
        : `image/${ext === "jpg" ? "jpeg" : ext}`,
  });
}
export async function exportAssetFrame(
  bundle: Bundle,
  assetId: string,
  frame: number,
) {
  const controller = new AbortController();
  const source = await FrameSource.open(
    assetFile(bundle, assetId),
    controller.signal,
    () => {},
  );
  try {
    if (!source.frames[frame]) throw new Error("Frame is outside this asset");
    const result = await captureDecodedFrame(
      source,
      frame,
      await source.decode(frame),
      "A",
    );
    return {
      blob: result.blob,
      filename: result.filename,
      receipt: {
        op: "frame",
        assetId,
        frame,
        timestamp: result.timestamp,
        width: result.width,
        height: result.height,
      },
    };
  } finally {
    source.dispose();
  }
}
export async function cutAssetVideo(
  bundle: Bundle,
  assetId: string,
  start: number,
  end: number,
) {
  if (bundle.project.assets[assetId]?.kind !== "video")
    throw new Error("Choose a video asset");
  const controller = new AbortController(),
    file = assetFile(bundle, assetId);
  const engine = await FrameSource.open(file, controller.signal, () => {});
  try {
    const blob = await renderEdit(
      [
        {
          id: "cut",
          source: assetId,
          lane: "A",
          start: 0,
          in: start,
          out: end,
          muted: false,
        },
      ],
      new Map([[assetId, { id: assetId, file, engine, url: "", thumb: "" }]]),
      "mp4",
      controller.signal,
      () => {},
    );
    return {
      blob,
      filename: `director-cut-${start}-${end}.mp4`,
      receipt: { op: "cut", assetId, in: start, out: end, bytes: blob.size },
    };
  } finally {
    engine.dispose();
  }
}

/** Render the same timeline without captions, filters or soundtrack for Comfy. */
export async function exportCleanPlate(bundle: Bundle) {
  const { DirectorRenderer } = await import("./renderer");
  const { exportMp4 } = await import("./export");
  const project = structuredClone(bundle.project);
  project.layers = project.layers.filter(
    (l) => l.kind === "image" || l.kind === "video",
  );
  if (!project.layers.length) throw new Error("Add an image/video layer first");
  const renderer = new DirectorRenderer(
    { ...bundle, project },
    document.createElement("canvas"),
  );
  try {
    await renderer.init();
    const blob = await exportMp4(
      renderer,
      () => {},
      new AbortController().signal,
    );
    return {
      blob,
      filename: "director-clean-plate.mp4",
      receipt: {
        op: "plate",
        ...project.composition,
        bytes: blob.size,
        note: "No titles, filters or soundtrack. Create a matching mask video in ComfyUI.",
      },
    };
  } finally {
    renderer.dispose();
  }
}
