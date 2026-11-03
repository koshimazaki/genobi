import { evaluateAcousticEnvironment } from "./evaluate-acoustic-environment";
import { roomRt60 } from "./scene-room-ir";
import type { BuilderSession } from "./useBuilderSession";

/** Visible evidence for the enclosure driving this frame's estimated response. */
export function RoomAcousticReadout({ s }: { s: BuilderSession }) {
  const environment = evaluateAcousticEnvironment(s.recipe, s.frame);
  const room = environment.room;
  return (
    <div className="wb-room-readout" aria-label="Current acoustic space">
      <strong>{environment.zone.label}</strong>
      {room ? (
        <>
          <span>{room.dimensions.map((n) => n.toFixed(1)).join(" × ")} m</span>
          <span>
            {Math.round(
              room.dimensions.reduce((a, b) => a * b, 1),
            ).toLocaleString()}{" "}
            m³
            {" · "}Estimated RT60 {roomRt60(room).toFixed(2)} s
          </span>
          <small>
            {environment.zone.approximation === "open-shaft-proxy"
              ? `${environment.zone.openingsAreaM2?.toFixed(1)} m² of openings. Leakage is approximated as absorption; this is not a multi-room acoustic measurement.`
              : "Broadband shoebox estimate from authored dimensions and absorption; not a measured room response."}
          </small>
        </>
      ) : (
        <span>Dry outdoors · no enclosed-room reverb</span>
      )}
      {s.recipe.motion?.acousticZones && (
        <small>
          Listener follows{" "}
          {s.recipe.motion.acousticListener === "avatar"
            ? "the mannequin"
            : "the camera"}
          . Scrub or play to move between spaces.
        </small>
      )}
    </div>
  );
}
