import ThemedSelect from "../components/ThemedSelect";
import type { Recipe } from "./recipe";
import { NumberControl } from "./Controls";
import { SCENE_MAPPING_RANGES } from "./scene-state";

export const MOTION_PROPERTIES = {
  morph: "Morph progress",
  twistX: "Twist X",
  twistY: "Twist Y",
  spread: "Spread",
  lift: "Lift",
  scale: "Scale",
  roomWidth: "Room width",
  roomHeight: "Room height",
  roomDepth: "Room depth",
} as const;

/** Deliberately names the existing envelopes; no instrument-separation claim. */
export function SceneMotionMappings({
  recipe,
  change,
}: {
  recipe: Recipe;
  change: (patch: Partial<Recipe>) => unknown;
}) {
  const motion = recipe.motion;
  if (!motion) return null;
  const set = (mappings: typeof motion.mappings) =>
    change({ motion: { ...motion, mappings } });
  return (
    <div className="wb-motion-mappings">
      <NumberControl
        label="Audio response intensity"
        value={motion.intensity}
        min={0}
        max={2}
        step={0.05}
        change={(intensity) => change({ motion: { ...motion, intensity } })}
      />
      <p className="wb-hint">
        Load control music in Sound. Sub (20–80 Hz), low, mid, high and level
        envelopes add bounded offsets after the authored movement.
      </p>
      {motion.morphControl?.enabled && (
        <p className="wb-hint">
          The morph plane controls progress. Saved timeline morph offsets resume
          when the plane is turned off.
        </p>
      )}
      {motion.mappings.map((mapping, index) =>
        motion.morphControl?.enabled && mapping.property === "morph" ? null : (
          <div className="wb-motion-route" key={mapping.id}>
            <label className="wb-check">
              <input
                type="checkbox"
                aria-label={`Enable motion mapping ${index + 1}`}
                checked={mapping.enabled}
                onChange={(ev) =>
                  set(
                    motion.mappings.map((m) =>
                      m.id === mapping.id
                        ? { ...m, enabled: ev.target.checked }
                        : m,
                    ),
                  )
                }
              />
              {index + 1}
            </label>
            <ThemedSelect
              aria-label={`Motion mapping ${index + 1} source`}
              value={mapping.source}
              onChange={(ev) =>
                set(
                  motion.mappings.map((m) =>
                    m.id === mapping.id
                      ? { ...m, source: ev.target.value as typeof m.source }
                      : m,
                  ),
                )
              }
            >
              <option value="sub">Sub · 20–80 Hz</option>
              <option value="low">Low</option>
              <option value="mid">Mid</option>
              <option value="high">High</option>
              <option value="level">Level</option>
            </ThemedSelect>
            <ThemedSelect
              aria-label={`Motion mapping ${index + 1} target`}
              value={mapping.property}
              onChange={(ev) =>
                set(
                  motion.mappings.map((m) =>
                    m.id === mapping.id
                      ? {
                          ...m,
                          property: ev.target.value as typeof m.property,
                          amount: 0.25,
                        }
                      : m,
                  ),
                )
              }
            >
              {Object.entries(MOTION_PROPERTIES)
                .filter(
                  ([key]) =>
                    (!key.startsWith("room") || motion.room) &&
                    !(key === "morph" && motion.morphControl?.enabled) &&
                    (["morph", "roomWidth", "roomHeight", "roomDepth"].includes(
                      key,
                    ) ||
                      motion.instances),
                )
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </ThemedSelect>
            <NumberControl
              label={`Mapping ${index + 1} amount`}
              value={mapping.amount}
              min={SCENE_MAPPING_RANGES[mapping.property][0]}
              max={SCENE_MAPPING_RANGES[mapping.property][1]}
              step={0.05}
              change={(amount) =>
                set(
                  motion.mappings.map((m) =>
                    m.id === mapping.id ? { ...m, amount } : m,
                  ),
                )
              }
            />
            <button
              type="button"
              aria-label={`Remove motion mapping ${index + 1}`}
              onClick={() =>
                set(motion.mappings.filter((m) => m.id !== mapping.id))
              }
            >
              ×
            </button>
          </div>
        ),
      )}
      <button
        type="button"
        disabled={motion.mappings.length >= 12}
        onClick={() =>
          set([
            ...motion.mappings,
            {
              id: `map-${crypto.randomUUID().slice(0, 8)}`,
              enabled: true,
              source: "low",
              property: motion.instances ? "twistY" : "morph",
              amount: 0.25,
            },
          ])
        }
      >
        Add audio mapping
      </button>
    </div>
  );
}
