import ThemedSelect from "../components/ThemedSelect";
import { NumberControl } from "./Controls";
import { Fold } from "./FloatingPanel";
import { cameraAt, cameraTargetAt, cameraFovAt } from "./recipe";
import {
  reverseSceneTravel,
  type SceneCameraKey,
  type SceneCameraMotion,
} from "./scene-camera";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import type { SceneVector } from "./scene-state";

export function SceneCameraControls({
  s,
  e,
  expanded,
}: {
  s: BuilderSession;
  e: WorldEditor;
  expanded?: boolean;
}) {
  const path = s.recipe.cameraMotion;
  const index =
    path?.keys.reduce(
      (best, candidate, i) =>
        Math.abs(candidate.frame - s.frame) <
        Math.abs(path.keys[best].frame - s.frame)
          ? i
          : best,
      0,
    ) ?? 0;
  const key = path?.keys[index];
  const update = (patch: Partial<SceneCameraMotion>) => {
    if (path) {
      e.chooseMode("shot", false);
      void s.change({ cameraMotion: { ...path, ...patch } });
    }
  };
  const updateKey = (patch: Partial<SceneCameraKey>) => {
    if (!path || !key) return;
    e.chooseMode("shot", false);
    s.run(async () => {
      const ok = await s.change({
        cameraMotion: {
          ...path,
          keys: path.keys.map((item, i) =>
            i === index ? { ...item, ...patch } : item,
          ),
        },
      });
      if (ok) await s.api.current!.render(patch.frame ?? key.frame);
    });
  };
  const updateAudio = (patch: Partial<SceneCameraMotion["audio"]>) => {
    if (path)
      s.tune({ cameraMotion: { ...path, audio: { ...path.audio, ...patch } } });
  };
  const create = () => {
    const frames = [
      0,
      Math.floor((s.recipe.frames - 1) / 2),
      s.recipe.frames - 1,
    ];
    e.chooseMode("shot", false);
    void s.change({
      cameraMotion: {
        version: 1,
        enabled: true,
        keys: frames.map((frame, i) => ({
          id: `camera-${i + 1}`,
          frame,
          position: [...cameraAt(s.recipe, frame)] as SceneVector,
          target: [...cameraTargetAt(s.recipe, frame)] as SceneVector,
          fov: cameraFovAt(s.recipe, frame),
          easing: "easeInOut",
        })),
        audio: { enabled: false, source: "sub", amount: 0.25, motion: "push" },
      },
    });
  };
  return (
    <Fold title="Camera path & audio" open={expanded ?? !!path?.enabled}>
      {!path ? (
        <>
          <p className="wb-hint">
            Turn this shot into three camera keys. Move its position, look
            target and lens together with the morph.
          </p>
          <button type="button" onClick={create}>
            Create camera path
          </button>
        </>
      ) : (
        <>
          <label className="wb-check">
            <input
              type="checkbox"
              checked={path.enabled}
              onChange={(ev) => update({ enabled: ev.target.checked })}
            />
            {path.base === "legacy"
              ? "Use camera modifiers"
              : "Use camera path"}
          </label>
          {path.base === "legacy" && (
            <p className="wb-hint">
              The selected camera move drives the loop. Orbit and audio add to
              that movement.
            </p>
          )}
          {path.base !== "legacy" && (
            <label>
              Camera key
              <ThemedSelect
                aria-label="Camera key"
                value={String(index)}
                onChange={(ev) => {
                  const next = Number(ev.target.value);
                  e.chooseMode("shot", false);
                  s.run(async () => {
                    await s.settled();
                    await s.api.current!.render(path.keys[next].frame);
                  });
                }}
              >
                {path.keys.map((item, i) => (
                  <option key={item.id} value={i}>
                    {i + 1} · {(item.frame / s.recipe.fps).toFixed(2)}s
                  </option>
                ))}
              </ThemedSelect>
            </label>
          )}
          {s.recipe.motion && path.base !== "legacy" && (
            <label className="wb-check">
              <input
                type="checkbox"
                checked={path.followMorph ?? false}
                onChange={(event) =>
                  update({ followMorph: event.target.checked })
                }
              />
              Camera follows saved states
            </label>
          )}
          {key && path.base !== "legacy" && (
            <>
              <div className="wb-motion-pair">
                <NumberControl
                  label="Camera key frame"
                  value={key.frame}
                  min={index ? path.keys[index - 1].frame + 1 : 0}
                  max={
                    index
                      ? (path.keys[index + 1]?.frame ?? s.recipe.frames) - 1
                      : 0
                  }
                  change={(frame) => {
                    if (Number.isInteger(frame)) updateKey({ frame });
                  }}
                />
                <NumberControl
                  label="Path lens °"
                  value={key.fov}
                  min={15}
                  max={100}
                  change={(fov) => updateKey({ fov })}
                />
              </div>
              {(["position", "target"] as const).map((field) => (
                <Fold
                  key={field}
                  title={
                    field === "position" ? "Camera position" : "Look target"
                  }
                >
                  {(["X", "Y", "Z"] as const).map((axis, i) => (
                    <NumberControl
                      key={axis}
                      label={`${field === "position" ? "Camera" : "Look"} ${axis}`}
                      value={key[field][i]}
                      min={-80}
                      max={80}
                      step={0.25}
                      change={(value) => {
                        const vector = [...key[field]] as SceneVector;
                        vector[i] = value;
                        updateKey({ [field]: vector });
                      }}
                    />
                  ))}
                </Fold>
              ))}
              <label>
                Path easing
                <ThemedSelect
                  value={key.easing}
                  aria-label="Path easing"
                  onChange={(ev) =>
                    updateKey({
                      easing: ev.target.value as SceneCameraKey["easing"],
                    })
                  }
                >
                  <option value="easeInOut">Ease in / out</option>
                  <option value="linear">Linear</option>
                </ThemedSelect>
              </label>
            </>
          )}
          <label className="wb-check">
            <input
              type="checkbox"
              checked={path.audio.enabled}
              onChange={(ev) => updateAudio({ enabled: ev.target.checked })}
            />
            Camera follows audio
          </label>
          <div className="wb-motion-pair">
            <label>
              Camera band
              <ThemedSelect
                aria-label="Camera band"
                value={path.audio.source}
                onChange={(ev) =>
                  updateAudio({
                    source: ev.target
                      .value as SceneCameraMotion["audio"]["source"],
                  })
                }
              >
                <option value="sub">Sub · 20–80 Hz</option>
                <option value="low">Bass · below 200 Hz</option>
                <option value="mid">Mid</option>
                <option value="high">High</option>
                <option value="level">Whole track</option>
              </ThemedSelect>
            </label>
            <label>
              Response
              <ThemedSelect
                aria-label="Camera response"
                value={path.audio.motion ?? "push"}
                onChange={(ev) =>
                  updateAudio({ motion: ev.target.value as "push" | "lift" })
                }
              >
                <option value="push">Push toward target</option>
                <option value="lift">Rise vertically</option>
              </ThemedSelect>
            </label>
          </div>
          <NumberControl
            label="Camera response amount"
            value={path.audio.amount}
            min={0}
            max={1}
            step={0.05}
            change={(amount) => updateAudio({ amount })}
          />
          <p className="wb-hint">
            Audio adds up to {path.audio.amount.toFixed(2)} m to the path. Zero
            is neutral. Load music in Sound; capture uses the same prepared
            signal.
          </p>
          {path.base !== "legacy" && (
            <button
              type="button"
              onClick={() =>
                s.run(async () => {
                  e.chooseMode("shot", false);
                  const ok = await s.change(reverseSceneTravel(s.recipe));
                  if (ok) await s.api.current!.render(0);
                })
              }
            >
              Reverse scene & camera
            </button>
          )}
        </>
      )}
    </Fold>
  );
}
