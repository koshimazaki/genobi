import { createStore } from "zustand/vanilla";
import type { Bundle } from "../director/bundle";
import { validateProject } from "../director/validate";
import type { TimeUnits } from "../director/timecode";
import { linkedAsset } from "../director/clip-source";
import { keepNewestBase } from "../../shared/director/feedback";
import type { Project } from "../../shared/director/types";

export interface WorkspaceState {
  advanced: boolean;
  selected: string;
  inspectorOpen: boolean;
  channelsOpen: boolean;
  addTrackOpen: boolean;
  drawerOpen: boolean;
  assetRole: "production" | "reference";
  assetSelection: string;
  targetLayers: string[];
}
interface Draft {
  bundle: Bundle;
  history: Bundle[];
}
export interface StudioState {
  director: {
    bundle?: Bundle;
    history: Bundle[];
    drafts: Record<string, Draft>;
    /**
     * The bundle `initialize` set. While `bundle` is still this object the
     * person has only loaded the page's project (project-copy-sync.ts).
     */
    loaded?: Bundle;
  };
  workspace: WorkspaceState;
  settings: {
    zoom: number;
    /** Fit all: the zoom follows the timeline's width until a manual zoom. */
    fit: boolean;
    /** Free, Frame, Beat or Marker (`src/director/snap.ts`). */
    snap: string;
    /** The channel-name column, 32–320 px; folded shows coloured dots. */
    channelWidth: number;
    imageFrames: number;
    looping: boolean;
    units: TimeUnits;
    timelineExpanded: boolean;
  };
  transport: { frame: number };
  operations: { workingFile: boolean; playing: boolean; rendering: boolean };
  actions: {
    initialize: (bundle: Bundle) => void;
    commit: (bundle: Bundle, expected?: Bundle) => void;
    undo: () => void;
    workspace: (patch: Partial<WorkspaceState>) => void;
    /**
     * Listens for explicit selections (a clip or an asset chosen through
     * `workspace`), even of what was already selected; returns the cleanup.
     */
    onAssetSelect: (
      listener: (assetId: string, project?: Project) => void,
    ) => () => void;
    settings: (patch: Partial<StudioState["settings"]>) => void;
    transport: (patch: Partial<StudioState["transport"]>) => void;
    operations: (patch: Partial<StudioState["operations"]>) => void;
  };
}

/**
 * An asset selection that follows the selected clip stays with it when an
 * edit or undo swaps that clip's source; a deliberate other choice stands.
 */
function follow(w: WorkspaceState, before?: Project, after?: Project) {
  const was = linkedAsset(before, w.selected);
  if (!was || w.assetSelection !== was) return w;
  const now = linkedAsset(after, w.selected);
  return now === was ? w : { ...w, assetSelection: now };
}

/** One application owner; factories isolate tests. No automatic persistence. */
export function createStudioStore(advanced = false) {
  const selections = new Set<(assetId: string, project?: Project) => void>();
  return createStore<StudioState>()((set, get) => ({
    director: { history: [], drafts: {} },
    workspace: {
      advanced,
      selected: "title",
      inspectorOpen: false,
      channelsOpen: true,
      addTrackOpen: false,
      drawerOpen: false,
      assetRole: "production",
      assetSelection: "",
      targetLayers: [],
    },
    settings: {
      zoom: 100,
      fit: false,
      snap: "frame",
      channelWidth: 220,
      imageFrames: 30,
      looping: false,
      units: "frames",
      timelineExpanded: false,
    },
    transport: { frame: 30 },
    operations: { workingFile: false, playing: false, rendering: false },
    actions: {
      initialize(bundle) {
        if (get().director.bundle) return;
        validateProject(bundle.project);
        set({
          director: { bundle, history: [], drafts: {}, loaded: bundle },
          transport: {
            frame: Math.min(30, bundle.project.composition.durationFrames - 1),
          },
        });
      },
      commit(next, expected) {
        const state = get(),
          before = state.director.bundle;
        if (expected && before !== expected)
          throw new Error("Project changed while the edit was running; retry");
        validateProject(next.project);
        const switched = before?.project.id !== next.project.id;
        const drafts = { ...state.director.drafts };
        if (before)
          drafts[before.project.id] = {
            bundle: before,
            history: state.director.history,
          };
        const history = switched
          ? (drafts[next.project.id]?.history ?? [])
          : [...state.director.history, ...(before ? [before] : [])].slice(-20);
        // Undo and JSON imports cannot rewind the revision and revive stale writes.
        const bundle = {
          ...next,
          project: {
            ...next.project,
            revision: Math.max(
              next.project.revision,
              (before?.project.revision ?? -1) + 1,
            ),
          },
        };
        set({
          director: { bundle, history, drafts },
          ...(switched
            ? {
                transport: {
                  frame: Math.min(
                    30,
                    bundle.project.composition.durationFrames - 1,
                  ),
                },
                workspace: {
                  ...state.workspace,
                  selected: "title",
                  assetSelection: "",
                  targetLayers: [],
                },
              }
            : {
                workspace: follow(
                  state.workspace,
                  before?.project,
                  bundle.project,
                ),
              }),
        });
      },
      undo() {
        const state = get(),
          { bundle, history } = state.director;
        if (
          !bundle ||
          !history.length ||
          Object.values(state.operations).some(Boolean)
        )
          return;
        const previous = history[history.length - 1];
        set({
          workspace: follow(state.workspace, bundle.project, previous.project),
          director: {
            ...state.director,
            history: history.slice(0, -1),
            bundle: {
              ...previous,
              project: {
                // The agent's latest revision stays, so undoing its edit
                // reads as feedback rather than losing the base.
                ...keepNewestBase(previous.project, bundle.project),
                revision: bundle.project.revision + 1,
              },
            },
          },
        });
      },
      workspace: (patch) => {
        set((s) => {
          const next = { ...s.workspace, ...patch };
          // Selecting a clip selects its asset, so cards and clips light together.
          if (
            patch.selected !== undefined &&
            patch.assetSelection === undefined
          )
            next.assetSelection = linkedAsset(
              s.director.bundle?.project,
              patch.selected,
            );
          return { workspace: next };
        });
        // An explicit choice (a clip or an asset), told after the update.
        const state = get();
        const chosen =
          (patch.selected !== undefined ||
            patch.assetSelection !== undefined) &&
          state.workspace.assetSelection;
        if (chosen)
          for (const listener of selections)
            listener(chosen, state.director.bundle?.project);
      },
      onAssetSelect: (listener) => {
        selections.add(listener);
        return () => void selections.delete(listener);
      },
      settings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      transport: (patch) =>
        set((s) => ({ transport: { ...s.transport, ...patch } })),
      operations: (patch) =>
        set((s) => ({ operations: { ...s.operations, ...patch } })),
    },
  }));
}
export const studioStore = createStudioStore(
  typeof location !== "undefined" &&
    new URLSearchParams(location.search).get("example") === "studio",
);
