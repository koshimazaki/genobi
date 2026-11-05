// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import RunModeLine from "../src/components/RunModeLine";
import { useSettingsStore } from "../src/settings-store";
import { resetLocalCheckForTests } from "../src/local-check";
import type { RunLocationState } from "../shared/comfy/run-location";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const state = (port = 18188): RunLocationState => ({
  revision: 7,
  location: "local",
  mode: "box",
  label: "GPU box lab",
  source: "session",
  fixed: false,
  choices: ["box"],
  local: { reachable: false, version: null },
  note: "",
  box: { name: "lab", port, url: `http://127.0.0.1:${port}`, status: null },
});
const check = (reachable: boolean) =>
  Response.json({ local: { reachable, templates: {} } });
let root: Root;
let reachable: boolean;
let reads: number;
let nextCheck: Promise<Response> | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetLocalCheckForTests();
  reachable = false;
  reads = 0;
  nextCheck = undefined;
  useSettingsStore.setState({
    runLocation: state(),
    workflows: {},
    hosts: {},
    saving: {},
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/settings/run-location/box")
        return Response.json({ status: { reachable, idle: false } });
      if (url === "/api/settings/workflows?check=local") {
        reads++;
        return nextCheck ?? check(reachable);
      }
      throw new Error(`Unexpected read: ${url}`);
    }),
  );
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  useSettingsStore.setState({
    runLocation: undefined,
    workflows: {},
    hosts: {},
    saving: {},
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const mount = () =>
  act(async () => {
    root.render(
      <RunModeLine generator="image" model="flux-3-klein" keyKind={null} />,
    );
  });
const poll = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
const line = () => document.querySelector(".run-mode")!.textContent;

it("refreshes readiness when a tunnel connects and drops without a settings write", async () => {
  await mount();
  expect(line()).toContain("not answering");
  expect(reads).toBe(1);
  reachable = true;
  await poll();
  expect(reads).toBe(2);
  expect(line()).not.toContain("not answering");
  reachable = false;
  await poll();
  expect(reads).toBe(3);
  expect(line()).toContain("not answering");
  expect(useSettingsStore.getState().runLocation?.revision).toBe(7);
});

it("ignores an old ready answer after the live tunnel drops", async () => {
  await mount();
  let finish!: (value: Response) => void;
  nextCheck = new Promise((resolve) => {
    finish = resolve;
  });
  reachable = true;
  await poll();
  expect(reads).toBe(2);
  expect(line()).not.toContain("not answering");
  nextCheck = undefined;
  reachable = false;
  await poll();
  expect(reads).toBe(3);
  await act(async () => {
    finish(check(true));
  });
  expect(line()).toContain("not answering");
});

it("does not reuse the previous box's telemetry or readiness while switching ports", async () => {
  reachable = true;
  await mount();
  expect(line()).not.toContain("not answering");
  let finish!: (value: Response) => void;
  nextCheck = new Promise((resolve) => {
    finish = resolve;
  });
  reachable = false;
  await act(async () => {
    useSettingsStore.setState({ runLocation: state(28188) });
  });
  expect(line()).toContain("not answering");
  await act(async () => {
    finish(check(false));
  });
  expect(line()).toContain("not answering");
});
