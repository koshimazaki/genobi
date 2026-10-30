import ThemedSelect from "../components/ThemedSelect";
import { NumberControl } from "./Controls";
import { BUILDER_CHARACTER_MODELS as CHARACTER_MODELS } from "./character-catalog";
import {
  MAX_MOTION_STEPS,
  MAX_STEP_SECONDS,
  MIN_STEP_SECONDS,
  motionSeconds,
  type AvatarMotion,
  type MotionStep,
} from "./motion";
import type { BuilderSession } from "./useBuilderSession";
import type { CharacterPose } from "../../shared/scene/characters";

/** Quarter seconds, so a split take reads cleanly. */
const round = (v: number) => Math.max(0.25, Math.round(v * 4) / 4);

/**
 * The character's moves for the take: one clip that fills it, or a list of
 * clips with seconds each, played in order on the take's frame grid.
 */
export function MotionList({ s }: { s: BuilderSession }) {
  const motion: AvatarMotion = s.recipe.avatarMotion;
  const clips = Object.keys(
    CHARACTER_MODELS[s.recipe.avatarAsset].clips,
  ) as CharacterPose[];
  const take = s.recipe.frames / 24;
  const set = (avatarMotion: AvatarMotion) => s.change({ avatarMotion });
  const picker = (
    value: CharacterPose,
    pick: (c: CharacterPose) => void,
    label = "Character motion",
  ) => (
    <ThemedSelect
      aria-label={label}
      value={value}
      onChange={(event) => pick(event.target.value as CharacterPose)}
    >
      {clips.map((pose) => (
        <option key={pose}>{pose}</option>
      ))}
    </ThemedSelect>
  );
  if (typeof motion === "string")
    return (
      <div className="wb-motion" role="group" aria-label="Character moves">
        <span>Character motion</span>
        {picker(motion, set)}
        <button
          type="button"
          onClick={() =>
            set([
              { clip: motion, seconds: round(take / 2) },
              { clip: "idle", seconds: round(take / 2) },
            ])
          }
        >
          Add move
        </button>
        <small>One clip fills the take.</small>
      </div>
    );
  const update = (i: number, step: Partial<MotionStep>) =>
    set(motion.map((m, j) => (j === i ? { ...m, ...step } : m)));
  const total = motionSeconds(motion) ?? 0;
  return (
    <div className="wb-motion" role="group" aria-label="Character moves">
      <span>Character moves</span>
      <ol>
        {motion.map((step, i) => (
          <li key={i}>
            {picker(
              step.clip,
              (clip) => update(i, { clip }),
              `Move ${i + 1} clip`,
            )}
            <NumberControl
              label="s"
              value={step.seconds}
              min={MIN_STEP_SECONDS}
              max={MAX_STEP_SECONDS}
              step={0.25}
              change={(seconds) => update(i, { seconds })}
            />
            <button
              type="button"
              aria-label={`Remove move ${i + 1}`}
              onClick={() =>
                set(
                  motion.length === 2
                    ? motion[1 - i].clip
                    : motion.filter((_, j) => j !== i),
                )
              }
            >
              ×
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        disabled={motion.length >= MAX_MOTION_STEPS}
        onClick={() => set([...motion, { clip: "idle", seconds: 1 }])}
      >
        Add move
      </button>
      <small>
        {total.toFixed(2)} s of a {take.toFixed(2)} s take
        {total > take + 1e-6
          ? "; moves past the end are not reached."
          : "; the last move runs to the end."}
      </small>
    </div>
  );
}
