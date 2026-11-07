import { useState } from "react";
import {
  loadSoundChoice,
  setLoadSoundChoice,
  type LoadSoundChoice,
} from "./choice";
import { LOAD_SOUNDS, LOAD_SOUND_NAMES } from "./cues";
import { LoadSoundPlayer } from "./player";
import "./load-sound.css";

const player = new LoadSoundPlayer();

/** Shown only with `?loadsound` in the address: try each cue and pick one. */
export const auditionRequested = () =>
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("loadsound");

/**
 * A small panel for choosing the loading sound by ear. Each row plays the
 * cue's start and done parts; "Use" remembers it in this browser, and "Off"
 * silences loading sounds. Nothing here runs unless the address asks for it.
 */
export default function LoadSoundAudition() {
  const [choice, setChoice] = useState<LoadSoundChoice>(loadSoundChoice);
  if (!auditionRequested()) return null;
  const pick = (next: LoadSoundChoice) => {
    setLoadSoundChoice(next);
    setChoice(next);
  };
  return (
    <section className="load-sound-audition" aria-label="Loading sound">
      <h2>Loading sound</h2>
      {LOAD_SOUND_NAMES.map((name) => {
        const cue = LOAD_SOUNDS[name];
        return (
          <div key={name} className="load-sound-row" title={cue.description}>
            <span>{cue.label}</span>
            <button type="button" onClick={() => player.play(cue.start)}>
              Start
            </button>
            <button type="button" onClick={() => player.play(cue.done)}>
              Done
            </button>
            <button
              type="button"
              aria-pressed={choice === name}
              onClick={() => pick(name)}
            >
              {choice === name ? "In use" : "Use"}
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="load-sound-off"
        aria-pressed={choice === "off"}
        onClick={() => pick("off")}
      >
        {choice === "off" ? "Loading sounds off" : "Turn loading sounds off"}
      </button>
    </section>
  );
}
