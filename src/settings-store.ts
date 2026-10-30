import { create } from "zustand";
import type {
  RunLocation,
  RunLocationState,
} from "../shared/comfy/run-location";
import type { WorkflowCatalogue } from "../shared/comfy/workflows";
import { entryFor } from "../shared/registry";
import type { Generator, VideoModel } from "../shared/types";
import {
  readRunLocation,
  readWorkflows,
  saveRunLocation,
  selectWorkflow,
  SettingSaver,
  type SettingView,
} from "./run-settings";
import { SettingLane } from "./setting-lane";

/**
 * What the studio shows for the run location and each workflow model's
 * template, and whether any of it is still being saved, restored or is
 * unconfirmed. Generate waits while it is (`useSettingsHold`), and every paid
 * write names what is shown (`expectedHeaders`), so the server refuses a run
 * whose settings changed underneath (`409 settings_changed`).
 */
interface SettingsState {
  location?: string;
  /** The whole run-location answer the lane last applied: the run-mode line reads it. */
  runLocation?: RunLocationState;
  workflows: Record<string, string>;
  /** Each template's own hosts, where it names them (a pinned graph). */
  hosts: Record<string, string[]>;
  restoring: boolean;
  /** Settings with a save in flight or a value the server has not confirmed. */
  held: Record<string, boolean>;
  /** Settings with a save in flight, as every control showing them says. */
  saving: Record<string, boolean>;
}
export const useSettingsStore = create<SettingsState>(() => ({
  workflows: {},
  hosts: {},
  restoring: false,
  held: {},
  saving: {},
}));
const set = (next: Partial<SettingsState>) => useSettingsStore.setState(next);

export const setRestoring = (restoring: boolean) => set({ restoring });

/** The two session settings a paid write names, and the answer each has. */
export type Setting = "run-location" | "workflow";
type ValueOf<S extends Setting> = S extends "run-location"
  ? RunLocationState
  : WorkflowCatalogue;

/** Private: only an answer the setting's lane lets through reaches the store. */
const notes: { [S in Setting]: (value: ValueOf<S>) => void } = {
  "run-location": (state) => {
    if (state.location) set({ location: state.location, runLocation: state });
  },
  workflow: (catalogue) =>
    set({
      workflows: Object.fromEntries(
        catalogue.entries.map((e) => [e.entry, e.selected]),
      ),
      hosts: Object.fromEntries(
        catalogue.templates.flatMap((t) =>
          t.hosts ? [[t.id, [...t.hosts]]] : [],
        ),
      ),
    }),
};
const note = <S extends Setting>(name: S, value: ValueOf<S> | null) => {
  if (value) (notes[name] as (value: ValueOf<S>) => void)(value);
};

/**
 * The generation of the person's setup choices, shared by everything that
 * sets the model, workflow or run location: a settings save, a Recreate, a
 * clip or title restored into the composer, a model or generator chosen
 * there. A pending Recreate restore applies nothing once a newer choice took
 * the next generation (`RunRestorer`).
 */
let setupGeneration = 0;
export const setupChoices = {
  current: () => setupGeneration,
  next: () => ++setupGeneration,
};
/** A newer setup choice: any pending Recreate restore is superseded. */
export const supersedeRestores = () => void setupChoices.next();

/** The read each setting's lane starts on its own to converge on the server. */
type Rereads = { [S in Setting]: () => Promise<ValueOf<S> | null> };
const serverReads: Rereads = {
  "run-location": () => readRunLocation(),
  workflow: () => readWorkflows(),
};
let rereads = serverReads;

/**
 * Each setting's one sequencing point (`SettingLane`), for the page's
 * lifetime: every reader and writer of the setting (a control's save or read,
 * a Recreate restore, the startup read) goes through it. Only the newest
 * answer reaches the store, only the newest write holds Generate, and the
 * lane reads the server again when its newest request ended without a value.
 */
let lanes: { [S in Setting]?: SettingLane<ValueOf<S>> } = {};
function laneOf<S extends Setting>(name: S): SettingLane<ValueOf<S>> {
  const existing = lanes[name] as SettingLane<ValueOf<S>> | undefined;
  if (existing) return existing;
  const lane = new SettingLane<ValueOf<S>>(
    () => (rereads[name] as () => Promise<ValueOf<S> | null>)(),
    (value) => note(name, value),
    () => sync(name),
  );
  (lanes as Record<Setting, unknown>)[name] = lane;
  return lane;
}

