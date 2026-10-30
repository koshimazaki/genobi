/**
 * Load scene / Save scene beside the Scene picker. A loaded file is parsed
 * with `parseScene`; a refusal shows its reason here and changes nothing
 * else. Loaded scenes live in the panel's state only, like a dropped image.
 */
import { useRef } from "react";
import { parseScene } from "../../shared/scene/parse";
import type { SceneSpec } from "./scenes";

/** A pretty-printed scene stays well under this; the parser caps the document. */
export const SCENE_FILE_BYTES = 256_000;

/** Read and validate a scene file, or throw with the reason. */
export async function readSceneFile(file: Blob): Promise<SceneSpec> {
  if (file.size > SCENE_FILE_BYTES)
    throw new Error(
      `A scene file must be at most ${SCENE_FILE_BYTES / 1000} KB.`,
    );
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error("That file is not JSON.");
  }
  return parseScene(json);
}

export const sceneFileName = (scene: SceneSpec) => `${scene.id}.scene.json`;

function download(scene: SceneSpec) {
  const url = URL.createObjectURL(
    new Blob([`${JSON.stringify(scene, null, 2)}\n`], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = sceneFileName(scene);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function SceneFile({
  scene,
  error,
  onFile,
}: {
  scene: SceneSpec;
  error: string | null;
  onFile: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="s3d-scene-file">
      <div className="s3d-scene-file-row">
        <button type="button" onClick={() => input.current?.click()}>
          Load scene
        </button>
        <button type="button" onClick={() => download(scene)}>
          Save scene
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Scene file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />
      </div>
      {error && (
        <p className="s3d-scene-error" role="alert">
          Not loaded: {error}
        </p>
      )}
    </div>
  );
}
