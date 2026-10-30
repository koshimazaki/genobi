import Icon from "./Icon";
import "./playback-controls.css";

/**
 * Play / Rewind / Loop and the timecode readout, shared by the Director and
 * Dual Swords timelines. A fragment, so each transport keeps its own row.
 */
export default function PlaybackControls({
  playing,
  canPlay,
  toggle,
  rewind,
  canRewind = true,
  stop,
  canStop = true,
  loop,
  setLoop,
  canLoop = true,
  readout,
  total,
}: {
  playing: boolean;
  canPlay: boolean;
  toggle: () => void;
  rewind?: () => void;
  canRewind?: boolean;
  /** Stop: pause and return to the first frame (the Editor's transport). */
  stop?: () => void;
  canStop?: boolean;
  loop?: boolean;
  setLoop?: (loop: boolean) => void;
  canLoop?: boolean;
  readout: string;
  total: string;
}) {
  return (
    <>
      <button
        className="playback-button"
        disabled={!canPlay}
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        aria-keyshortcuts="Space"
        title="Play / pause (Space)"
      >
        <Icon name={playing ? "pause" : "play"} size={17} />
      </button>
      {rewind && (
        <button
          className="playback-button"
          disabled={!canRewind}
          onClick={rewind}
          aria-label="Rewind"
          title="Back to the start"
        >
          <Icon name="rewind" size={17} />
        </button>
      )}
      {stop && (
        <button
          className="playback-button"
          disabled={!canStop}
          onClick={stop}
          aria-label="Stop"
          title="Stop and return to the start"
        >
          <span className="playback-stop" aria-hidden="true" />
        </button>
      )}
      {setLoop && (
        <button
          className="playback-button"
          aria-label="Loop playback"
          aria-pressed={Boolean(loop)}
          disabled={!canLoop}
          onClick={() => setLoop(!loop)}
          title="Loop playback"
        >
          <Icon name="loop" size={15} />
        </button>
      )}
      <output className="playback-readout">{readout}</output>
      <small className="playback-total">/ {total}</small>
    </>
  );
}
