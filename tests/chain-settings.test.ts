import { afterEach, describe, expect, it } from "vitest";
import type { RunLocationState } from "../shared/comfy/run-location";
import type { WorkflowCatalogue } from "../shared/comfy/workflows";
import type { WorkflowClient } from "../shared/comfy/workflow";
import type { GenerateInput } from "../shared/types";
import { LocalComfyWorkflows } from "../server/comfy-local";
import { WorkflowDestinations } from "../server/workflow-destinations";
import { chainClient, chainController } from "../src/chain-client";
import {
  chainsReducer,
  emptyChains,
  type ChainAction,
  type ChainsState,
} from "../src/chain-state";
import { SETTINGS_HELD } from "../src/chain-client";
import {
  readSetting,
  resetSettingsForTests,
  settingSaver,
  settingsHold,
  useSettingsStore,
} from "../src/settings-store";
import { fakeComfy, type FakeComfy } from "./fake-comfyui";
import { input, setup } from "./server-harness";

// A paused chain stage is approved with the template this tab shows. When
// another tab swaps it and this tab's quote is refreshed for the new graph,
// the approval is refused rather than running a graph the picker never showed.
// The server validates it; the harness input omits fields it defaults.
const acoustic = {
  ...input,
  model: "ltx-2.5-akuspace",
  duration: 6,
  acoustic: { mode: "room", preset: "empty_club", level: "high" },
} as unknown as GenerateInput;

let fake: FakeComfy | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
  resetSettingsForTests();
  useSettingsStore.setState({
    location: undefined,
    workflows: {},
    restoring: false,
    held: {},
  });
});

async function studio() {
  fake = await fakeComfy({ nodes: {} });
  /** The templates the cloud was asked to run, in order. Never charged. */
  const ran: string[] = [];
  const cloud: WorkflowClient = {
    run: async (template) => {
      ran.push(template.id);
      return `https://cloud.comfy.org/api/v2/jobs/cloud-${ran.length}`;
    },
    poll: async () => ({ id: "cloud-1", status: "Generating" }),
    download: async () => new Response(),
  };
  const local = new LocalComfyWorkflows({ url: fake.url });
  const app = await setup(undefined, new WorkflowDestinations(cloud, local), {
    destination: { kind: "cloud" },
    local,
  });
  /** Another tab of the same session: same cookie, its own requests. */
  const send = (route: string, body?: unknown) =>
    fetch(`${app.base}${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { cookie: app.cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  /** This tab's settings controls: what it shows is what it last read. */
  const showSettings = async () => {
    await readSetting(
      "run-location",
      async () =>
        (await (
          await send("/api/settings/run-location")
        ).json()) as RunLocationState,
    );
    await readSetting(
      "workflow",
      async () =>
        (await (
          await send("/api/settings/workflows")
        ).json()) as WorkflowCatalogue,
    );
  };
  let state: ChainsState = emptyChains;
  /** The headers of every approval this tab sent. */
  const approvals: Record<string, string>[] = [];
  const controller = chainController({
    client: chainClient(
      (path, init) => {
        const headers = init?.headers as Record<string, string>;
        if (path.endsWith("/approve")) approvals.push(headers);
        return fetch(`${app.base}${path}`, {
          ...init,
          headers: { ...headers, cookie: app.cookie },
        });
      },
      () => "comfyui-test-key-0012",
    ),
    dispatch: (action: ChainAction) => {
      state = chainsReducer(state, action);
    },
    canSend: () => true,
    schedule: () => () => {},
  });
  const entry = (id: string) => state.entries[id];
  return { ...app, send, showSettings, controller, entry, ran, approvals };
}

describe("approving a paused stage after a template swap in another tab", () => {
  it("is refused with settings_changed and runs nothing, until this tab shows the swap", async () => {
    const { send, showSettings, controller, entry, ran, store } =
      await studio();
    await showSettings();
    expect(useSettingsStore.getState().workflows["ltx-2-5-akuspace"]).toBe(
      "ltx-2-5-akuspace-t2v",
    );
    const chain = await controller.start(
      { stages: [{ input: acoustic }] },
      { origin: "studio" },
    );
    expect(chain.quote?.recipe).toMatchObject({
      workflow: "ltx-2-5-akuspace-t2v",
    });

    // The other tab swaps the template behind the same model.
    const swapped = await send("/api/settings/workflows/selection", {
      entry: "ltx-2-5-akuspace",
      template: "ltx-2-5-t2v",
    });
    expect(swapped.status).toBe(200);
    // This tab refreshes the pause: the server quotes the swapped graph,
    // while this tab's picker still shows the LoRA template.
    await controller.read(chain.id);
    expect(entry(chain.id).chain.quote?.recipe).toMatchObject({
      workflow: "ltx-2-5-t2v",
    });

    await controller.approve(entry(chain.id));
    expect(entry(chain.id).refusal?.code).toBe("settings_changed");
    expect(ran).toEqual([]);
    expect(store.data.jobs).toHaveLength(0);
    expect(entry(chain.id).chain.status).toBe("paused");

    // Once this tab shows the swap, the same pause approves the graph shown.
    await showSettings();
    await controller.approve(entry(chain.id));
    expect(entry(chain.id).refusal).toBeUndefined();
    expect(ran).toEqual(["ltx-2-5-t2v"]);
  });
});

describe("approving while a run location save is still open", () => {
  it("is refused and sends nothing until the save is confirmed", async () => {
    const { send, showSettings, controller, entry, ran, approvals } =
      await studio();
    await showSettings();
    const chain = await controller.start(
      { stages: [{ input: acoustic }] },
      { origin: "studio" },
    );
    expect(chain.quote?.recipe).toMatchObject({ location: "cloud" });

    // The person chooses Local; the save has not answered yet.
    const shown = (await (
      await send("/api/settings/run-location")
    ).json()) as RunLocationState;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const saving = settingSaver("run-location", () => {}).save(
      { ...shown, location: "local" },
      async () => {
        await gate;
        return (await (
          await send("/api/settings/run-location", { location: "local" })
        ).json()) as RunLocationState;
      },
    );
    expect(settingsHold()).toBe("saving");
    await controller.approve(entry(chain.id));
    expect(entry(chain.id).refusal?.code).toBe(SETTINGS_HELD);
    expect(approvals).toEqual([]);
    expect(ran).toEqual([]);

    // Confirmed: the pause is quoted again for Local, and approving sends
    // what the studio now shows.
    release();
    await saving;
    expect(settingsHold()).toBeNull();
    await controller.read(entry(chain.id).chain.id);
    expect(entry(chain.id).chain.quote?.recipe).toMatchObject({
      location: "local",
    });
    await controller.approve(entry(chain.id));
    expect(approvals).toHaveLength(1);
    expect(approvals[0]["Genobi-Run-Location"]).toBe("local");
    expect(ran).toEqual([]);
  });
});
