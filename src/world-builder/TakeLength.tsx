import { useEffect, useRef, useState } from "react";
import type { BuilderSession } from "./useBuilderSession";
import { NumberControl } from "./Controls";
import {
  MOVE_SECONDS,
  TAKE_FRAMES,
  framesForTypedSeconds,
  takeSeconds,
} from "./take-duration";
import "./take-length.css";

/**
 * Apply typed seconds: the draft to show afterwards, or `undefined` when the
 * recipe took the new frames (the field then follows the recipe). Refused
 * text, an unchanged count and a change the recipe rejects all return the
 * recipe's current seconds, so the field never shows a length it did not take.
 */
export async function commitTypedLength(
  draft: string,
  frames: number,
  s: Pick<BuilderSession, "run" | "change">,
) {
  const shown = takeSeconds(frames).toFixed(2);
  if (draft === shown) return shown;
  const typed = framesForTypedSeconds(draft);
  if (typed instanceof Error) {
    await s.run(() => Promise.reject(typed));
    return shown;
  }
  if (typed === frames) return shown;
  return (await s.change({ frames: typed })) ? undefined : shown;
}

/**
 * The capture length, in seconds and frames, with one step either way: the
 * one control the Camera panel, the Capture panel and the footer beside
 * Capture take all show, so the length a capture will record is never out
 * of sight. The seconds are typeable: Enter or leaving the field sets the
 * nearest 8k + 1 frame count, clamped to the recipe's range, and the frames
 * beside it follow what is typed.
 */
export function TakeLength({
  s,
  disabled,
  label = "Take",
}: {
  s: BuilderSession;
  disabled?: boolean;
  label?: string;
}) {
  const { frames } = s.recipe;
  const shown = takeSeconds(frames).toFixed(2);
  const [draft, setDraft] = useState(shown);
  const [committing, setCommitting] = useState(false);
  const pending = useRef(false);
  useEffect(() => setDraft(shown), [shown]);
  const typed = framesForTypedSeconds(draft);
  const draftFrames = typed instanceof Error ? frames : typed;
  const locked = disabled || committing;
  const commit = (text = draft) => {
    if (pending.current || text === shown) return;
    pending.current = true;
    setCommitting(true);
    void commitTypedLength(text, frames, s)
      .then((next) => {
        if (next !== undefined) setDraft(next);
      })
      .finally(() => {
        pending.current = false;
        setCommitting(false);
      });
  };
  return (
    <div className="wb-take-length" role="group" aria-label={`${label} length`}>
      <button
        type="button"
        aria-label="Shorter take"
        disabled={locked || frames <= TAKE_FRAMES.min}
        onClick={() =>
          s.change({
            frames: Math.max(TAKE_FRAMES.min, frames - TAKE_FRAMES.step),
          })
        }
      >
        −
      </button>
      <span className="wb-take-length-value">
        <label>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${label} length in seconds, ${MOVE_SECONDS.min} to ${MOVE_SECONDS.max.toFixed(2)}`}
            value={draft}
            disabled={locked}
            size={5}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") setDraft(shown);
            }}
          />
          <span aria-hidden="true"> s</span>
        </label>
        <output aria-live="polite">{draftFrames} f</output>
      </span>
      <button
        type="button"
        aria-label="Longer take"
        disabled={locked || frames >= TAKE_FRAMES.max}
        onClick={() =>
          s.change({
            frames: Math.min(TAKE_FRAMES.max, frames + TAKE_FRAMES.step),
          })
        }
      >
        +
      </button>
      <input
        className="wb-take-length-slider"
        type="range"
        aria-label={`${label} length slider`}
        aria-valuetext={`${takeSeconds(draftFrames).toFixed(4)} seconds, ${draftFrames} frames`}
        min={TAKE_FRAMES.min}
        max={TAKE_FRAMES.max}
        step={TAKE_FRAMES.step}
        value={draftFrames}
        disabled={locked}
        onChange={(event) =>
          setDraft(takeSeconds(Number(event.target.value)).toFixed(4))
        }
        onPointerUp={(event) =>
          commit(takeSeconds(Number(event.currentTarget.value)).toFixed(4))
        }
        onKeyUp={(event) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          )
            commit(takeSeconds(Number(event.currentTarget.value)).toFixed(4));
        }}
        onBlur={(event) =>
          commit(takeSeconds(Number(event.currentTarget.value)).toFixed(4))
        }
        onPointerCancel={() => setDraft(shown)}
      />
    </div>
  );
}

/**
 * The camera move's duration in seconds. Setting it sets the take's frames
 * to the nearest 8k + 1 count; the take length beside it shows both.
 */
export function MoveSeconds({ s }: { s: BuilderSession }) {
  const { seconds, frames } = s.recipe;
  // Floor to the millisecond so a typed bound is never above the true limit.
  const ms = (v: number) => Math.floor(v * 1000) / 1000;
  return (
    <NumberControl
      label="Move seconds"
      value={seconds ?? ms(takeSeconds(frames))}
      min={MOVE_SECONDS.min}
      max={ms(MOVE_SECONDS.max)}
      step={0.125}
      change={(value) => s.change({ seconds: value })}
    />
  );
}
