import ThemedSelect from "../components/ThemedSelect";
import { cameraAt, cameraTargetAt, cameraFovAt, type Recipe } from "./recipe";
import type { SceneVector } from "./scene-state";
import type { SceneRotation } from "./scene-rotation";
import type { SceneCameraMotion } from "./scene-camera";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import "./scene-motion-shortcuts.css";

/** An orbit is layered over the existing saved views, preserving their lenses. */
export function cameraOrbitPatch(
  recipe: Recipe,
  axis: SceneRotation["axis"] | "none",
  frame = 0,
): Partial<Recipe> {
  const path: SceneCameraMotion = (recipe.cameraMotion?.enabled
    ? recipe.cameraMotion
    : undefined) ?? {
    version: 1 as const,
    enabled: true,
    keys: [
      {
        id: "camera-orbit-start",
        frame: 0,
        position: [...cameraAt(recipe, frame)] as SceneVector,
        target: [...cameraTargetAt(recipe, frame)] as SceneVector,
        fov: cameraFovAt(recipe, frame),
        easing: "linear" as const,
      },
    ],
    audio: {
      enabled: false,
      source: "sub" as const,
      amount: 0.2,
      motion: "push" as const,
    },
  };
  const next: SceneCameraMotion = { ...path, enabled: true };
  if (axis === "none") delete next.orbit;
  else next.orbit = { axis, turns: 1 };
  return { cameraMotion: next };
}

export function SceneMotionShortcuts({
  s,
  e,
  onCamera,
}: {
  s: BuilderSession;
  e: WorldEditor;
  onCamera: () => void;
}) {
  if (s.recipe.scene === "neuro") return null;
  const disabled = !s.ready || s.busy || e.mode === "walk";
  const setOrbit = (axis: SceneRotation["axis"] | "none") => {
    e.chooseMode("shot", false);
    void s.change(cameraOrbitPatch(s.recipe, axis, s.frame));
  };
  const setRotation = (axis: SceneRotation["axis"] | "none") => {
    const motion = s.recipe.motion;
    if (!motion) return;
    const next = { ...motion };
    if (axis === "none") delete next.rotation;
    else next.rotation = { axis, turns: 1 };
    e.chooseMode("shot", false);
    void s.change({ motion: next });
  };
  return (
    <section
      className="wb-motion-shortcuts"
      aria-label="Camera and object movement"
    >
      <label>
        Camera orbit
        <ThemedSelect
          aria-label="Camera orbit during morph"
          disabled={disabled}
          value={
            s.recipe.cameraMotion?.enabled
              ? (s.recipe.cameraMotion.orbit?.axis ?? "none")
              : "none"
          }
          onChange={(event) =>
            setOrbit(event.target.value as SceneRotation["axis"] | "none")
          }
        >
          <option value="none">Saved views</option>
          <option value="y">360° · around Y</option>
          <option value="x">360° · around X</option>
          <option value="z">360° · around Z</option>
        </ThemedSelect>
      </label>
      {s.recipe.motion && (
        <label>
          Objects turn
          <ThemedSelect
            aria-label="Object rotation during morph"
            disabled={disabled}
            value={s.recipe.motion.rotation?.axis ?? "none"}
            onChange={(event) =>
              setRotation(event.target.value as SceneRotation["axis"] | "none")
            }
          >
            <option value="none">No added rotation</option>
            <option value="x">360° · X axis</option>
            <option value="y">360° · Y axis</option>
            <option value="z">360° · Z axis</option>
          </ThemedSelect>
        </label>
      )}
      <button type="button" disabled={disabled} onClick={onCamera}>
        Shots, angles & lens
      </button>
    </section>
  );
}
