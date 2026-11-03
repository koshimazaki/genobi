import ThemedSelect from "../components/ThemedSelect";
import { Fold } from "./FloatingPanel";
import { NumberControl } from "./Controls";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import type { Recipe } from "./recipe";
import { sceneTransformOf } from "./scene-state";
import { evaluateScene } from "./evaluate-scene";
import { clampRoomPoint } from "./scene-room";
import { nearestSceneKey } from "./scene-editing";
import { SceneMotionMappings } from "./SceneMotionMappings";
import { createMotionPreset, MOTION_PRESETS } from "./motion-presets";
import { SceneMorphRouting } from "./SceneMorphRouting";
import { pruneMorphControl } from "./scene-morph-control";
import "./scene-motion.css";

type Motion = NonNullable<Recipe["motion"]>;
type State = Motion["stateKeys"][number];

function initialMotion(recipe: Recipe): Motion {
  const objects = Object.fromEntries(
    recipe.objects.map((p) => [p.id, sceneTransformOf(p)]),
  );
  return {
    version: 1,
    pivot: [0, 0, 0],
    intensity: 1,
    mappings: [],
    stateKeys: [0, Math.floor((recipe.frames - 1) / 2), recipe.frames - 1].map(
      (frame, index) => ({
        id: `state-${index + 1}`,
        label: ["Start", "Transform", "Finish"][index],
        frame,
        easing: "easeInOut",
        objects: structuredClone(objects),
      }),
    ),
  };
}

