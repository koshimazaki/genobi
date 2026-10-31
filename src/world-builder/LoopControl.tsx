import type { BuilderSession } from "./useBuilderSession";
import { loopNotes } from "./loop";

/**
 * The seamless-loop switch beside the move's length, with the one-click
 * 360° spin and a note of what the loop changes in this recipe.
 */
export function LoopControl({
  s,
  disabled,
}: {
  s: BuilderSession;
  disabled?: boolean;
}) {
  const r = s.recipe;
  return (
    <div className="wb-loop-control">
      <label className="wb-check">
        <input
          type="checkbox"
          checked={r.loop === true}
          disabled={disabled}
          onChange={(ev) => s.change({ loop: ev.target.checked })}
        />{" "}
        {r.motion ? "Repeat motion sequence" : "Seamless loop"}
      </label>
      <button
        type="button"
        disabled={disabled}
        title={
          r.motion
            ? "Orbit one turn over 2 s; scene states still restart at the seam"
            : "Orbit one full turn over 2 s (49 frames, 2.04 s) as a seamless loop"
        }
        onClick={() =>
          s.change({
            orbit: 360,
            seconds: 2,
            loop: true,
            cameraCurve: "linear",
            cameraShot: "custom",
          })
        }
      >
        360° loop · 2 s
      </button>
      {r.loop && (
        <ul className="wb-hint">
          {loopNotes(r).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
