import ThemedSelect from "../components/ThemedSelect";
import { NumberControl } from "./Controls";
import {
  defaultCharacterAudio,
  type CharacterAudio,
  type CharacterAudioRoute,
} from "./character-audio";
import { BUILDER_CHARACTER_MODELS } from "./character-catalog";
import { availableCharacterClips } from "./character-audio-options";
import { creatureMotionReceipt } from "../scene3d/creature-fbx";
import { motionLabel } from "../scene3d/creature-slots";
import type { CharacterPose } from "../../shared/scene/characters";
import type { BuilderSession } from "./useBuilderSession";
import type { ModSource } from "./mod-routes";
import { TAKE_FRAMES } from "./take-duration";
import "./character-audio-controls.css";

const BANDS: { value: ModSource; label: string }[] = [
  { value: "low", label: "Bass" },
  { value: "mid", label: "Mid" },
  { value: "high", label: "High" },
  { value: "sub", label: "Sub · 20–80 Hz" },
  { value: "level", label: "Whole track" },
];

/** Prepared band crossings trigger known clips; this does not classify drums. */
export function CharacterAudioControls({ s }: { s: BuilderSession }) {
  const asset = s.recipe.avatarAsset;
  const defaults = defaultCharacterAudio(asset);
  const control = s.recipe.characterAudio ?? defaults;
  const locked = !s.ready || s.busy;
  const available = availableCharacterClips(asset, creatureMotionReceipt());
  const clips = Object.keys(
    BUILDER_CHARACTER_MODELS[asset].clips,
  ) as CharacterPose[];
  const missing = control.routes.filter(
    (route) => route.enabled && !available.includes(route.clip),
  );
  const change = (next: CharacterAudio) => s.tune({ characterAudio: next });
  const route = (id: string, patch: Partial<CharacterAudioRoute>) =>
    change({
      ...control,
      routes: control.routes.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  return (
    <section
      className="wb-character-audio"
      aria-label="Character audio triggers"
    >
      <label className="wb-check">
        <input
          type="checkbox"
          aria-label="Audio triggers character moves"
          checked={control.enabled}
          disabled={locked || (!control.enabled && missing.length > 0)}
          onChange={(event) =>
            change({ ...control, enabled: event.target.checked })
          }
        />
        Audio triggers character moves
      </label>
      <p className="wb-hint">
        Choose a band and move, then enable. A rise through the trigger level
        starts the move; its end returns to your authored character sequence.
      </p>
      {missing.length > 0 && (
        <p className="wb-hint">
          Attach {missing.map((item) => motionLabel(item.clip)).join(", ")} in
          Scene, or choose a bundled move before enabling.
        </p>
      )}
      <fieldset disabled={locked}>
        {control.routes.map((item, index) => (
          <article className="wb-character-audio-route" key={item.id}>
            <header>
              <label className="wb-check">
                <input
                  type="checkbox"
                  aria-label={`Enable character route ${index + 1}`}
                  checked={item.enabled}
                  onChange={(event) =>
                    route(item.id, { enabled: event.target.checked })
                  }
                />
                Route {index + 1}
              </label>
              <button
                type="button"
                aria-label={`Remove character route ${index + 1}`}
                onClick={() =>
                  change({
                    ...control,
                    routes: control.routes.filter(
                      (candidate) => candidate.id !== item.id,
                    ),
                  })
                }
              >
                Remove
              </button>
            </header>
            <div className="wb-character-audio-pair">
              <label>
                Band
                <ThemedSelect
                  aria-label={`Character route ${index + 1} band`}
                  value={item.source}
                  disabled={locked}
                  onChange={(event) =>
                    route(item.id, { source: event.target.value as ModSource })
                  }
                >
                  {BANDS.map((band) => (
                    <option key={band.value} value={band.value}>
                      {band.label}
                    </option>
                  ))}
                </ThemedSelect>
              </label>
              <label>
                Move
                <ThemedSelect
                  aria-label={`Character route ${index + 1} move`}
                  value={item.clip}
                  disabled={locked}
                  onChange={(event) =>
                    route(item.id, {
                      clip: event.target.value as CharacterPose,
                    })
                  }
                >
                  {clips.map((clip) => (
                    <option
                      key={clip}
                      value={clip}
                      disabled={!available.includes(clip)}
                    >
                      {motionLabel(clip)}
                      {available.includes(clip) ? "" : " · attach FBX"}
                    </option>
                  ))}
                </ThemedSelect>
              </label>
            </div>
            <details>
              <summary>Trigger timing</summary>
              <div className="wb-character-audio-pair">
                <NumberControl
                  label={`Route ${index + 1} trigger level`}
                  value={item.threshold}
                  min={0.01}
                  max={1}
                  step={0.01}
                  change={(threshold) => route(item.id, { threshold })}
                />
                <NumberControl
                  label={`Route ${index + 1} speed`}
                  value={item.speed}
                  min={0.25}
                  max={4}
                  step={0.05}
                  change={(speed) => route(item.id, { speed })}
                />
                <NumberControl
                  label={`Route ${index + 1} move frames`}
                  value={item.durationFrames}
                  min={1}
                  max={TAKE_FRAMES.max}
                  step={1}
                  change={(value) =>
                    route(item.id, { durationFrames: Math.round(value) })
                  }
                />
                <NumberControl
                  label={`Route ${index + 1} gap frames`}
                  value={item.cooldownFrames}
                  min={0}
                  max={TAKE_FRAMES.max}
                  step={1}
                  change={(value) =>
                    route(item.id, { cooldownFrames: Math.round(value) })
                  }
                />
              </div>
              <p className="wb-hint">
                24 frames = 1 second. The gap limits repeat triggers from this
                route.
              </p>
            </details>
          </article>
        ))}
        <button
          type="button"
          aria-label="Add character route"
          disabled={locked || control.routes.length >= 4}
          onClick={() => {
            const id = Array.from(
              { length: 5 },
              (_, index) => `character-route-${index + 1}`,
            ).find((id) => !control.routes.some((item) => item.id === id))!;
            change({
              ...control,
              routes: [
                ...control.routes,
                {
                  ...defaults.routes[0],
                  id,
                  source: BANDS[control.routes.length % BANDS.length].value,
                  clip: available.includes(defaults.routes[0].clip)
                    ? defaults.routes[0].clip
                    : available[0],
                },
              ],
            });
          }}
        >
          Add character route · {control.routes.length}/4
        </button>
      </fieldset>
      <p className="wb-hint">
        Play or scrub in Shot using a prepared soundtrack. Bands measure energy,
        not instruments. Record live input first; character triggers appear on
        its prepared replay. The latest trigger wins, with the first route
        winning a tie.
      </p>
      {s.previewOnly && (
        <p className="wb-hint">
          Character meshes need WebGL to appear in the viewport; these routes
          can still be saved.
        </p>
      )}
    </section>
  );
}
