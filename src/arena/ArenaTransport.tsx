import Icon from "../components/Icon";
import type { useArenaPlayback } from "./useArenaPlayback";
const clock = (t: number) =>
  `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
export default function ArenaTransport({
  playback,
  sourceSeconds,
}: {
  playback: ReturnType<typeof useArenaPlayback>;
  sourceSeconds?: number;
}) {
  return (
    <div className="arena-transport" role="group" aria-label="Shared playback">
      <button
        aria-label={playback.playing ? "Pause all" : "Play all"}
        disabled={!playback.duration}
        onClick={() => void playback.play()}
      >
        <Icon name={playback.playing ? "pause" : "play"} size={16} />
      </button>
      <button
        aria-label="Restart all"
        disabled={!playback.duration}
        onClick={() => playback.seek(0)}
      >
        <Icon name="rewind" size={14} />
      </button>
      <input
        aria-label="Comparison position"
        type="range"
        min={0}
        max={playback.duration || 1}
        step={0.01}
        value={Math.min(playback.time, playback.duration)}
        disabled={!playback.duration}
        onChange={(e) => playback.seek(Number(e.target.value))}
      />
      <output>
        {clock(playback.time)} / {clock(playback.duration)}
      </output>
      {sourceSeconds && (
        <button
          disabled={playback.duration < sourceSeconds}
          onClick={() => playback.seek(sourceSeconds!)}
        >
          Source end
        </button>
      )}
    </div>
  );
}
