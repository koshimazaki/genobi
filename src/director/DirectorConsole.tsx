import ResolutionControl from "./ResolutionControl";
import { useCallback, useState, type CSSProperties } from "react";
import ResizeHandle from "../components/ResizeHandle";
import type { Layer, Project } from "../../shared/director/types";
import { applyCommand } from "../../shared/director/commands";
import { retimeProject, rescaleFrame } from "../../shared/director/retime";
import { magnetic, snapGrid, timelinePixels } from "./snap";
import { CHANNEL_WIDTH } from "./channel-layout";
import { editNoteText, type NoteCommand } from "../../shared/director/notes";
import type { Bundle } from "./bundle";
import ComposerTransport from "./ComposerTransport";
import FeedbackPanel from "./FeedbackPanel";
import LayerInspector from "./LayerInspector";
import NotesPanel from "./NotesPanel";
import Timeline from "./Timeline";
import TimelineHeader from "./TimelineHeader";
import type { TrimRequest } from "./useTrimPreview";
import { useStudio } from "../studio/useStudio";

/** The edit console: timeline header, transport, lanes and the layer drawer. */
export default function DirectorConsole({
  project: p,
  bundle,
  layer: l,
  busy,
  ready,
  waveforms,
  canSplit,
  split,
  togglePlay,
  stop,
  seek,
  cancelRender,
  undo,
  commit,
  edit,
  retrack,
  changeList,
  preview,
  drop,
  replace,
  report,
}: {
  project: Project;
  bundle: Bundle;
  layer?: Layer;
  busy: boolean;
  ready: boolean;
  waveforms: Record<string, number[]>;
  canSplit: boolean;
  split: () => void;
  togglePlay: () => Promise<void>;
  /** Pause if playing and return to frame 0 (`useDirectorTransport`). */
  stop: () => Promise<void>;
  seek: (frame: number) => Promise<void>;
  cancelRender: () => void;
  undo: () => void;
  commit: (bundle: Bundle) => void;
  edit: (id: string, patch: Partial<Layer>) => void;
  retrack: (id: string, startFrame: number, lane: string) => void;
  changeList: (layers: Layer[]) => void;
  preview: (r: TrimRequest | null) => void;
  drop: (files: File[]) => void;
  replace: () => void;
  report: (e: unknown) => void;
}) {
  const undoCount = useStudio((s) => s.director.history.length);
  const { selected, inspectorOpen, channelsOpen } = useStudio(
    (s) => s.workspace,
  );
  const {
    zoom,
    fit,
    snap,
    channelWidth,
    imageFrames,
    looping,
    units,
    timelineExpanded,
  } = useStudio((s) => s.settings);
  const { frame } = useStudio((s) => s.transport);
  const { playing, rendering } = useStudio((s) => s.operations);
  const actions = useStudio((s) => s.actions);
  const select = (selected: string) => actions.workspace({ selected });
  const setInspectorOpen = (inspectorOpen: boolean) =>
    actions.workspace({ inspectorOpen });
  const [notesOpen, setNotesOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [lanesWidth, setLanesWidth] = useState(0);
  const [inspectorWidth, setInspectorWidth] = useState(300);
  const measure = useCallback((w: number) => setLanesWidth(w), []);
  const { fps, durationFrames } = p.composition;
  const pixels = timelinePixels(fps, zoom, {
    on: fit,
    width: lanesWidth,
    frames: durationFrames,
  });
  const updateComposition = (patch: Partial<Project["composition"]>) =>
    commit({
      ...bundle,
      project: {
        ...p,
        revision: p.revision + 1,
        composition: { ...p.composition, ...patch },
      },
    });
  /** An explicit rate change: one Undo step; the playhead keeps its moment. */
  function setFps(next: number) {
    if (next === fps || busy) return;
    try {
      const project = retimeProject(p, next);
      commit({ ...bundle, project });
      void seek(
        Math.min(
          project.composition.durationFrames - 1,
          rescaleFrame(frame, fps, next),
        ),
      );
    } catch (e) {
      report(e);
    }
  }
  // The studio's notes go through the same command an agent sends.
  // A reworded note pressed straight into Resolve or Delete applies both
  // in one commit, so the rebuild after the first cannot swallow the second.
  function runNote(
    command: NoteCommand,
    reworded?: { id: string; text: string },
  ) {
    let project = p;
    try {
      if (reworded) project = editNoteText(p, reworded.id, reworded.text);
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    const result = applyCommand({ project, prompt: "" }, command);
    if (!result.ok) return result.error;
    commit({ ...bundle, project: result.copy.project });
    return "";
  }
  // Prompts and directions go through the same commands an agent sends.
  function runCommand(command: unknown) {
    const result = applyCommand({ project: p, prompt: "" }, command);
    if (!result.ok) return result.error;
    commit({ ...bundle, project: result.copy.project });
    return "";
  }
  function editNote(id: string, text: string) {
    try {
      const next = editNoteText(p, id, text);
      commit({ ...bundle, project: { ...next, revision: p.revision + 1 } });
      return "";
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }
  return (
    <section className="dir-console">
      <TimelineHeader
        project={p}
        busy={busy}
        undoCount={undoCount}
        channelsOpen={channelsOpen}
        fold={() => {
          if (!channelsOpen && channelWidth < 72)
            actions.settings({ channelWidth: 200 });
          actions.workspace({ channelsOpen: !channelsOpen });
        }}
        inspectorOpen={inspectorOpen}
        inspect={() => setInspectorOpen(!inspectorOpen)}
        notesOpen={notesOpen}
        toggleNotes={() => setNotesOpen(!notesOpen)}
        feedbackOpen={feedbackOpen}
        toggleFeedback={() => setFeedbackOpen(!feedbackOpen)}
        units={units}
        setUnits={(units) => actions.settings({ units })}
        expanded={timelineExpanded}
        expand={() => actions.settings({ timelineExpanded: !timelineExpanded })}
        undo={undo}
      />
      <div
        className="dir-notes-drawer"
        data-open={notesOpen}
        inert={!notesOpen}
      >
        <NotesPanel
          project={p}
          frame={frame}
          layer={l}
          units={units}
          disabled={busy}
          run={runNote}
          edit={editNote}
          seek={(f) => void seek(f)}
          select={select}
          close={() => setNotesOpen(false)}
        />
      </div>
      <div
        className="dir-feedback-drawer"
        data-open={feedbackOpen}
        inert={!feedbackOpen}
      >
        {/* Built only while open: the diff runs once per edit, not per frame. */}
        {feedbackOpen && (
          <FeedbackPanel bundle={bundle} close={() => setFeedbackOpen(false)} />
        )}
      </div>
      <ComposerTransport
        resolutionControl={
          <ResolutionControl
            bundle={bundle}
            busy={busy}
            command={runCommand}
            report={report}
          />
        }
        units={units}
        looping={looping}
        setLooping={(looping) => actions.settings({ looping })}
        imageFrames={imageFrames}
        setImageFrames={(imageFrames) => actions.settings({ imageFrames })}
        addTrack={() => actions.workspace({ addTrackOpen: true })}
        split={split}
        canSplit={canSplit}
        composition={p.composition}
        clipsEnd={Math.max(
          0,
          ...p.layers.map((l) => l.startFrame + l.durationFrames),
        )}
        frame={frame}
        ready={ready}
        playing={playing}
        rendering={rendering}
        busy={busy}
        snap={snap}
        setSnap={(snap) => actions.settings({ snap })}
        pixels={pixels}
        fit={fit}
        setFit={() => {
          actions.settings({ fit: true });
          document
            .querySelector(".director .dir-timeline")
            ?.scrollTo({ left: 0 });
        }}
        setZoomPixels={(n) => actions.settings({ zoom: n * fps, fit: false })}
        setFps={setFps}
        togglePlay={togglePlay}
        stop={() => void stop()}
        cancelRender={cancelRender}
        update={updateComposition}
      />
      <div
        className="dir-edit-area is-docked"
        data-inspector={inspectorOpen}
        style={{ "--inspector-width": `${inspectorWidth}px` } as CSSProperties}
      >
        <Timeline
          collapsed={!channelsOpen}
          expanded={timelineExpanded}
          units={units}
          retrack={retrack}
          changeList={changeList}
          preview={preview}
          inspect={() => setInspectorOpen(true)}
          drop={drop}
          waveforms={waveforms}
          project={p}
          frame={frame}
          selected={selected}
          select={select}
          seek={seek}
          edit={edit}
          pixels={pixels}
          snap={snapGrid(snap, p)}
          magnet={magnetic(snap)}
          disabled={busy}
          channelWidth={channelWidth}
          setChannelWidth={(n) => {
            if (!channelsOpen) actions.workspace({ channelsOpen: true });
            actions.settings({
              channelWidth: Math.max(
                CHANNEL_WIDTH.min,
                Math.min(CHANNEL_WIDTH.max, Math.round(n)),
              ),
            });
          }}
          measure={measure}
          setDuration={(durationFrames) =>
            updateComposition({ durationFrames })
          }
          command={runCommand}
          report={report}
        />
        {inspectorOpen && (
          <ResizeHandle
            className="dir-inspector-resize"
            label="Inspector width"
            reverse
            value={inspectorWidth}
            min={240}
            max={520}
            change={setInspectorWidth}
          />
        )}
        <div
          className="dir-inspector-drawer"
          data-open={inspectorOpen}
          inert={!inspectorOpen}
        >
          <LayerInspector
            project={p}
            layer={l}
            disabled={busy}
            close={() => setInspectorOpen(false)}
            edit={(patch) => l && edit(l.id, patch)}
            changeList={changeList}
            select={select}
            replace={replace}
            command={runCommand}
          />
        </div>
      </div>
    </section>
  );
}
