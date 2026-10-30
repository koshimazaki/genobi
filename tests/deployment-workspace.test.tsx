// @vitest-environment jsdom
import { act, useReducer } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import ComposerWorkspace from "../src/components/ComposerWorkspace";
import {
  layoutComposer,
  useLayoutTake,
  type CapturedLayout,
} from "../src/layout-take";
import { useSettingsStore } from "../src/settings-store";
import {
  composerReducer,
  initialComposer,
  type ComposerState,
} from "../src/useComposer";
import { request } from "../src/useJobs";
import { HOSTED_RUN_LOCATION } from "../shared/comfy/run-location";

vi.mock("../src/useJobs", () => ({ request: vi.fn() }));
vi.mock("../src/hosted-studio", () => ({ useHostedStudio: () => false }));
vi.mock("../src/components/PromptInput", () => ({ default: () => null }));
vi.mock("../src/components/DeploymentPreset", () => ({ default: () => null }));

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  useLayoutTake.setState({ pending: undefined });
  useSettingsStore.setState({ runLocation: undefined });
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("keeps a capture pending when its attachment finishes after switching models, then attaches on return", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("No network"))),
  );
  const endpoint = "https://fixture.run.comfy.app";
  const captured: CapturedLayout = {
    id: "captured-scene",
    name: "My room",
    endpoint,
    recipe: JSON.stringify({ prompt: "My captured room" }),
    prompt: "My captured room",
    files: {
      TAKE_WEBM: new Blob(["colour"], { type: "video/webm" }),
      DEPTH_WEBM: new Blob(["depth"], { type: "video/webm" }),
      REFERENCE_PNG: new Blob(["first frame"], { type: "image/png" }),
      TRACK_AUDIO: new Blob(["track"], { type: "audio/wav" }),
    },
  };
  useLayoutTake.setState({ pending: captured });
  useSettingsStore.setState({
    runLocation: {
      ...HOSTED_RUN_LOCATION,
      fixed: false,
      deployment: { url: endpoint, name: "fixture" },
    },
  });
  let finishUpload!: (value: { id: string }) => void;
  vi.mocked(request)
    .mockImplementation(async (path) => ({
      id: `ticket-${path.split("/").at(-1)}`,
    }))
    .mockReturnValueOnce(new Promise((resolve) => (finishUpload = resolve)));
  const update = vi.fn();
  const onError = vi.fn();
  const onBusy = vi.fn();
  let composer!: ComposerState;
  let switchModel!: (model: ComposerState["model"]) => void;
  function Harness() {
    const [state, dispatch] = useReducer(composerReducer, {
      ...initialComposer,
      ...layoutComposer(captured),
    });
    composer = state;
    switchModel = (model) => dispatch({ type: "update", patch: { model } });
    return (
      <ComposerWorkspace
        state={state}
        update={(patch) => {
          update(patch);
          dispatch({ type: "update", patch });
        }}
        images={{
          add: vi.fn(),
          drop: vi.fn(),
          remove: vi.fn(),
          earlier: vi.fn(),
          assign: vi.fn(),
          loading: false,
          notice: "",
        }}
        sources={[]}
        sourceId=""
        apiKey=""
        refresh={async () => {}}
        onError={onError}
        onBusy={onBusy}
        onOpenCamera={() => {}}
        onOpenAcoustic={() => {}}
      />
    );
  }
  const host = document.createElement("div");
  root = createRoot(host);
  act(() => root!.render(<Harness />));
  const attach = () =>
    [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Attach captured scene",
    )!;
  act(() => attach().click());
  expect(request).toHaveBeenCalledOnce();
  expect(onBusy).toHaveBeenLastCalledWith(true);
  act(() => switchModel("ltx-2.5"));
  const switched = composer;
  expect(host.querySelector(".deployment-workspace")).toBeNull();
  await act(async () => finishUpload({ id: "old-take-ticket" }));
  expect(request).toHaveBeenCalledTimes(4);
  expect(update).not.toHaveBeenCalled();
  expect(composer).toBe(switched);
  expect(useLayoutTake.getState().pending).toBe(captured);
  expect(onError).toHaveBeenCalledExactlyOnceWith("");
  expect(onBusy).toHaveBeenLastCalledWith(false);

  act(() => switchModel("ltx-deploy-layout-to-video"));
  expect(attach().disabled).toBe(false);
  await act(async () => attach().click());
  const assets = Object.fromEntries(
    Object.keys(captured.files).map((token) => [token, `ticket-${token}`]),
  );
  expect(update).toHaveBeenCalledExactlyOnceWith({
    deploy: expect.objectContaining({ recipe: captured.recipe, assets }),
  });
  expect(composer.deploy?.assets).toEqual(assets);
  expect(useLayoutTake.getState().pending).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});
