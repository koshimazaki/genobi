import ThemedSelect from "../components/ThemedSelect";
import type { BuilderSession } from "./useBuilderSession";
import type { ModSource } from "./mod-routes";
import { defaultStateAudio, type SceneStateAudio } from "./scene-state-audio";

const BANDS: { value: ModSource; label: string }[] = [
  { value: "low", label: "Bass" },
  { value: "mid", label: "Mid" },
  { value: "high", label: "High" },
  { value: "sub", label: "Sub" },
  { value: "level", label: "Level" },
];

/** A band pulls toward one saved shape and its linked view as time continues. */
export function SceneStateAudioControls({
  s,
  disabled = false,
}: {
  s: BuilderSession;
  disabled?: boolean;
}) {
  const motion = s.recipe.motion;
  if (!motion) return null;
  const audio = motion.stateAudio ?? defaultStateAudio(motion),
    locked = disabled || !s.ready || s.busy;
  const update = (patch: Partial<SceneStateAudio>) => {
    const next = { ...audio, ...patch };
    s.tune({
      motion: {
        ...motion,
        stateAudio: next,
        ...(next.enabled && motion.morphControl
          ? { morphControl: { ...motion.morphControl, enabled: false } }
          : {}),
      },
    });
  };
  return (
    <StateAudioOptions
      audio={audio}
      states={motion.stateKeys.map((key, index) => ({
        ...key,
        letter: String.fromCharCode(65 + index),
      }))}
      disabled={locked}
      onChange={update}
    />
  );
}

/** Reused by the live motion inspector and the independent loop draft. */
export function StateAudioOptions({
  audio,
  states,
  disabled = false,
  onChange,
}: {
  audio: SceneStateAudio;
  states: { id: string; label: string; letter: string }[];
  disabled?: boolean;
  onChange: (patch: Partial<SceneStateAudio>) => void;
}) {
  const routeBand = (stateId: string, source: string) => {
    const previous = audio.routes.find((route) => route.stateId === stateId),
      route = {
        ...(previous ?? { stateId, source: "low" as const, amount: 1 }),
        enabled: source !== "off",
        ...(source === "off" ? {} : { source: source as ModSource }),
      };
    onChange({
      routes: previous
        ? audio.routes.map((item) => (item.stateId === stateId ? route : item))
        : [...audio.routes, route],
    });
  };
  return (
    <section className="wb-state-audio" aria-label="Saved state audio">
      <div className="wb-state-audio-heading">
        <label className="wb-check">
          <input
            type="checkbox"
            checked={audio.enabled}
            disabled={disabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          Audio pulls toward states
        </label>
        <label className="wb-state-audio-strength">
          <span>Pull strength</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audio.amount}
            disabled={disabled || !audio.enabled}
            onChange={(event) =>
              onChange({ amount: Number(event.target.value) })
            }
          />
          <output>{Math.round(audio.amount * 100)}%</output>
        </label>
      </div>
      <div className="wb-state-audio-routes">
        {states.map((key) => {
          const route = audio.routes.find((item) => item.stateId === key.id),
            letter = key.letter;
          return (
            <label key={key.id}>
              <span title={key.label}>
                <b>{letter}</b> {key.label}
              </span>
              <ThemedSelect
                aria-label={`Audio band for state ${letter}`}
                value={route?.enabled ? route.source : "off"}
                disabled={disabled || !audio.enabled}
                onChange={(event) => routeBand(key.id, event.target.value)}
              >
                <option value="off">Off</option>
                {BANDS.map((band) => (
                  <option key={band.value} value={band.value}>
                    {band.label}
                  </option>
                ))}
              </ThemedSelect>
            </label>
          );
        })}
      </div>
      <p className="wb-hint">
        Time keeps moving through the states. Louder bands pull the shape and
        any linked camera toward their assigned state; quiet audio keeps the
        timed motion. Bands measure frequency energy, not individual drums.
      </p>
    </section>
  );
}
