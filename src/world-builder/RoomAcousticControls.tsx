import { Fold } from "./FloatingPanel";
import { NumberControl } from "./Controls";
import type { BuilderSession } from "./useBuilderSession";
import { nearestSceneKey } from "./scene-editing";
import { ROOM_MARGIN } from "./scene-room";
import { ROOM_FACES, type SceneVector } from "./scene-state";

/** Positions belong to a selected authored state; materials belong to the room. */
export function RoomAcousticControls({ s }: { s: BuilderSession }) {
  const motion = s.recipe.motion,
    room = motion?.room;
  if (!motion || !room) return null;
  const index = nearestSceneKey(s.recipe, s.frame),
    key = motion.stateKeys[index];
  const dimensions = key.room?.dimensions ?? room.dimensions;
  const bounds = dimensions.map((size, axis) =>
    axis === 1
      ? [ROOM_MARGIN, size - ROOM_MARGIN]
      : [-size / 2 + ROOM_MARGIN, size / 2 - ROOM_MARGIN],
  );
  return (
    <Fold title="Room materials and positions">
      <p className="wb-hint">
        Positions in {key.label}, in metres from the room centre; Y starts at
        the floor. Surface absorption applies across the whole sequence.
      </p>
      {(["source", "listener"] as const).map((kind) => (
        <div key={kind}>
          <h4>{kind === "source" ? "Dry sound source" : "Listener"}</h4>
          <div className="wb-room-sound-grid wb-room-sound-grid--three">
            {(["X", "Y", "Z"] as const).map((axis, i) => (
              <NumberControl
                key={axis}
                label={`${kind} ${axis}`}
                value={(key.room?.[kind] ?? room[kind])[i]}
                min={bounds[i][0]}
                max={bounds[i][1]}
                step={0.05}
                change={(value) => {
                  const point: SceneVector = [
                    ...(key.room?.[kind] ?? room[kind]),
                  ];
                  point[i] = value;
                  void s.change({
                    motion: {
                      ...motion,
                      stateKeys: motion.stateKeys.map((entry, n) =>
                        n === index
                          ? {
                              ...entry,
                              room: {
                                ...entry.room,
                                dimensions,
                                [kind]: point,
                              },
                            }
                          : entry,
                      ),
                    },
                  });
                }}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="wb-room-sound-grid">
        {ROOM_FACES.map((face) => (
          <NumberControl
            key={face}
            label={`${face} absorption`}
            value={room.absorption[face]}
            min={0.01}
            max={0.99}
            step={0.01}
            change={(value) =>
              void s.change({
                motion: {
                  ...motion,
                  room: {
                    ...room,
                    absorption: { ...room.absorption, [face]: value },
                  },
                },
              })
            }
          />
        ))}
      </div>
      <p className="wb-hint">
        0.01 is reflective; 0.99 absorbs most sound. This is a broadband
        approximation.
      </p>
      <NumberControl
        label="Room response seed"
        value={room.seed}
        min={0}
        max={0xffffffff}
        change={(seed) => {
          if (Number.isInteger(seed))
            void s.change({ motion: { ...motion, room: { ...room, seed } } });
        }}
      />
    </Fold>
  );
}
