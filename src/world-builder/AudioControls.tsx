/**
 * The Sound panel, laid out as Holodeck's Audio Intel panel: a transport row
 * (Play with a live meter beside it, Load audio, Recent, the track name), then
 * Signal scopes, Mod matrix, Audio assets and Clear audio. Folded in the dock,
 * only the transport and its meter stay. A track a person loads plays at once.
 *
 * Layout ported from Holodeck's AudioIntelPanel
 * (src/components/audio/AudioIntelPanel.tsx, MIT; notice in
 * Holodeck-LICENSE.txt), restyled with Genobi's tokens.
 */
import Icon from "../components/Icon";
import type { BuilderSession } from "./useBuilderSession";
import { audioChoices, type RecentAudio } from "./audio-history";
import { AudioRecentMenu, type TrackActions } from "./AudioRecentMenu";
import { MeterStrip } from "./SignalScopes";
import { SoundSections } from "./SoundSections";
import { useSignalScopes } from "./useSignalScopes";
import { loadAndPlay } from "./sound-autoplay";
import { togglePlay } from "./example-track";
import { inComfyNode } from "./host";
import "./sound-panel.css";

/** Sound works in Shot, Build and Walk; the take freezes it at capture. */
export function AudioControls({
  s,
  projectAudio = [],
  selected = "",
  folded = false,
}: {
  s: BuilderSession;
  /** The Build selection, for the mod matrix's Route selected. */
  selected?: string;
  /** The open project's audio assets, in the studio. */
  projectAudio?: RecentAudio[];
  /** Folded in the dock: show only the transport and its meter. */
  folded?: boolean;
}) {
  // Inside Comfy there is no project: the list is the graph's audio outputs
  // and this browser's recent tracks.
  const choices = audioChoices(
    s.history.recent,
    inComfyNode() ? [] : projectAudio,
  );
  const scope = useSignalScopes(s);
  const actions: TrackActions = {
    pick: (item) => loadAndPlay(s, item.open(), item.source, item.label),
    forget: (item) => s.run(() => s.history.forget(item.id)),
  };
  return (
    <div className="wb-sound" data-folded={folded}>
      <div className="wb-sound-transport">
        <button
          type="button"
          className="wb-play"
          aria-label={s.playing ? "Stop" : "Play"}
          title={s.playing ? "Stop" : "Play"}
          aria-pressed={s.playing}
          disabled={!s.audioURL && !s.example.blob}
          onClick={() => togglePlay(s)}
        >
          <Icon name={s.playing ? "pause" : "play"} size={14} />
        </button>
        <MeterStrip scope={scope} />
        <label className="wb-icon-button wb-load-audio" title="Load audio">
          <Icon name="upload" size={14} />
          <input
            type="file"
            accept="audio/*"
            aria-label="Audio file"
            onChange={(ev) => {
              const file = ev.target.files?.[0];
              if (file) loadAndPlay(s, file, "file");
              ev.target.value = "";
            }}
          />
        </label>
        <AudioRecentMenu
          tracks={choices}
          current={s.audioName}
          actions={actions}
        />
        <div className="wb-track">
          <small>Track</small>
          <span
            title={
              s.audioName === s.example.label ||
              (!s.audioName && s.example.blob)
                ? s.example.credit
                : s.audioName
            }
          >
            {s.audioName ||
              (s.example.blob ? s.example.label : "No track loaded")}
          </span>
        </div>
      </div>
      <audio ref={s.audioElement} src={s.audioURL || undefined} hidden />
      <SoundSections
        s={s}
        scope={scope}
        tracks={choices}
        actions={actions}
        selected={selected}
        folded={folded}
      />
    </div>
  );
}
