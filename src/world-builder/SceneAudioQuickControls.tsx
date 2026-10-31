import { useRef } from "react";
import ThemedSelect from "../components/ThemedSelect";
import type { BuilderSession } from "./useBuilderSession";
import { MOD_SOURCES, type ModSource } from "./mod-routes";
import { loadAndPlay } from "./sound-autoplay";
import { togglePlay } from "./example-track";
import { SceneLiveInputControls } from "./SceneLiveInputControls";
import "./scene-audio-quick.css";

const LABELS: Record<ModSource, string> = {
  sub: "Sub · 20–80 Hz",
  low: "Bass · below 200 Hz",
  mid: "Mid",
  high: "High",
  level: "Whole track",
};

/** Short controls beside a scene; the Sound panel keeps the single audio player. */
export function SceneAudioQuickControls({
  s,
  openSound,
}: {
  s: BuilderSession;
  openSound: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null),
    motion = s.recipe.motion,
    routed =
      motion?.morphControl?.enabled === true ||
      motion?.stateAudio?.enabled === true,
    enabled = motion?.mappings.filter((mapping) => mapping.enabled) ?? [],
    sources = [...new Set(enabled.map((mapping) => mapping.source))];
  const chooseBand = (source: ModSource) => {
    if (!motion) return;
    s.tune({
      motion: {
        ...motion,
        mappings: motion.mappings.map((mapping) =>
          mapping.enabled ? { ...mapping, source } : mapping,
        ),
      },
    });
  };
  return (
    <section className="wb-scene-audio" aria-label="Quick music response">
      <div className="wb-scene-audio-heading">
        <strong>Music response</strong>
        <span title={s.audioName || s.example.credit}>
          {s.audioName || "Add a soundtrack"}
        </span>
      </div>
      <div className="wb-scene-audio-buttons">
        <button
          type="button"
          disabled={s.busy || !s.ready}
          onClick={() => picker.current?.click()}
        >
          Load music
        </button>
        {s.example.blob && (
          <button
            type="button"
            disabled={s.busy || !s.ready}
            onClick={() => {
              openSound();
              loadAndPlay(s, s.example.blob!, "example", s.example.label);
            }}
          >
            Use example
          </button>
        )}
        <button
          type="button"
          disabled={s.busy || !s.ready || (!s.audioURL && !s.example.blob)}
          aria-pressed={s.playing}
          onClick={() => {
            openSound();
            togglePlay(s);
          }}
        >
          {s.playing ? "Stop" : "Play"}
        </button>
        <button type="button" onClick={openSound}>
          Sound controls
        </button>
        <input
          ref={picker}
          type="file"
          accept="audio/*"
          aria-label="Load scene music"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            openSound();
            loadAndPlay(s, file, "file");
          }}
        />
      </div>
      {motion && (
        <>
          <label className="wb-scene-audio-slider">
            <span>
              Scene response <output>{motion.intensity.toFixed(2)}</output>
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={motion.intensity}
              disabled={!s.ready || s.busy || (!enabled.length && !routed)}
              onChange={(event) =>
                s.tune({
                  motion: { ...motion, intensity: Number(event.target.value) },
                })
              }
            />
          </label>
          <label className="wb-scene-audio-band">
            <span>Scene response band</span>
            <ThemedSelect
              value={sources.length === 1 ? sources[0] : "preset"}
              disabled={!s.ready || s.busy || !enabled.length}
              onChange={(event) => chooseBand(event.target.value as ModSource)}
            >
              <option value="preset" disabled>
                Preset bands
              </option>
              {MOD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {LABELS[source]}
                </option>
              ))}
            </ThemedSelect>
          </label>
          <p className="wb-hint">
            Zero keeps the authored movement. Choosing a band changes every
            enabled scene response; camera response has its own controls.
          </p>
        </>
      )}
      {s.audioName && !s.recipe.bandEnvelopes.sub?.length && (
        <p className="wb-hint">Reload this track to measure its sub band.</p>
      )}
      <SceneLiveInputControls s={s} openSound={openSound} />
    </section>
  );
}
