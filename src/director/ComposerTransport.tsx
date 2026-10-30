import type { ReactNode } from "react";
import type { Project } from "../../shared/director/types";
import TickFader from "../components/TickFader";
import Icon from "../components/Icon";
import PlaybackControls from "../components/PlaybackControls";
import { COMPOSITION_FPS } from "../../shared/director/retime";
import { timecode, type TimeUnits } from "./timecode";
import { SNAP_MODES, ZOOM_PIXELS } from "./snap";
import TransportRadios from "./TransportRadios";
import TimingDisclosure from "./TimingDisclosure";
import LengthControl from "./LengthControl";

interface Props {
  resolutionControl: ReactNode;
  units: TimeUnits;
  looping: boolean;
  setLooping: (loop: boolean) => void;
  imageFrames: number;
  setImageFrames: (frames: number) => void;
  addTrack: () => void;
  split: () => void;
  canSplit: boolean;
  composition: Project["composition"];
  /** The last frame a clip covers: Length cannot end before it. */
  clipsEnd: number;
  frame: number;
  ready: boolean;
  playing: boolean;
  rendering: boolean;
  busy: boolean;
  snap: string;
  setSnap: (s: string) => void;
  /** Pixels per frame now drawn, fractional under Fit all. */
  pixels: number;
  fit: boolean;
  setFit: () => void;
  setZoomPixels: (pixels: number) => void;
  setFps: (fps: number) => void;
  togglePlay: () => Promise<void>;
  stop: () => void;
  cancelRender: () => void;
  update: (patch: Partial<Project["composition"]>) => void;
}
const SNAP_TITLES: Record<string, string> = {
  free: "Whole frames, without pulling to nearby clip edges",
  frame: "Whole frames; edges pull to nearby clip edges",
  beat: "The beat grid: BPM and downbeat under Timing",
  marker: "Frame notes and the composition's start and end",
};
export default function ComposerTransport(p: Props) {
  const { composition: c } = p;
  const rates = COMPOSITION_FPS.some((f) => f === c.fps)
    ? [...COMPOSITION_FPS]
    : [...COMPOSITION_FPS, c.fps].sort((a, b) => a - b);
  const manual = Math.round(
    Math.min(ZOOM_PIXELS.max, Math.max(ZOOM_PIXELS.min, p.pixels)),
  );
  return (
    <div className="dir-transport dir-transport-v2">
      <div className="dir-transport-row">
        <div className="dir-playback">
          <PlaybackControls
            playing={p.playing}
            canPlay={p.ready && !p.rendering}
            toggle={() => void p.togglePlay()}
            stop={p.stop}
            canStop={p.ready && !p.rendering}
            loop={p.looping}
            setLoop={p.setLooping}
            canLoop={!p.rendering}
            readout={timecode(p.frame, c.fps, p.units, 2)}
            total={`${(c.durationFrames / c.fps).toFixed(1)}s`}
          />
          <button
            className="playback-button"
            disabled={!p.canSplit}
            onClick={p.split}
            title="Split selected clip at playhead (C or S)"
            aria-label="Split selected clip"
            aria-keyshortcuts="C S"
          >
            <Icon name="cut" size={17} />
          </button>
        </div>
        <TransportRadios
          name="director-snap"
          label="Snap"
          value={p.snap}
          change={p.setSnap}
          options={SNAP_MODES.map((m) => ({
            value: m,
            label: m[0].toUpperCase() + m.slice(1),
            title: SNAP_TITLES[m],
          }))}
        />
        <div className="dir-zoom">
          <TickFader
            id="director-zoom"
            label="Zoom"
            min={ZOOM_PIXELS.min}
            max={ZOOM_PIXELS.max}
            step={1}
            value={manual}
            onChange={p.setZoomPixels}
            valueLabel={`${p.fit ? p.pixels.toFixed(2) : manual} px / frame`}
          />
          <button
            className="dir-fit"
            aria-pressed={p.fit}
            onClick={p.setFit}
            title="Fit the whole composition to the timeline's width"
          >
            Fit all
          </button>
        </div>
      </div>
      <div className="dir-transport-row dir-transport-secondary">
        <TransportRadios
          name="director-fps"
          label="FPS"
          value={String(c.fps)}
          disabled={p.busy}
          title="Composition rate. Changing it keeps every clip at its moment in seconds, rounded to whole frames; a very short clip may move a frame later so neighbours never overlap. The change is refused, naming the clip, if a track no longer fits. One Undo step."
          change={(v) => p.setFps(Number(v))}
          options={rates.map((f) => ({ value: String(f), label: String(f) }))}
        />
        {p.resolutionControl}
        <LengthControl
          composition={c}
          clipsEnd={p.clipsEnd}
          busy={p.busy}
          update={p.update}
        />
        <TimingDisclosure
          composition={c}
          frame={p.frame}
          busy={p.busy}
          update={p.update}
          imageFrames={p.imageFrames}
          setImageFrames={p.setImageFrames}
        />
        <button
          className="dir-add-track"
          disabled={p.busy}
          onClick={p.addTrack}
          aria-haspopup="dialog"
          title="Add another layer: media, graphics or a filter. Repeat to add more of the same kind."
        >
          <Icon name="plus" size={14} />
          Add layer
        </button>
        {p.rendering && (
          <button onClick={() => p.cancelRender()}>Cancel render</button>
        )}
      </div>
    </div>
  );
}
