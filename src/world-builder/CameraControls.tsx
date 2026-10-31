import ThemedSelect from "../components/ThemedSelect";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import { CAMERA_MOVES } from "./camera-moves";
import { shotPatch } from "./camera-shots";
import { Fold } from "./FloatingPanel";
import { Parameters } from "./Controls";
import { MotionView } from "./MotionView";
import { MoveSeconds, TakeLength } from "./TakeLength";
import { LoopControl } from "./LoopControl";
import { SceneCameraControls } from "./SceneCameraControls";
import { DescentCameraControls } from "./DescentViewControls";
import { getDescentView } from "./story-camera";
import { BUILDER_CHARACTER_MODELS as CHARACTER_MODELS } from "./character-catalog";
export function CameraControls({
  s,
  e,
  compact = false,
}: {
  s: BuilderSession;
  e: WorldEditor;
  compact?: boolean;
}) {
  const active =
    s.recipe.cameraMotion?.enabled && s.recipe.cameraMotion.base !== "legacy"
      ? "Camera path"
      : (CAMERA_MOVES.find((m) => m.key === s.recipe.cameraShot)?.label ??
        "Custom");
  const subject = e.prop
    ? ([e.prop.x, e.prop.y, e.prop.z] as [number, number, number])
    : s.recipe.avatar
      ? ([
          s.recipe.avatarPose.x,
          s.recipe.avatarPose.y,
          s.recipe.avatarPose.z,
        ] as [number, number, number])
      : undefined;
  const otherControls = (
    <>
      {s.recipe.avatar && (
        <button
          onClick={() => {
            const height = CHARACTER_MODELS[s.recipe.avatarAsset].height;
            e.chooseMode("shot");
            s.change({
              targetX: s.recipe.avatarPose.x,
              targetY: s.recipe.avatarPose.y + height * 0.55,
              targetZ: s.recipe.avatarPose.z,
              radius: Math.max(2, height * 3),
              azimuth: 25,
              elevation: 8,
              orbit: 0,
              dolly: 0,
              elevationEnd: null,
              cameraShot: "custom",
              ...(s.recipe.cameraMotion
                ? { cameraMotion: { ...s.recipe.cameraMotion, enabled: false } }
                : {}),
            });
          }}
        >
          Frame character
        </button>
      )}
      <label>
        Camera move
        <ThemedSelect
          aria-label="Camera move"
          value={
            CAMERA_MOVES.some((m) => m.key === s.recipe.cameraShot)
              ? s.recipe.cameraShot
              : "custom"
          }
          onChange={(event) => {
            const move = CAMERA_MOVES.find((m) => m.key === event.target.value);
            if (move) {
              e.chooseMode("shot");
              s.change(shotPatch(move.key, s.recipe, subject));
            }
          }}
        >
          <option value="custom" disabled>
            Custom framing
          </option>
          {CAMERA_MOVES.map((move) => (
            <option key={move.key} value={move.key}>
              {move.label}
            </option>
          ))}
        </ThemedSelect>
      </label>
      <div className="wb-active-shot">
        <div>
          <small>Active shot</small>
          <strong>{active}</strong>
        </div>
        {!compact && <TakeLength s={s} label="Active shot" />}
      </div>
      {(
        [
          ["Static views", "static"],
          ["Orbit moves", "orbit"],
          ["Follow shots", "follow"],
        ] as const
      ).map(([title, kind]) => (
        <Fold key={kind} title={title}>
          <div className="wb-shot-grid">
            {CAMERA_MOVES.filter((m) => m.kind === kind).map((m) => (
              <button
                key={m.key}
                aria-pressed={s.recipe.cameraShot === m.key}
                onClick={() => {
                  e.chooseMode("shot");
                  s.change(shotPatch(m.key, s.recipe, subject));
                }}
              >
                <span>{m.label}</span>
                <small>
                  {m.kind === "orbit"
                    ? `${m.degrees}°`
                    : m.kind === "follow"
                      ? "TRACK"
                      : "VIEW"}
                </small>
              </button>
            ))}
          </div>
        </Fold>
      ))}
      <Fold title="Motion view">
        <MotionView recipe={s.recipe} frame={s.frame} />
      </Fold>
      <Fold title="Lens & movement">
        <Parameters
          recipe={s.recipe}
          change={(patch) =>
            s.change({
              ...patch,
              cameraShot: "custom",
              ...(s.recipe.cameraMotion
                ? { cameraMotion: { ...s.recipe.cameraMotion, enabled: false } }
                : {}),
            })
          }
          names={[
            "fov",
            "azimuth",
            "elevation",
            "radius",
            "targetX",
            "targetY",
            "targetZ",
            "orbit",
            "dolly",
          ]}
        />
        <MoveSeconds s={s} />
        <LoopControl s={s} />
        <label>
          Curve
          <ThemedSelect
            value={s.recipe.cameraCurve}
            onChange={(ev) =>
              s.change({ cameraCurve: ev.target.value as "linear" })
            }
          >
            <option value="linear">Linear</option>
            <option value="easeInOut">Cubic S</option>
          </ThemedSelect>
        </label>
      </Fold>
      <SceneCameraControls s={s} e={e} expanded={compact ? false : undefined} />
      {e.mode === "edit" && (
        <button onClick={e.useView}>Use viewport as shot</button>
      )}
    </>
  );
  return (
    <>
      <DescentCameraControls s={s} e={e} />
      {getDescentView(s.recipe) ? (
        <Fold title="More camera settings">{otherControls}</Fold>
      ) : (
        otherControls
      )}
    </>
  );
}