/** Mirrors a lane's hold into the store, where Generate and controls read it. */
function sync(name: Setting) {
  const lane = laneOf(name);
  const saving = lane.saving > 0;
  const held = saving || lane.confirmed === false;
  const state = useSettingsStore.getState();
  if (state.held[name] !== held || state.saving[name] !== saving)
    set({
      held: { ...state.held, [name]: held },
      saving: { ...state.saving, [name]: saving },
    });
}

/**
 * One read or write of `name` through its lane, for callers without a
 * control: a Recreate restore and the startup read. Resolves with the answer
 * whether or not it was the newest, or rejects with its error.
 */
async function request<S extends Setting>(
  name: S,
  kind: "read" | "write",
  send: () => Promise<ValueOf<S> | null>,
): Promise<ValueOf<S> | null> {
  const answer = await laneOf(name).run(kind, send);
  if (!answer.ok) throw answer.error;
  return answer.value;
}

/** Recreate's writes: each takes its setting's next number, like a save. */
export const restoreWrites = {
  location: (
    location: "local" | "cloud",
    send: typeof saveRunLocation = saveRunLocation,
  ) => request("run-location", "write", () => send(location)),
  workflow: (
    entry: string,
    template: string,
    send: typeof selectWorkflow = selectWorkflow,
  ) => request("workflow", "write", () => send(entry, template)),
};

/**
 * First-run setup's run location (Local ComfyUI chosen there): a newer setup
 * choice, written through the lane like a control's save.
 */
export const setupLocationWrite = (
  location: RunLocation,
  send: typeof saveRunLocation = saveRunLocation,
) => {
  supersedeRestores();
  return request("run-location", "write", () => send(location));
};

/** A read of `name` through its lane, for a caller without a control. */
export const readSetting = <S extends Setting>(
  name: S,
  send: () => Promise<ValueOf<S> | null>,
) => request(name, "read", send);

/**
 * The `SettingSaver` for one control of setting `name`, on the setting's
 * lane: it shows the lane's answers, and the setting is held (Generate waits)
 * while its newest write is in flight or its value is unconfirmed. Call
 * `dispose` when the control goes.
 */
export const settingSaver = <S extends Setting>(
  name: S,
  show: (view: Partial<SettingView<ValueOf<S>>>) => void,
) => new SettingSaver<ValueOf<S>>(show, laneOf(name), supersedeRestores);

/** The settings revision of the answer `name` last applied, if any. */
export const appliedRevision = (name: Setting) =>
  laneOf(name).current?.revision;

/** Whether setting `name` has a write in flight, from any control. */
export const useSettingSaving = (name: Setting) =>
  useSettingsStore((state) => state.saving[name] ?? false);

/**
 * What holds Generate and Approve: a Recreate restoring, a settings write in
 * flight, or a setting whose value is not confirmed (a write ended without an
 * answer and the server is being read again).
 */
export type SettingsHold = "restoring" | "saving" | "checking" | null;
const holdOf = (state: SettingsState): SettingsHold =>
  state.restoring
    ? "restoring"
    : Object.values(state.saving).some(Boolean)
      ? "saving"
      : Object.values(state.held).some(Boolean)
        ? "checking"
        : null;
export const useSettingsHold = () => useSettingsStore(holdOf);
/** Outside React: what holds Generate now. */
export const settingsHold = () => holdOf(useSettingsStore.getState());

/**
 * The headers a paid write sends: the run location shown, and for a workflow
 * model the template shown behind it. Nothing until the settings were read.
 */
export function expectedHeaders(input?: {
  generator: Generator;
  model?: VideoModel;
}): Record<string, string> {
  const { location, workflows } = useSettingsStore.getState();
  const entry = input && entryFor(input.generator, input.model);
  const workflow =
    entry?.route === "workflow" ? workflows[entry.id] : undefined;
  return {
    ...(location ? { "Genobi-Run-Location": location } : {}),
    ...(workflow ? { "Genobi-Workflow": workflow } : {}),
  };
}

let loaded = false;
/**
 * Reads the session's settings once, so the first Generate can name them.
 * Each read is numbered in its setting's lane, so its answer is dropped when
 * anything started after it: a save, a Recreate or a control's own read.
 */
export function loadSettings(
  read = { location: readRunLocation, workflows: readWorkflows },
) {
  if (loaded) return;
  loaded = true;
  void readSetting("run-location", () => read.location()).catch(() => {});
  void readSetting("workflow", () => read.workflows()).catch(() => {});
}

/**
 * Tests only: lets `loadSettings` run again, forgets every setting's
 * requests, and sets the reads the lanes start on their own.
 */
export const resetSettingsForTests = (reads: Partial<Rereads> = {}) => {
  loaded = false;
  lanes = {};
  rereads = { ...serverReads, ...reads };
};
