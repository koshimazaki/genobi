import type { BuilderSession } from "./useBuilderSession";
import { Fold } from "./FloatingPanel";
import { ModMatrixEditor } from "./ModMatrixEditor";
import type { RecentAudio } from "./audio-history";
import { TrackList, type TrackActions } from "./AudioRecentMenu";
import { SignalScopes } from "./SignalScopes";
import { inComfyNode } from "./host";
import type { SignalScope } from "./useSignalScopes";

/**
 * The Sound panel below its transport: audio response, optional signal scopes,
 * audio assets and Clear audio. Hidden while the panel is folded.
 * Hook-free: `AudioControls` owns the scope loop and passes it in.
 */
export function SoundSections({
  s,
  scope,
  tracks,
  actions,
  selected,
  folded,
}: {
  s: BuilderSession;
  scope: SignalScope;
  tracks: RecentAudio[];
  actions: TrackActions;
  selected: string;
  folded: boolean;
}) {
  const r = s.recipe,
    comfy = inComfyNode(),
    active = r.audioRoutes.filter((route) => route.enabled).length;
  return (
    <div className="wb-sound-sections" hidden={folded}>
      {!s.audioName && (
        <p className="wb-hint">
          {s.example.blob
            ? "Press Play to hear the example track, Koshi Mosaic · Dimensions, and watch it drive the set, or load or drop your own."
            : "Load or drop a track on the scene: it plays at once and drives the set on the capture frame grid."}
        </p>
      )}
      {/* Live during Play: routes apply to the next frame drawn. */}
      <Fold title="Audio response" open>
        <p className="wb-hint">
          Mod matrix · {active} active {active === 1 ? "route" : "routes"}.
          Choose which sounds move the scene, then press Play to preview.
        </p>
        <ModMatrixEditor
          recipe={r}
          frame={s.frame}
          selected={selected}
          change={s.tune}
        />
      </Fold>
      <Fold title="Signal scopes">
        <SignalScopes scope={scope} live={s.playing && !!s.audioURL} />
      </Fold>
      {/* Inside Comfy the list is the graph's audio outputs (SaveAudio,
          PreviewAudio, Inputs) plus this browser's recent tracks. */}
      <Fold title={comfy ? "Graph audio outputs" : "Audio assets"}>
        <TrackList
          tracks={tracks}
          current={s.audioName}
          actions={actions}
          label={comfy ? "Graph audio outputs" : "Audio assets"}
        />
        <p className="wb-hint">
          {s.history.persisted
            ? "Recent tracks stay in this browser across reloads; nothing is uploaded."
            : "This browser keeps no site data, so recent tracks last for this tab only."}
        </p>
      </Fold>
      <button
        type="button"
        onClick={() => {
          s.setPlaying(false);
          s.track.current = null;
          s.setAudioURL("");
          s.setAudioName("");
          s.change({
            envelope: [],
            bandEnvelopes: { low: [], mid: [], high: [] },
          });
        }}
      >
        Clear audio
      </button>
    </div>
  );
}