export function SceneMotionControls({
  s,
  e,
}: {
  s: BuilderSession;
  e: WorldEditor;
}) {
  const motion = s.recipe.motion;
  const index = nearestSceneKey(s.recipe, s.frame);
  const key = motion?.stateKeys[index];
  const update = (patch: Partial<State>) => {
    if (!motion) return;
    void s
      .change({
        motion: {
          ...motion,
          stateKeys: motion.stateKeys.map((k, i) =>
            i === index ? { ...k, ...patch } : k,
          ),
        },
      })
      .then((ok) => {
        if (ok && patch.frame !== undefined)
          s.run(() => s.api.current!.render(patch.frame!));
      });
  };
  const controls = {
    twistX: 0,
    twistY: 0,
    spread: 0,
    lift: 0,
    scale: 1,
    ...key?.controls,
  };
  return (
    <section className="wb-motion-controls" aria-label="Scene motion controls">
      <h3>Scene motion</h3>
      <label>
        Animation preset
        <ThemedSelect
          aria-label="Animation preset"
          value=""
          onChange={(ev) => e.preset(createMotionPreset(ev.target.value))}
        >
          <option value="" disabled>
            Choose a motion preset…
          </option>
          {MOTION_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </ThemedSelect>
      </label>
      {!motion || !key ? (
        <>
          <p className="wb-hint">
            Morph stable primitives between editable states. Preview and capture
            follow the same frame clock.
          </p>
          <button
            type="button"
            disabled={s.recipe.scene === "neuro"}
            onClick={() =>
              s.change({ motion: initialMotion(s.recipe), loop: false })
            }
          >
            Create three states from this scene
          </button>
        </>
      ) : (
        <>
          <label>
            State to edit
            <ThemedSelect
              aria-label="State to edit"
              value={String(index)}
              onChange={(ev) => e.editState(Number(ev.target.value))}
            >
              {motion.stateKeys.map((key, i) => (
                <option key={key.id} value={i}>
                  {i + 1} · {key.label}
                </option>
              ))}
            </ThemedSelect>
          </label>
          <label>
            State name
            <input
              aria-label="State name"
              value={key.label}
              maxLength={48}
              onChange={(ev) =>
                update({ label: ev.target.value || `State ${index + 1}` })
              }
            />
          </label>
          <div className="wb-motion-pair">
            <NumberControl
              label="State frame"
              value={key.frame}
              min={index === 0 ? 0 : motion.stateKeys[index - 1].frame + 1}
              max={
                index === 0
                  ? 0
                  : index === motion.stateKeys.length - 1
                    ? s.recipe.frames - 1
                    : motion.stateKeys[index + 1].frame - 1
              }
              change={(frame) => {
                if (Number.isInteger(frame)) update({ frame });
              }}
            />
            <label>
              Transition easing
              <ThemedSelect
                aria-label="Transition easing"
                value={key.easing}
                onChange={(ev) =>
                  update({ easing: ev.target.value as State["easing"] })
                }
              >
                <option value="easeInOut">Ease in / out</option>
                <option value="linear">Linear</option>
              </ThemedSelect>
            </label>
          </div>
          <div className="wb-motion-actions">
            <button type="button" onClick={() => e.editState(index)}>
              Edit this state in viewport
            </button>
            <button
              type="button"
              onClick={() => {
                e.chooseMode("shot");
                s.run(async () => {
                  await s.settled();
                  s.setPlaying(true);
                });
              }}
            >
              Preview motion
            </button>
          </div>
          <Fold title="Morph routing" open={!!motion.morphControl?.enabled}>
            <label>
              Movement style
              <ThemedSelect
                aria-label="Scene transition style"
                value={motion.transitionStyle ?? "direct"}
                onChange={(event) => {
                  if (e.mode !== "shot") e.chooseMode("shot", false);
                  s.tune({
                    motion: {
                      ...motion,
                      transitionStyle: event.target.value as NonNullable<
                        Motion["transitionStyle"]
                      >,
                    },
                  });
                }}
              >
                <option value="direct">Direct</option>
                <option value="scatter">Scatter</option>
                <option value="twist">Twist</option>
                <option value="assemble">Assemble</option>
              </ThemedSelect>
            </label>
            <SceneMorphRouting s={s} e={e} />
          </Fold>
          {motion.instances && (
            <Fold title="Voxel movement" open>
              <p className="wb-hint">
                {motion.instances.count} retained cubes. Twists turn lattice
                layers around X and Y; spread opens the shape.
              </p>
              <div className="wb-motion-pair">
                {(["twistX", "twistY"] as const).map((name) => (
                  <NumberControl
                    key={name}
                    label={`Twist ${name.at(-1)} °`}
                    value={Math.round((controls[name] * 180) / Math.PI)}
                    min={-180}
                    max={180}
                    change={(value) =>
                      update({
                        controls: {
                          ...controls,
                          [name]: (value * Math.PI) / 180,
                        },
                      })
                    }
                  />
                ))}
                <NumberControl
                  label="Spread"
                  value={controls.spread}
                  min={0}
                  max={3}
                  step={0.05}
                  change={(spread) =>
                    update({ controls: { ...controls, spread } })
                  }
                />
                <NumberControl
                  label="Lift"
                  value={controls.lift}
                  min={-4}
                  max={4}
                  step={0.1}
                  change={(lift) => update({ controls: { ...controls, lift } })}
                />
                <NumberControl
                  label="Group scale"
                  value={controls.scale}
                  min={0.25}
                  max={3}
                  step={0.05}
                  change={(scale) =>
                    update({ controls: { ...controls, scale } })
                  }
                />
              </div>
            </Fold>
          )}
          {motion.room && (
            <Fold title="Room dimensions" open>
              <p className="wb-hint">
                One acoustic enclosure.{" "}
                {motion.room.visible
                  ? "Cutaway surfaces follow these dimensions."
                  : "A sound proxy separate from the visible objects."}
              </p>
              <div className="wb-motion-pair">
                {(["Width", "Height", "Depth"] as const).map((label, axis) => (
                  <NumberControl
                    key={label}
                    label={`Room ${label.toLowerCase()}`}
                    value={
                      (key.room?.dimensions ?? motion.room!.dimensions)[axis]
                    }
                    min={1}
                    max={30}
                    step={0.25}
                    change={(value) => {
                      const dimensions = [
                        ...(key.room?.dimensions ?? motion.room!.dimensions),
                      ] as [number, number, number];
                      dimensions[axis] = value;
                      update({
                        room: {
                          ...key.room,
                          dimensions,
                          source: clampRoomPoint(
                            key.room?.source ?? motion.room!.source,
                            dimensions,
                          ),
                          listener: clampRoomPoint(
                            key.room?.listener ?? motion.room!.listener,
                            dimensions,
                          ),
                        },
                      });
                    }}
                  />
                ))}
              </div>
            </Fold>
          )}
          <Fold title="Audio → scene" open>
            <SceneMotionMappings recipe={s.recipe} change={s.change} />
          </Fold>
          <Fold title="State sequence">
            <p className="wb-hint">
              Add the current playhead position as a state. State times follow
              changes to the take length.
            </p>
            <button
              type="button"
              disabled={
                motion.stateKeys.length >= 12 ||
                motion.stateKeys.some((k) => k.frame === s.frame)
              }
              onClick={() => {
                const snapshot = evaluateScene(s.recipe, s.frame, {
                  editing: true,
                });
                const ids = new Set(Object.keys(motion.stateKeys[0].objects));
                const added: State = {
                  id: `state-${crypto.randomUUID().slice(0, 8)}`,
                  label: `State ${motion.stateKeys.length + 1}`,
                  frame: s.frame,
                  easing: "easeInOut",
                  controls: { ...snapshot.controls },
                  objects: Object.fromEntries(
                    snapshot.objects
                      .filter((p) => ids.has(p.id))
                      .map((p) => [p.id, sceneTransformOf(p)]),
                  ),
                  ...(snapshot.room
                    ? {
                        room: {
                          dimensions: snapshot.room.dimensions,
                          source: snapshot.room.source,
                          listener: snapshot.room.listener,
                        },
                      }
                    : {}),
                };
                s.change({
                  motion: {
                    ...motion,
                    stateKeys: [...motion.stateKeys, added].sort(
                      (a, b) => a.frame - b.frame,
                    ),
                  },
                });
              }}
            >
              Add state at playhead
            </button>
            <button
              type="button"
              disabled={motion.stateKeys.length <= 1 || index === 0}
              onClick={() => {
                const stateKeys = motion.stateKeys.filter(
                  (_, i) => i !== index,
                );
                const next = { ...motion, stateKeys };
                if (next.stateAudio)
                  next.stateAudio = {
                    ...next.stateAudio,
                    routes: next.stateAudio.routes.filter((route) =>
                      stateKeys.some((state) => state.id === route.stateId),
                    ),
                  };
                const control = pruneMorphControl(motion, stateKeys);
                if (control) next.morphControl = control;
                else delete next.morphControl;
                s.change({ motion: next });
              }}
            >
              Remove selected state
            </button>
          </Fold>
        </>
      )}
    </section>
  );
}
