/**
 * The Capture panel's Format and Rate & time columns, laid out after
 * Holodeck's World Capture panel and CaptureTimingControls (MIT, see
 * Holodeck-LICENSE.txt). Format is the frame size; Rate & time is the take's
 * length on the 24 fps, 8k + 1 frame grid.
 */
import { useState } from "react";
import type { BuilderSession } from "./useBuilderSession";
import { NumberControl, Parameters } from "./Controls";
import { MoveSeconds, TakeLength } from "./TakeLength";
import { LoopControl } from "./LoopControl";
import { AspectGlyph, SegmentedBank } from "./CapturePrimitives";
import {
  CAPTURE_ASPECTS,
  DURATION_BANK,
  aspectFor,
  bankChoice,
  snapSide,
} from "./capture-panel";
import { framesForSeconds, TAKE_FPS, TAKE_FRAMES } from "./take-duration";
import { parameterSchema } from "./recipe";

/** Aspect tiles, then the preset's size or custom width and height. */
export function CaptureFormat({
  s,
  disabled,
}: {
  s: BuilderSession;
  disabled: boolean;
}) {
  const { width, height } = s.recipe;
  // Custom opens the size fields without changing the frame until one is edited.
  const [customOpen, setCustomOpen] = useState(false);
  const active = customOpen ? "custom" : aspectFor(width, height);
  return (
    <fieldset className="wb-capture-column" disabled={disabled}>
      <legend>Format</legend>
      <div className="wb-aspect-bank">
        {CAPTURE_ASPECTS.map((a) => (
          <button
            key={a.key}
            type="button"
            aria-label={a.key}
            title={`${a.key} · ${a.width} × ${a.height}`}
            aria-pressed={active === a.key}
            onClick={() => {
              setCustomOpen(false);
              s.change({ width: a.width, height: a.height });
            }}
          >
            <AspectGlyph rw={a.rw} rh={a.rh} />
            <span aria-hidden="true">{a.key}</span>
          </button>
        ))}
        <button
          type="button"
          aria-label="Custom size"
          title="Custom width and height, multiples of 64"
          aria-pressed={active === "custom"}
          onClick={() => setCustomOpen(true)}
        >
          <AspectGlyph rw={width} rh={height} />
          <span aria-hidden="true">Cust</span>
        </button>
      </div>
      {active === "custom" ? (
        <div className="wb-numbers">
          {(["width", "height"] as const).map((side) => (
            <NumberControl
              key={side}
              label={side === "width" ? "Width" : "Height"}
              value={s.recipe[side]}
              min={parameterSchema[side].min}
              max={parameterSchema[side].max}
              step={parameterSchema[side].step}
              change={(v) => s.change({ [side]: snapSide(v, side) })}
            />
          ))}
        </div>
      ) : (
        <output className="wb-size-readout">
          {width} × {height}
        </output>
      )}
      <p className="wb-hint">
        Sizes snap to multiples of 64 for model guidance.
      </p>
    </fieldset>
  );
}

/**
 * Frame rate, take length, the duration bank, Move seconds, frames and the
 * seamless loop. The bank works in every mode, as the take length does;
 * the move and loop are the set's, edited from Shot camera.
 */
export function CaptureTiming({
  s,
  idle,
  setEditable,
}: {
  s: BuilderSession;
  idle: boolean;
  setEditable: boolean;
}) {
  const { frames } = s.recipe;
  const choice = bankChoice(frames);
  return (
    <div className="wb-capture-column">
      <span className="wb-capture-label">Rate &amp; time</span>
      <div className="wb-capture-row">
        <span>Frame rate</span>
        <output className="wb-readout-chip" title="Takes are fixed at 24 fps">
          {TAKE_FPS} FPS · fixed
        </output>
      </div>
      <div className="wb-capture-row">
        <span>Take length</span>
        <TakeLength s={s} disabled={!idle} label="Capture" />
      </div>
      <SegmentedBank
        label="Quick take length"
        value={choice === null ? "" : String(choice)}
        disabled={!idle}
        options={DURATION_BANK.map((sec) => ({
          value: String(sec),
          label: `${sec}s`,
          title: `${sec} s → ${framesForSeconds(sec)} frames`,
        }))}
        onChange={(v) => s.change({ seconds: Number(v) })}
      />
      <fieldset disabled={!setEditable}>
        <MoveSeconds s={s} />
        <Parameters recipe={s.recipe} change={s.change} names={["frames"]} />
        <LoopControl s={s} />
      </fieldset>
      <p className="wb-hint">
        A take is an 8k + 1 frame count at 24 fps: 9 to {TAKE_FRAMES.max}{" "}
        frames. A 30-second move includes its endpoint at frame 720.
      </p>
    </div>
  );
}
