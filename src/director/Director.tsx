import ProjectMemoryPanel from "../memory/ProjectMemoryPanel";
import { ProjectShelf } from "../studio/ProjectShelf";
import { StudioPanel, useShell } from "../studio/ShellContext";
import RemixPanel from "./RemixPanel";
import SavedVideos from "./SavedVideos";
import RenderResult from "./RenderResult";
import { usePageKey } from "../usePageKey";
import { useEffect, useRef, useState } from "react";
import { splitLayer } from "../../shared/director/split";
import { addGraphics } from "./add-graphics";
import AddTrackDialog from "./AddTrackDialog";
import { useTimelineKeys } from "../timeline-keys";
import { ownedByDirector } from "./shortcuts";
import { useTrimPreview } from "./useTrimPreview";
import { moveToLane } from "../../shared/director/tracks";
import { editLayer, type Layer } from "../../shared/director/types";
import { keepNotes } from "../../shared/director/notes";
import { importBundle, saveBundle, type Bundle } from "./bundle";
import { guardUnload } from "./leave-guard";
import { upgradeOpenedBundle } from "./upgrade-bundle";
import { studioStore } from "../studio/store";
import { useStudio } from "../studio/useStudio";
import ProjectAssetDrawer from "./ProjectAssetDrawer";
import { useDirectorRuntime } from "./useDirectorRuntime";
import { useDirectorTransport } from "./useDirectorTransport";
import { addMedia } from "./import-media";
import DirectorConsole from "./DirectorConsole";
import MediaReplacementInput from "./MediaReplacementInput";
import DirectorStage from "./DirectorStage";
import ProgramRow from "./ProgramRow";
import { applyCommand } from "../../shared/director/commands";
import ComposerHeader from "./ComposerHeader";
import CopyConflictQuestion from "./CopyConflictQuestion";
import "./director.css";
import "./timeline.css";
import "./compact.css";
import "./transport.css";
import "./timeline-channels.css";
import "./timeline-views.css";
import "./editor-layout.css";
// After editor-layout.css: its stacked grid must give way to these.
import "./program-fit.css";

