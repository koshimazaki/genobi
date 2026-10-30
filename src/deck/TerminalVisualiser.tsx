import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  PROGRAMS,
  defaultMetaballs,
  hitMetaball,
  metaballTargets,
  popMetaball,
  type ProgramName,
  type VisualInput,
} from "../../shared/ascii/programs";
import { useAnimationTime } from "../spinner";
import AsciiScreen from "./AsciiScreen";
const columns = 36,
  rows = 7,
  step = 1000 / 30;
export default function TerminalVisualiser({
  program,
  working,
  onCycle,
  score,
  onScore,
}: {
  program: ProgramName;
  working: boolean;
  onCycle: () => void;
  score: number;
  onScore: Dispatch<SetStateAction<number>>;
}) {
  const [playback, setPlayback] = useState({
    paused: false,
    time: 0,
    offset: 0,
  });
  const [pointer, setPointer] = useState<VisualInput["pointer"]>();
  const [balls, setBalls] = useState(defaultMetaballs);
  const clock = useAnimationTime(!playback.paused),
    speed = working ? 1 : 0.85;
  const time = playback.paused
    ? playback.time
    : Math.max(0, (Math.floor(clock / step) * step - playback.offset) * speed);
  const input = useMemo(() => ({ pointer, balls }), [pointer, balls]);
  const frame = useMemo(
    () =>
      PROGRAMS[program](
        columns,
        rows,
        time +
          (program !== "metaballs" && pointer
            ? pointer.x * 1000 + pointer.y * 500
            : 0),
        input,
      ),
    [program, time, pointer, input],
  );
  function pop(id: number | undefined) {
    if (id === undefined || !balls.some((b) => b.id === id)) return;
    setBalls(popMetaball(balls, id, time));
    onScore((value) => value + 10);
  }
  return (
    <div className="deck-vis">
      <button
        type="button"
        className="deck-art"
        data-time={time}
        aria-label={
          program === "metaballs"
            ? "Pop a metaball"
            : "Change terminal visualiser"
        }
        title={
          program === "metaballs"
            ? "Click blobs to split them · clear the small ones for points"
            : "Move to stir · click for next pattern"
        }
        onPointerMove={
          program === "metaballs"
            ? undefined
            : (event) => {
                const r = event.currentTarget.getBoundingClientRect();
                setPointer({
                  x: (event.clientX - r.x) / r.width,
                  y: (event.clientY - r.y) / r.height,
                });
              }
        }
        onPointerLeave={() => setPointer(undefined)}
        onClick={(event) => {
          if (program !== "metaballs") return onCycle();
          const r = event.currentTarget.getBoundingClientRect();
          pop(
            event.detail === 0
              ? metaballTargets(time, input)[0]?.id
              : hitMetaball(
                  columns,
                  rows,
                  time,
                  (event.clientX - r.x) / r.width,
                  (event.clientY - r.y) / r.height,
                  input,
                ),
          );
        }}
      >
        <AsciiScreen
          program={program}
          columns={columns}
          rows={rows}
          frame={frame}
        />
      </button>
      <div className="deck-vis-actions">
        <button type="button" className="deck-mode" onClick={onCycle}>
          VIS · {program.toUpperCase()}
        </button>
        <button
          type="button"
          className="deck-mode"
          aria-label={playback.paused ? "Play visualiser" : "Pause visualiser"}
          onClick={() =>
            setPlayback(
              playback.paused
                ? {
                    paused: false,
                    time,
                    offset: performance.now() - time / speed,
                  }
                : { ...playback, paused: true, time },
            )
          }
        >
          {playback.paused ? "PLAY" : "PAUSE"}
        </button>
      </div>
      {program === "metaballs" && (
        <>
          <div className="deck-game-status">
            <output aria-live="polite">
              {score} points · {balls.length} blobs
            </output>
            <button
              className="deck-mode"
              onClick={() => {
                onScore(0);
                setBalls(defaultMetaballs());
              }}
            >
              Reset game
            </button>
          </div>
          <button
            className="deck-mode"
            disabled={!balls.length}
            onClick={() => pop(balls[0]?.id)}
          >
            Pop next blob
          </button>
        </>
      )}
    </div>
  );
}
