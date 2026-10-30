/** A downloadable input kit. Exporting never contacts a generation provider. */
import { creatureMotionReceipt } from "./creature-fbx";
import { CREATURE_SHA256 } from "./creature-file";
import { useState } from "react";
import { strToU8, zipSync } from "fflate";
import type { CameraPathPose, CameraPath } from "../../shared/camera-path";
import {
  sceneVideoPlan,
  sceneVideoReadme,
} from "../../shared/scene/video-plan";
import type { ObjectPose } from "./gestures";
import type { SceneSpec } from "./scenes";
import type { Capture } from "./stage";

export function LtxKit({
  scene,
  ready,
  capture,
  pose,
  object,
  cameraPath,
  camera,
  duration,
}: {
  scene: SceneSpec;
  ready: boolean;
  capture: () => Capture;
  pose: CameraPathPose;
  object: ObjectPose;
  cameraPath: CameraPath;
  camera: string;
  duration: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    let frame: Capture | undefined;
    try {
      const motions = creatureMotionReceipt();
      const plan = sceneVideoPlan(scene, { camera, duration });
      frame = capture();
      frame.render(pose, object, 0);
      const png = await new Promise<Blob>((resolve, reject) =>
        frame!.canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("The first frame could not be captured.")),
          "image/png",
        ),
      );
      const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2));
      const zip = zipSync({
        [plan.firstFrame]: new Uint8Array(await png.arrayBuffer()),
        "scene.json": json(scene),
        ...(scene.characters?.some((c) => c.asset === "creature")
          ? {
              "creature.json": json({
                sha256: CREATURE_SHA256,
                motions,
                modelIncluded: false,
                animationFilesIncluded: false,
              }),
            }
          : {}),
        "workflow.json": json(plan.graph),
        "camera-path.json": json(cameraPath),
        "plan.json": json({ ...plan, graph: undefined }),
        "README.md": strToU8(sceneVideoReadme(scene, plan)),
      });
      const url = URL.createObjectURL(
        new Blob([zip], { type: "application/zip" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${scene.id}-ltx-akuspace.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The kit could not be exported.",
      );
    } finally {
      frame?.dispose();
      setBusy(false);
    }
  }
  return (
    <section className="s3d-playblast" aria-label="LTX generation handoff">
      <button
        type="button"
        className="s3d-secondary"
        disabled={!ready || busy}
        onClick={() => void download()}
      >
        {busy ? "Preparing kit…" : "Export LTX + AKUSPACE kit"}
      </button>
      <p className="s3d-status">
        First-frame PNG, editable scene and local ComfyUI workflow. Add your own
        dry recording before running. Exporting starts no generation.
      </p>
      {error && (
        <p className="s3d-status" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