export default function Director({
  active = true,
  initializeProject = active,
}: {
  active?: boolean;
  initializeProject?: boolean;
}) {
  const shell = useShell();
  const [versionRequest, setVersionRequest] = useState(0);
  const { bundle, history, drafts } = useStudio((s) => s.director);
  const { advanced, selected, addTrackOpen } = useStudio((s) => s.workspace);
  const { imageFrames, units } = useStudio((s) => s.settings);
  const { frame } = useStudio((s) => s.transport);
  const { workingFile, playing, rendering } = useStudio((s) => s.operations);
  const actions = useStudio((s) => s.actions);
  const setAdvanced = (advanced: boolean) => {
    actions.workspace({ advanced });
    shell?.select(advanced ? "editor" : "director");
  };
  const select = (selected: string) => actions.workspace({ selected });
  const setInspectorOpen = (inspectorOpen: boolean) =>
    actions.workspace({ inspectorOpen });
  const setAddTrackOpen = (addTrackOpen: boolean) =>
    actions.workspace({ addTrackOpen });
  const setFrame = (frame: number) => actions.transport({ frame });
  const setWorkingFile = (workingFile: boolean) =>
    actions.operations({ workingFile });
  const connection = usePageKey();
  const directorRuntime = useDirectorRuntime(bundle, active, initializeProject);
  const {
    canvas,
    runtime,
    abort,
    status,
    setStatus,
    error,
    setError,
    report,
    ready,
    firstFrame,
    setReady,
    waveforms,
    renderUrl,
    renderSummary,
    setRenderUrl,
  } = directorRuntime;
  const { seek, togglePlay, stop, exportVideo } = useDirectorTransport(
    directorRuntime,
    bundle,
  );
  const imports = useRef<HTMLInputElement>(null),
    media = useRef<HTMLInputElement>(null),
    replacement = useRef<string | undefined>(undefined);
  const undoCount = history.length;
  const dirty =
    !!undoCount || Object.values(drafts).some((d) => d.history.length > 0);
  // Undo history is lost on reload. The guard asks only for work the
  // project copy does not hold (leave-guard.ts): silent while it is synced,
  // and deliberate leaves and reloads save first.
  useEffect(() => {
    if (!dirty) return;
    window.addEventListener("beforeunload", guardUnload);
    return () => window.removeEventListener("beforeunload", guardUnload);
  }, [dirty]);
  function commit(next: Bundle) {
    try {
      actions.commit(next, bundle);
      setRenderUrl("");
      setError("");
    } catch (e) {
      report(e);
    }
  }
  function edit(id: string, patch: Partial<Layer>) {
    if (!bundle || playing || rendering) return;
    try {
      commit({ ...bundle, project: editLayer(bundle.project, id, patch) });
    } catch (e) {
      report(e);
    }
  }
  function retrack(id: string, startFrame: number, lane: string) {
    if (!bundle || playing || rendering) return;
    try {
      commit({
        ...bundle,
        project: moveToLane(bundle.project, id, startFrame, lane),
      });
    } catch (e) {
      report(e);
    }
  }
  const trim = useTrimPreview(
    runtime,
    frame,
    bundle?.project.composition.fps ?? 30,
    units,
    report,
  );
  const p = bundle?.project,
    l = p?.layers.find((l) => l.id === selected),
    busy = playing || rendering || workingFile || !ready;
  // A note on a layer this removes stays at its frame, without the layer.
  const changeList = (layers: Layer[]) => {
    if (bundle)
      commit({
        ...bundle,
        project: keepNotes({
          ...bundle.project,
          revision: bundle.project.revision + 1,
          layers,
        }),
      });
  };
  const canSplit = Boolean(
    l &&
    !busy &&
    !l.locked &&
    frame > l.startFrame &&
    frame < l.startFrame + l.durationFrames,
  );
  function split() {
    if (!bundle || !canSplit) return;
    try {
      const id = `layer-${crypto.randomUUID().slice(0, 8)}`;
      commit({
        ...bundle,
        project: splitLayer(bundle.project, selected, frame, id),
      });
      select(id);
    } catch (e) {
      report(e);
    }
  }
  useTimelineKeys(active && !addTrackOpen, ownedByDirector, (command) => {
    if (studioStore.getState().workspace.drawerOpen) return false;
    if (command === "delete") {
      if (!p || !l || busy) return false;
      if (l.locked) report(new Error("Unlock this layer first"));
      else {
        changeList(p.layers.filter((x) => x.id !== l.id));
        select("");
      }
      return true;
    }
    if (command === "play" && ready && !rendering && !workingFile) {
      void togglePlay();
      return true;
    }
    if (command === "split" && canSplit) {
      split();
      return true;
    }
    return false;
  });
  async function importTracks(files: File[], name = "") {
    if (!bundle || busy || !files.length) return;
    setWorkingFile(true);
    try {
      const next = await addMedia(bundle, files, frame, undefined, imageFrames);
      const added = next.project.layers.filter(
        (l) => !bundle.project.layers.some((old) => old.id === l.id),
      );
      if (name)
        added.forEach((l, i) => {
          l.name = `${name}${added.length > 1 ? ` ${i + 1}` : ""}`.slice(
            0,
            120,
          );
        });
      commit(next);
      if (added[0]) select(added[0].id);
      setInspectorOpen(false);
    } finally {
      setWorkingFile(false);
    }
  }
  return (
    <main
      className="director"
      onDragOver={(e) => {
        if (!busy && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        if (
          e.target instanceof Element &&
          e.target.closest(".dir-add-dialog, .dir-assets")
        )
          return;
        if (!advanced) return;
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          if (!busy)
            void importTracks(Array.from(e.dataTransfer.files)).catch(report);
        }
      }}
    >
      <StudioPanel id="file">
        <ComposerHeader
          versionRequest={versionRequest}
          simple={!advanced}
          name={p?.name}
          busy={busy}
          transportBusy={playing || rendering || workingFile}
          open={() => imports.current?.click()}
          save={() => bundle && saveBundle(bundle)}
          render={() => void exportVideo()}
          switchMode={() => setAdvanced(!advanced)}
        />
        {p && <ProjectMemoryPanel key={p.id} projectId={p.id} />}
      </StudioPanel>
      <input
        hidden
        ref={imports}
        type="file"
        accept=".zip,.json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setReady(false);
          setStatus("Opening bundle…");
          setWorkingFile(true);
          try {
            const next = await importBundle(f, bundle);
            setFrame(0);
            select(
              next.project.layers.some((l) => l.id === selected)
                ? selected
                : (next.project.layers[0]?.id ?? ""),
            );
            commit(next);
            // A bundle an older studio saved is brought up to date as an
            // edit on top of it, so Undo returns to it as saved.
            const note = await upgradeOpenedBundle(studioStore);
            if (note) report(note);
          } catch (e) {
            report(e);
            setReady(Boolean(runtime.current));
            setStatus("Import failed · current project retained");
          } finally {
            setWorkingFile(false);
          }
        }}
      />
      <MediaReplacementInput
        input={media}
        target={replacement}
        bundle={bundle}
        frame={frame}
        imageFrames={imageFrames}
        busy={setWorkingFile}
        commit={commit}
        report={report}
      />
      {bundle && (
        <ProjectAssetDrawer launcher={!shell} disabled={busy} report={report} />
      )}
      <StudioPanel id="project">
        {bundle && shell && <ProjectShelf role="production" />}
      </StudioPanel>
      <StudioPanel id="inspirations">
        {bundle && shell && <ProjectShelf role="reference" />}
      </StudioPanel>
      <StudioPanel id="stage">
        {error && (
          <div className="dir-error" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        <CopyConflictQuestion projectId={bundle?.project.id} />
      </StudioPanel>
      <div className={`dir-workspace ${!advanced ? "is-simple" : ""}`}>
        {bundle && (
          <RemixPanel
            generateVersion={() => setVersionRequest((n) => n + 1)}
            connection={connection}
            bundle={bundle}
            disabled={busy}
            editingDisabled={playing || rendering || workingFile}
            exportVideo={() => void exportVideo()}
            advanced={advanced}
            setAdvanced={setAdvanced}
            commit={commit}
            busy={setWorkingFile}
            report={report}
          />
        )}
        <StudioPanel id="stage">
          {!advanced && (
            <div className="dir-simple-play">
              <button
                disabled={!ready || rendering || workingFile}
                onClick={() => void togglePlay()}
              >
                {playing ? "Pause preview" : "Play preview"}
              </button>
              {shell?.preset === "director" && (
                <button
                  disabled={!ready || busy}
                  onClick={() => void exportVideo()}
                >
                  Export video
                </button>
              )}
              {rendering && (
                <button onClick={() => abort.current?.abort()}>
                  Cancel render
                </button>
              )}
            </div>
          )}
          <ProgramRow
            advanced={advanced}
            output={
              renderUrl && renderSummary ? (
                <RenderResult
                  url={renderUrl}
                  report={renderSummary}
                  edit={() => setAdvanced(true)}
                />
              ) : undefined
            }
            project={p}
            selected={selected}
            disabled={busy}
            command={(command) => {
              if (!bundle) return "No project open";
              const result = applyCommand(
                { project: bundle.project, prompt: "" },
                command,
              );
              if (!result.ok) return result.error;
              commit({ ...bundle, project: result.copy.project });
              return "";
            }}
          >
            <DirectorStage
              project={p}
              canvas={canvas}
              ready={ready}
              firstFrame={firstFrame}
              status={status}
              overlay={trim.label}
            />
          </ProgramRow>
        </StudioPanel>
      </div>
      <StudioPanel id="timeline">
        {(advanced || shell) && p && bundle && (
          <DirectorConsole
            project={p}
            bundle={bundle}
            layer={l}
            busy={busy}
            ready={ready}
            waveforms={waveforms}
            canSplit={canSplit}
            split={split}
            togglePlay={togglePlay}
            stop={stop}
            seek={seek}
            cancelRender={() => abort.current?.abort()}
            undo={() => {
              actions.undo();
              setRenderUrl("");
            }}
            commit={commit}
            edit={edit}
            retrack={retrack}
            changeList={changeList}
            preview={trim.preview}
            drop={(files) => void importTracks(files).catch(report)}
            replace={() => {
              replacement.current = l?.id;
              media.current?.click();
            }}
            report={report}
          />
        )}
      </StudioPanel>
      <StudioPanel id="file">
        {advanced && bundle && (
          <SavedVideos
            bundle={bundle}
            renderUrl={renderUrl}
            disabled={busy}
            connection={connection}
          />
        )}
      </StudioPanel>
      {addTrackOpen && p && (
        <AddTrackDialog
          project={p}
          busy={busy}
          close={() => setAddTrackOpen(false)}
          media={importTracks}
          graphics={(recipe, name) => {
            const added = addGraphics(p, recipe, frame);
            if (added) {
              if (name) added.layer.name = name;
              changeList(added.layers);
              select(added.layer.id);
              setInspectorOpen(false);
            }
          }}
        />
      )}
    </main>
  );
}
