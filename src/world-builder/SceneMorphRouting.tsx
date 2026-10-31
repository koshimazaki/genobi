import ThemedSelect from "../components/ThemedSelect";
import { NumberControl } from "./Controls";
import { MorphPad } from "./MorphPad";
import { MOD_SOURCES, type ModSource } from "./mod-routes";
import { inputSignalRecipe } from "./input-take-session";
import { morphControlPosition } from "./scene-morph-evaluation";
import { useMorphRouting } from "./useMorphRouting";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import "./scene-morph-routing.css";

const BANDS: Record<ModSource, string> = {
  sub: "Sub · 20–80 Hz",
  low: "Bass · below 200 Hz",
  mid: "Mid",
  high: "High",
  level: "Whole track",
};

function MorphRoutingControls({ s, e }: { s: BuilderSession; e: WorldEditor }) {
  const motion = s.recipe.motion!;
  const { control, update } = useMorphRouting(s, e);
  const disabled = !s.ready || s.busy;
  const controlsDisabled = disabled || !control.enabled;
  const input = s.inputState;
  const liveInput = input?.phase === "recording" && input.signals;
  const frame = liveInput ? input.frame : s.frame;
  const preview = liveInput
    ? inputSignalRecipe(s.recipe, frame, liveInput)
    : s.recipe;
  const labels = new Map(motion.stateKeys.map((key) => [key.id, key.label]));
  const actual = morphControlPosition(
    { ...preview, motion: { ...motion, morphControl: control } },
    frame,
  );
  const baseline =
    control.progress.mode === "timeline"
      ? frame / Math.max(1, s.recipe.frames - 1)
      : control.progress.position;
  const targetPosition =
    control.target.routes.length > 1 ? control.target.position : 0;
  const setProgress = (patch: Partial<typeof control.progress>) =>
    update((value) => ({
      ...value,
      progress: { ...value.progress, ...patch },
    }));
  const setTarget = (patch: Partial<typeof control.target>) =>
    update((value) => ({ ...value, target: { ...value.target, ...patch } }));
  const route = (
    stateId: string,
    patch: Partial<(typeof control.target.routes)[number]>,
  ) =>
    update((value) => ({
      ...value,
      target: {
        ...value.target,
        routes: value.target.routes.map((item) =>
          item.stateId === stateId ? { ...item, ...patch } : item,
        ),
      },
    }));
  const unused = motion.stateKeys.filter(
    (key) =>
      key.id !== control.originStateId &&
      !control.target.routes.some((item) => item.stateId === key.id),
  );
  return (
    <div className="wb-morph-routing">
      <label className="wb-check">
        <input
          type="checkbox"
          aria-label="Use morph plane"
          checked={control.enabled}
          disabled={disabled}
          onChange={(event) =>
            update((value) => ({ ...value, enabled: event.target.checked }))
          }
        />
        Use morph plane
      </label>
      <p className="wb-hint">
        Progress controls how far the shape moves. The target axis chooses where
        it goes. Turn this off to return to the authored state sequence.
      </p>
      <fieldset disabled={controlsDisabled}>
        <label>
          Origin shape
          <ThemedSelect
            aria-label="Morph origin shape"
            disabled={controlsDisabled}
            value={control.originStateId}
            onChange={(event) =>
              update((value) =>
                event.target.value === value.originStateId
                  ? value
                  : {
                      ...value,
                      originStateId: event.target.value,
                      target: {
                        ...value.target,
                        routes: [
                          ...value.target.routes.filter(
                            (item) => item.stateId !== event.target.value,
                          ),
                          {
                            stateId: value.originStateId,
                            source: "level",
                            amount: 1,
                            enabled: false,
                          },
                        ],
                      },
                    },
              )
            }
          >
            {motion.stateKeys.map((key) => (
              <option key={key.id} value={key.id}>
                {key.label}
              </option>
            ))}
          </ThemedSelect>
        </label>
        <MorphPad
          value={{ progress: baseline, target: targetPosition }}
          actual={
            actual && {
              progress: actual.progress,
              target: actual.targetPosition,
            }
          }
          targets={control.target.routes.map(
            (item) => labels.get(item.stateId) ?? item.stateId,
          )}
          disabled={controlsDisabled}
          change={(point) =>
            update((value) => ({
              ...value,
              progress: {
                ...value.progress,
                mode: "manual",
                position: point.progress,
              },
              target: { ...value.target, position: point.target },
            }))
          }
        />
        <div className="wb-morph-pad-legend">
          <span>○ Baseline</span>
          <span>{liveInput ? "● Live input" : "● Audio + baseline"}</span>
          {actual && (
            <output>
              {labels.get(actual.dominantStateId)} ·{" "}
              {Math.round(actual.progress * 100)}%
            </output>
          )}
        </div>
        <div className="wb-motion-pair">
          <label className="wb-morph-axis">
            <span>
              Progress <output>{Math.round(baseline * 100)}%</output>
            </span>
            <input
              aria-label="Manual morph progress"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={baseline}
              onChange={(event) =>
                setProgress({
                  mode: "manual",
                  position: Number(event.target.value),
                })
              }
            />
          </label>
          <label className="wb-morph-axis">
            <span>
              Target blend <output>{Math.round(targetPosition * 100)}%</output>
            </span>
            <input
              aria-label="Manual morph target blend"
              disabled={control.target.routes.length < 2}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={targetPosition}
              onChange={(event) =>
                setTarget({ position: Number(event.target.value) })
              }
            />
          </label>
        </div>
        <div className="wb-morph-section-heading">
          <strong>1 · Progress</strong>
          <span>How far</span>
        </div>
        <label>
          Progress baseline
          <ThemedSelect
            aria-label="Morph progress baseline"
            disabled={controlsDisabled}
            value={control.progress.mode}
            onChange={(event) =>
              setProgress({ mode: event.target.value as "manual" | "timeline" })
            }
          >
            <option value="manual">Manual position</option>
            <option value="timeline">Take timeline</option>
          </ThemedSelect>
        </label>
        <div className="wb-motion-pair">
          <label>
            Progress audio
            <ThemedSelect
              aria-label="Morph progress audio source"
              disabled={controlsDisabled}
              value={control.progress.source}
              onChange={(event) =>
                setProgress({ source: event.target.value as ModSource })
              }
            >
              {MOD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {BANDS[source]}
                </option>
              ))}
            </ThemedSelect>
          </label>
          <NumberControl
            label="Progress response"
            value={control.progress.amount}
            min={0}
            max={2}
            step={0.05}
            change={(amount) => setProgress({ amount })}
          />
        </div>
        <div className="wb-morph-section-heading">
          <strong>2 · Spectral targets</strong>
          <span>Which shape</span>
        </div>
        <div className="wb-motion-pair">
          <NumberControl
            label="Target audio mix"
            value={control.target.amount}
            min={0}
            max={1}
            step={0.05}
            change={(amount) => setTarget({ amount })}
          />
          <label>
            Target choice
            <ThemedSelect
              aria-label="Morph spectral target choice"
              disabled={controlsDisabled}
              value={control.target.mode}
              onChange={(event) =>
                setTarget({ mode: event.target.value as "blend" | "strongest" })
              }
            >
              <option value="blend">Blend bands</option>
              <option value="strongest">Strongest band</option>
            </ThemedSelect>
          </label>
        </div>
        <p className="wb-hint">
          Bands measure frequency energy. Mid and high can respond to snare-like
          sounds, but these controls do not identify instruments. Zero response
          or missing audio keeps the chosen baseline.
        </p>
        <div className="wb-morph-targets">
          {control.target.routes.map((item) => {
            const label = labels.get(item.stateId) ?? item.stateId;
            const weight =
              actual?.weights.find((value) => value.stateId === item.stateId)
                ?.weight ?? 0;
            return (
              <div className="wb-morph-target" key={item.stateId}>
                <label className="wb-check">
                  <input
                    type="checkbox"
                    aria-label={`Audio to ${label}`}
                    checked={item.enabled}
                    onChange={(event) =>
                      route(item.stateId, { enabled: event.target.checked })
                    }
                  />
                  {label}
                </label>
                <output>{Math.round(weight * 100)}%</output>
                <meter
                  aria-label={`${label} target weight`}
                  min={0}
                  max={1}
                  value={weight}
                />
                <ThemedSelect
                  aria-label={`${label} audio band`}
                  disabled={controlsDisabled}
                  value={item.source}
                  onChange={(event) =>
                    route(item.stateId, {
                      source: event.target.value as ModSource,
                    })
                  }
                >
                  {MOD_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {BANDS[source]}
                    </option>
                  ))}
                </ThemedSelect>
                <NumberControl
                  label={`${label} response`}
                  value={item.amount}
                  min={0}
                  max={2}
                  step={0.05}
                  change={(amount) => route(item.stateId, { amount })}
                />
                <button
                  className="wb-morph-remove-target"
                  type="button"
                  disabled={control.target.routes.length === 1}
                  aria-label={`Remove ${label} target`}
                  onClick={() =>
                    update((value) => ({
                      ...value,
                      target: {
                        ...value.target,
                        routes: value.target.routes.filter(
                          (candidate) => candidate.stateId !== item.stateId,
                        ),
                      },
                    }))
                  }
                >
                  Remove target
                </button>
              </div>
            );
          })}
        </div>
        {unused.length > 0 && (
          <label>
            Add a target
            <ThemedSelect
              aria-label="Add morph target"
              disabled={controlsDisabled}
              value=""
              onChange={(event) =>
                update((value) => ({
                  ...value,
                  target: {
                    ...value.target,
                    routes: [
                      ...value.target.routes,
                      {
                        stateId: event.target.value,
                        source: "level",
                        amount: 1,
                        enabled: true,
                      },
                    ],
                  },
                }))
              }
            >
              <option value="" disabled>
                Choose a shape…
              </option>
              {unused.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.label}
                </option>
              ))}
            </ThemedSelect>
          </label>
        )}
        <p className="wb-hint">
          Unchecked shapes remain available on the manual target axis. Scene
          response intensity scales the audio contribution to both axes.
        </p>
      </fieldset>
    </div>
  );
}

export function SceneMorphRouting(props: {
  s: BuilderSession;
  e: WorldEditor;
}) {
  if ((props.s.recipe.motion?.stateKeys.length ?? 0) < 2)
    return (
      <p className="wb-hint">
        Add at least two states to route between shapes.
      </p>
    );
  return <MorphRoutingControls {...props} />;
}
