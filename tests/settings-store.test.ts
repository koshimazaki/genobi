import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunLocationState } from "../shared/comfy/run-location";
import { workflowCatalogue } from "../shared/comfy/workflows";
import {
  expectedHeaders,
  loadSettings,
  readSetting,
  resetSettingsForTests,
  restoreWrites,
  settingSaver,
  settingsHold,
  useSettingsStore,
} from "../src/settings-store";
import {
  SettingRefused,
  SettingUnconfirmed,
  type SettingView,
} from "../src/run-settings";
import {
  chainController,
  SETTINGS_HELD,
  type ChainClient,
} from "../src/chain-client";
import type { ChainAction, ChainEntry } from "../src/chain-state";

// Generate waits while a settings save is in flight or unconfirmed, and every
// paid write names the settings the studio shows.
/** No server answers the lanes' own reads unless a test says so. */
const unanswered = () => Promise.reject(new SettingUnconfirmed("no server"));
beforeEach(() =>
  resetSettingsForTests({ "run-location": unanswered, workflow: unanswered }),
);
afterEach(() => {
  resetSettingsForTests();
  useSettingsStore.setState({
    location: undefined,
    workflows: {},
    restoring: false,
    held: {},
    saving: {},
  });
});
/** The run location as the server answers it, at the revision it handled. */
const location = (value: "local" | "cloud", revision = 1) =>
  ({
    revision,
    location: value,
    choices: ["local", "cloud"],
    fixed: false,
  }) as RunLocationState;

describe("the settings hold", () => {
  it("holds Generate while a save is in flight, and releases it once confirmed", async () => {
    const saver = settingSaver("run-location", () => {});
    await saver.read(Promise.resolve(location("cloud")));
    expect(settingsHold()).toBeNull();
    let answer!: (value: RunLocationState) => void;
    const saving = saver.save(
      location("local"),
      () => new Promise((resolve) => (answer = resolve)),
    );
    expect(settingsHold()).toBe("saving");
    answer(location("local", 2));
    await saving;
    expect(settingsHold()).toBeNull();
    expect(useSettingsStore.getState().location).toBe("local");
  });

  it("keeps Generate held while a save is unconfirmed, until a read confirms it", async () => {
    const saver = settingSaver("run-location", () => {});
    await saver.read(Promise.resolve(location("cloud")));
    const lost = () => Promise.reject(new SettingUnconfirmed("lost"));
    await saver.save(location("local"), lost);
    expect(settingsHold()).toBe("checking");
    // Reopening the dialog reads the server again.
    const reopened = settingSaver("run-location", () => {});
    await reopened.read(Promise.resolve(location("cloud")));
    expect(settingsHold()).toBeNull();
    expect(useSettingsStore.getState().location).toBe("cloud");
  });
});

describe("expected headers", () => {
  it("name the shown location, and the template for a workflow model only", async () => {
    expect(
      expectedHeaders({ generator: "video", model: "ltx-2.5-akuspace" }),
    ).toEqual({});
    await readSetting("run-location", async () => location("local"));
    await readSetting("workflow", async () =>
      workflowCatalogue((entry) =>
        entry === "ltx-2-5-akuspace" ? "ltx-2-5-t2v" : undefined,
      ),
    );
    expect(
      expectedHeaders({ generator: "video", model: "ltx-2.5-akuspace" }),
    ).toEqual({
      "Genobi-Run-Location": "local",
      "Genobi-Workflow": "ltx-2-5-t2v",
    });
    expect(expectedHeaders({ generator: "video", model: "ltx-2.5" })).toEqual({
      "Genobi-Run-Location": "local",
    });
    expect(expectedHeaders()).toEqual({ "Genobi-Run-Location": "local" });
  });
});

