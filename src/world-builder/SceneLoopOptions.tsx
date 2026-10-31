import ThemedSelect from "../components/ThemedSelect";
import { Fold } from "./FloatingPanel";
import { StateAudioOptions } from "./SceneStateAudioControls";
import { SCENE_LOOP_SLOTS } from "./scene-loop";
import type { SceneRotation } from "./scene-rotation";
import type { BuilderSession } from "./useBuilderSession";
import type { SceneLoopController } from "./useSceneLoop";

function RotationSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value?: SceneRotation;
  disabled: boolean;
  onChange: (value: SceneRotation | undefined) => void;
}) {
  return (
    <label className="wb-loop-field">
      {label}
      <ThemedSelect
        aria-label={label}
        value={value?.axis ?? "none"}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value === "none"
              ? undefined
              : {
                  axis: event.target.value as SceneRotation["axis"],
                  turns: 1,
                },
          )
        }
      >
        <option value="none">None</option>
        <option value="y">360° · Y axis</option>
        <option value="x">360° · X axis</option>
        <option value="z">360° · Z axis</option>
      </ThemedSelect>
    </label>
  );
}

export function SceneLoopOptions({
  loop,
  s,
  onCamera,
  onSound,
}: {
  loop: SceneLoopController;
  s: BuilderSession;
  onCamera: () => void;
  onSound: () => void;
}) {
  return (
    <div className="wb-loop-options">
      <Fold title={`Movement · ${loop.cameraName}`}>
        <label className="wb-loop-field">
          Camera follows
          <ThemedSelect
            aria-label="Loop camera source"
            value={loop.cameraMode}
            disabled={loop.locked}
            onChange={(event) =>
              loop.setCameraMode(event.target.value as "saved" | "current")
            }
          >
            <option value="saved">Saved A–D views</option>
            <option value="current">Current camera move</option>
          </ThemedSelect>
        </label>
        <RotationSelect
          label="Added camera orbit"
          value={loop.orbit}
          disabled={loop.locked}
          onChange={loop.setOrbit}
        />
        <RotationSelect
          label="Objects turn"
          value={loop.rotation}
          disabled={loop.locked}
          onChange={loop.setRotation}
        />
        <button type="button" onClick={onCamera}>
          Shots, angles & lens
        </button>
        <p className="wb-hint">
          A camera move chosen there applies to the whole loop. Saved views
          keeps the framing captured in each slot.
        </p>
      </Fold>
      <Fold title={`Audio · ${loop.audio.enabled ? "On" : "Off"}`}>
        {loop.filled > 0 ? (
          <StateAudioOptions
            audio={loop.audio}
            states={loop.bank.slots.flatMap((slot, index) =>
              slot
                ? [
                    {
                      id: `loop-${SCENE_LOOP_SLOTS[index]}`,
                      label: slot.label,
                      letter: SCENE_LOOP_SLOTS[index],
                    },
                  ]
                : [],
            )}
            disabled={loop.locked || loop.filled < 2}
            onChange={(patch) => loop.setAudio({ ...loop.audio, ...patch })}
          />
        ) : (
          <p className="wb-hint">
            Save A and B to assign frequency bands to those views.
          </p>
        )}
        <button type="button" onClick={onSound}>
          Music controls
        </button>
        <p className="wb-loop-track" title={s.audioName}>
          {s.audioName || "No soundtrack attached"}
        </p>
      </Fold>
    </div>
  );
}
