import { NumberControl } from "./Controls";
import { ORIENTATIONS, orient, type AvatarPose } from "./avatar-pose";
import type { BuilderSession } from "./useBuilderSession";

const degrees = (radians: number) => Math.round((radians * 180) / Math.PI);
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const ANGLES = [
  ["yaw", "Turn (yaw)"],
  ["pitch", "Tip (pitch)"],
  ["roll", "Lean (roll)"],
] as const;

/** Position plus yaw / pitch / roll for the character, with quick lying poses. */
export function AvatarPlacement({ s }: { s: BuilderSession }) {
  const pose = s.recipe.avatarPose;
  const set = (next: AvatarPose) => s.change({ avatarPose: next });
  return (
    <>
      <p className="wb-hint">
        Choose a character in the menu. Saved placement is shared by Build, Shot
        and capture. Tipping and leaning pivot on the feet, so a lying body
        rests along the floor.
      </p>
      <div className="wb-transform-grid">
        <span>Position m</span>
        {(["x", "y", "z"] as const).map((axis) => (
          <NumberControl
            key={axis}
            label={`Character ${axis}`}
            value={pose[axis]}
            min={-40}
            max={40}
            step={0.1}
            change={(v) => set({ ...pose, [axis]: v })}
          />
        ))}
      </div>
      <div className="wb-transform-grid">
        <span>Rotation °</span>
        {ANGLES.map(([axis, label]) => (
          <NumberControl
            key={axis}
            label={label}
            value={degrees(pose[axis] ?? 0)}
            min={-180}
            max={180}
            step={1}
            change={(v) =>
              set(
                axis === "yaw"
                  ? { ...pose, yaw: radians(v) }
                  : orient(
                      pose,
                      axis === "pitch" ? radians(v) : (pose.pitch ?? 0),
                      axis === "roll" ? radians(v) : (pose.roll ?? 0),
                    ),
              )
            }
          />
        ))}
      </div>
      <div className="wb-shot-grid" role="group" aria-label="Orientation">
        {ORIENTATIONS.map((o) => (
          <button
            key={o.label}
            type="button"
            aria-pressed={
              (pose.pitch ?? 0) === o.pitch && (pose.roll ?? 0) === o.roll
            }
            onClick={() => set(orient(pose, o.pitch, o.roll))}
          >
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}