describe("the startup settings read", () => {
  /** A read whose answer lands when the test says so. */
  function late<T>() {
    let answer!: (value: T) => void;
    const promise = new Promise<T>((resolve) => (answer = resolve));
    return { promise, answer };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const startup = () => {
    resetSettingsForTests({ "run-location": unanswered, workflow: unanswered });
    const reads = {
      location: late<RunLocationState | null>(),
      workflows: late<ReturnType<typeof workflowCatalogue> | null>(),
    };
    loadSettings({
      location: () => reads.location.promise,
      workflows: () => reads.workflows.promise,
    });
    return reads;
  };
  const akuspace = { generator: "video", model: "ltx-2.5-akuspace" } as const;

  it("is dropped when a save or a Recreate lands first", async () => {
    const reads = startup();
    // The person picks Local and the save lands before the startup read.
    const saver = settingSaver("run-location", () => {});
    await saver.save(location("local"), async () => location("local", 2));
    // Recreate restores the no-LoRA template.
    await restoreWrites.workflow("ltx-2-5-akuspace", "ltx-2-5-t2v", async () =>
      workflowCatalogue(
        (entry) => (entry === "ltx-2-5-akuspace" ? "ltx-2-5-t2v" : undefined),
        false,
        3,
      ),
    );
    // The slow startup reads answer with what the server held before them.
    reads.location.answer(location("cloud", 1));
    reads.workflows.answer(workflowCatalogue(() => undefined, false, 1));
    await settle();
    expect(expectedHeaders(akuspace)).toEqual({
      "Genobi-Run-Location": "local",
      "Genobi-Workflow": "ltx-2-5-t2v",
    });
  });

  it("is applied when nothing newer was noted", async () => {
    const reads = startup();
    reads.location.answer(location("cloud"));
    reads.workflows.answer(workflowCatalogue(() => undefined));
    await settle();
    expect(expectedHeaders(akuspace)).toEqual({
      "Genobi-Run-Location": "cloud",
      "Genobi-Workflow": "ltx-2-5-akuspace-t2v",
    });
  });
});

describe("a settings control closed and opened again", () => {
  it("drops the earlier save's late answer: the newer save's value and hold stand", async () => {
    const first = settingSaver("run-location", () => {});
    await first.read(Promise.resolve(location("cloud")));
    // Save A (Local) is sent; its answer is held open.
    let answerA!: (value: RunLocationState) => void;
    const saveA = first.save(
      location("local"),
      () => new Promise((resolve) => (answerA = resolve)),
    );
    expect(settingsHold()).toBe("saving");
    // The dialog closes and opens again: a new control reads the server,
    // and still shows the earlier save as saving.
    const views: { saving?: boolean }[] = [];
    const reopened = settingSaver("run-location", (next) => views.push(next));
    // The server took A at revision 2.
    await reopened.read(Promise.resolve(location("local", 2)));
    expect(useSettingsStore.getState().saving["run-location"]).toBe(true);
    expect(settingsHold()).toBe("saving");
    // Save B (Cloud) is held open too, then lands.
    let answerB!: (value: RunLocationState) => void;
    const saveB = reopened.save(
      location("cloud"),
      () => new Promise((resolve) => (answerB = resolve)),
    );
    // A's late answer arrives while B is in flight: the state the reopened
    // read already showed, and it does not release B's hold.
    answerA(location("local", 2));
    await saveA;
    expect(useSettingsStore.getState().location).toBe("local");
    expect(settingsHold()).toBe("saving");
    answerB(location("cloud", 3));
    await saveB;
    expect(useSettingsStore.getState().location).toBe("cloud");
    expect(expectedHeaders()).toEqual({ "Genobi-Run-Location": "cloud" });
    expect(settingsHold()).toBeNull();
    expect(useSettingsStore.getState().saving["run-location"]).toBe(false);
    expect(views.at(-1)).toMatchObject({ saving: false });
  });

  it("drops the earlier save's answer that lands after the newer save", async () => {
    // The server took A before B; only A's answer was slow, so it carries
    // the older revision and is dropped.
    const first = settingSaver("run-location", () => {});
    await first.read(Promise.resolve(location("cloud")));
    let answerA!: (value: RunLocationState) => void;
    const saveA = first.save(
      location("local"),
      () => new Promise((resolve) => (answerA = resolve)),
    );
    const reopened = settingSaver("run-location", () => {});
    await reopened.read(Promise.resolve(location("local", 2)));
    await reopened.save(location("cloud"), async () => location("cloud", 3));
    // A is still in flight and could still change the server: held.
    expect(settingsHold()).toBe("saving");
    answerA(location("local", 2));
    await saveA;
    expect(useSettingsStore.getState().location).toBe("cloud");
    expect(expectedHeaders()).toEqual({ "Genobi-Run-Location": "cloud" });
    expect(settingsHold()).toBeNull();
  });
});

describe("a change the server refused or whose answer was lost", () => {
  /** A paused chain stage with a live quote, and a client that records approvals. */
  function pausedChain() {
    const chain = {
      id: "chain-1",
      status: "paused",
      createdAt: "",
      updatedAt: "",
      pausedAt: 0,
      quote: { id: "quote-1", expiresAt: "2999-01-01T00:00:00.000Z" },
      stages: [{ status: "paused", input: { generator: "video" } }],
    } as unknown as ChainEntry["chain"];
    const approve = vi.fn(async () => ({ chain }));
    const refusals: string[] = [];
    const controller = chainController({
      client: {
        approve,
        read: async () => ({ chain }),
      } as unknown as ChainClient,
      dispatch: (action: ChainAction) => {
        if (action.type === "refused") refusals.push(action.code);
      },
      canSend: () => true,
      schedule: () => () => {},
    });
    return { send: () => controller.approve({ chain }), approve, refusals };
  }

  it("holds Generate and Approve until the server is read again, then shows what it holds", async () => {
    // Cloud is shown; the person picks Local; the server refuses it. The
    // lane's read of the server has not answered yet.
    let answerRead!: (value: RunLocationState) => void;
    resetSettingsForTests({
      "run-location": () => new Promise((resolve) => (answerRead = resolve)),
      workflow: unanswered,
    });
    let view: Partial<SettingView<RunLocationState>> = {};
    const control = settingSaver("run-location", (next) => {
      view = { ...view, ...next };
    });
    await control.read(Promise.resolve(location("cloud", 1)));
    const chain = pausedChain();
    const saving = control.save(location("local"), () =>
      Promise.reject(new SettingRefused("No.")),
    );
    await new Promise((resolve) => setImmediate(resolve));
    // The control still shows Local while paid writes would name Cloud:
    // nothing may be sent.
    expect(view.value?.location).toBe("local");
    expect(expectedHeaders()).toEqual({ "Genobi-Run-Location": "cloud" });
    expect(settingsHold()).toBe("checking");
    await chain.send();
    expect(chain.refusals).toEqual([SETTINGS_HELD]);
    expect(chain.approve).not.toHaveBeenCalled();
    // The server answers Cloud: the control shows it, and both are free.
    answerRead(location("cloud", 1));
    await saving;
    expect(view).toMatchObject({
      value: { location: "cloud" },
      confirmed: true,
      message: "No.",
    });
    expect(useSettingsStore.getState().location).toBe("cloud");
    expect(settingsHold()).toBeNull();
    await chain.send();
    expect(chain.approve).toHaveBeenCalledTimes(1);
  });

  it("stays held when that read fails too, until a later read answers", async () => {
    const control = settingSaver("run-location", () => {});
    await control.read(Promise.resolve(location("cloud", 1)));
    await control.save(location("local"), () =>
      Promise.reject(new SettingUnconfirmed("lost")),
    );
    expect(settingsHold()).toBe("checking");
    // Opening the dialog again reads the server: the hold is released.
    await settingSaver("run-location", () => {}).read(
      Promise.resolve(location("local", 2)),
    );
    expect(settingsHold()).toBeNull();
    expect(expectedHeaders()).toEqual({ "Genobi-Run-Location": "local" });
  });
});
