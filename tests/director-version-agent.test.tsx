// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { File as NodeFile } from "node:buffer";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GenerateVersionAction from "../src/director/GenerateVersionAction";
import { studioStore } from "../src/studio/store";
import { buildMixBundle } from "../src/director/mix-template";
import { findMixTemplate } from "../shared/templates/catalogue";
import type { HouseTemplate } from "../shared/templates/types";
import type { Bundle } from "../src/director/bundle";
import { versionAgentPrompt } from "../shared/templates/version-agent";
import { AGENT_NO_COPY, AGENT_SETUP_HINT } from "../src/director/version-agent";
import { versionBase, versionMix } from "./director-version-fixtures";
import { fillPrompt, promptById } from "../src/voice/prompt-target";
import {
  setVoiceDestination,
  voiceRouting,
} from "../src/voice/destination-store";

const state = vi.hoisted(() => ({
  agent: {
    copy: true as boolean | undefined,
    working: false,
    label: { button: "Send to Genobi" } as {
      button: string;
      hint?: string;
      runner?: string;
    },
  },
  spawn: vi.fn(),
  save: vi.fn(),
}));
vi.mock("../src/studio/ShellContext", () => ({
  useShell: () => ({ preset: "director", select: vi.fn() }),
}));
vi.mock("../src/director/MediaTile", () => ({
  default: () => <span>Media preview</span>,
}));
vi.mock("../src/voice/VoiceButton", () => ({
  default: () => <button type="button">Voice</button>,
}));
vi.mock("../src/director/useAgentSend", () => ({
  useAgentSend: () => state.agent,
}));
vi.mock("../src/agent/spawn-store", async (original) => ({
  ...(await original<object>()),
  spawnFromStudio: state.spawn,
}));
vi.mock("../src/director/leave-guard", async (original) => ({
  ...(await original<object>()),
  saveCopies: state.save,
}));
vi.setConfig({ testTimeout: 30_000 });
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const fruits = findMixTemplate("fruits-swap") as HouseTemplate;
const fruitsBundle = () =>
  buildMixBundle(
    fruits,
    versionBase(),
    Object.fromEntries(
      Object.entries(fruits.mix!.media).map(([id, m]) => [
        id,
        new Uint8Array(readFileSync(`public${m.url}`)),
      ]),
    ),
  );

const unmount: (() => void)[] = [];
beforeEach(() => {
  state.agent.copy = true;
  state.agent.working = false;
  state.agent.label = { button: "Send to Genobi", runner: "Claude Code" };
  state.spawn.mockReset().mockResolvedValue({ id: "s1", runner: "claude" });
  state.save.mockReset().mockResolvedValue(true);
  vi.stubGlobal("File", NodeFile);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn().mockResolvedValue({ width: 256, height: 256, close: vi.fn() }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No paid or remote call");
    }),
  );
  URL.createObjectURL = vi.fn(() => "blob:fixture");
  URL.revokeObjectURL = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  for (const close of unmount.splice(0)) close();
  vi.unstubAllGlobals();
});

async function mount(bundle: Bundle) {
  studioStore.setState({
    director: { bundle, history: [], drafts: {} },
    operations: { workingFile: false, playing: false, rendering: false },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<GenerateVersionAction disabled={false} />);
  });
  unmount.push(() => {
    act(() => root.unmount());
    host.remove();
  });
}
const section = () =>
  document.querySelector<HTMLElement>('[aria-label="Make it with the agent"]');
const startButton = () =>
  [...section()!.querySelectorAll("button")].find(
    (b) => b.textContent === "Make it with the agent",
  )!;
function drop(target: Element, files: File[]) {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { files, types: ["Files"], getData: () => "" },
  });
  target.dispatchEvent(event);
}
function type(field: HTMLTextAreaElement, text: string) {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!.call(field, text);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}
const still = () =>
  new NodeFile(
    [new Uint8Array(readFileSync("tests/fixtures/reference.png"))],
    "my-pear.png",
    { type: "image/png" },
  ) as unknown as File;

async function dropStill() {
  act(() => drop(section()!.querySelector(".media-drop")!, [still()]));
  await vi.waitFor(
    async () => {
      await act(async () => {});
      expect(section()!.textContent).toContain("Yours · ");
    },
    { timeout: 15_000 },
  );
}

it("shows Make it with the agent for a mix template with a skill, and not for one without", async () => {
  await mount(await versionMix());
  expect(document.querySelector("dialog")?.open).toBe(true);
  expect(section()).toBeNull();
  for (const close of unmount.splice(0)) close();
  await mount(await fruitsBundle());
  expect(section()).not.toBeNull();
  const field = section()!.querySelector("textarea")!;
  expect(field.placeholder).toBe("Swap the apple with this");
  expect(section()!.textContent).toContain("With what?");
  expect(startButton().disabled).toBe(true);
  expect(field.id).toBe("version-with-what");
  // Create in Camera stays for people who want Camera.
  expect(document.body.textContent).toContain("Create in Camera");
});

it("imports the dropped file, commits it, then spawns once with the built prompt", async () => {
  const bundle = await fruitsBundle();
  await mount(bundle);
  await dropStill();
  act(() =>
    type(section()!.querySelector("textarea")!, "swap the apple with this"),
  );
  expect(state.spawn).not.toHaveBeenCalled();
  await act(async () => {
    startButton().click();
    await vi.waitFor(() => expect(state.spawn).toHaveBeenCalledTimes(1), {
      timeout: 15_000,
    });
  });
  const committed = studioStore.getState().director.bundle!;
  expect(committed).not.toBe(bundle);
  const [id, asset] = Object.entries(committed.project.assets).find(
    ([key]) => !bundle.project.assets[key],
  )!;
  expect(asset.use).toBe("reference");
  expect(state.save).toHaveBeenCalledBefore(state.spawn);
  expect(state.spawn).toHaveBeenCalledExactlyOnceWith({
    prompt: versionAgentPrompt(
      fruits,
      { id, name: asset.file.path.split("/").pop()!, kind: "image" },
      "swap the apple with this",
    ),
    source: "typed",
  });
  // Started: the panel closes so the Genobi log's approvals are reachable.
  expect(document.querySelector("dialog")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  // The import is one undoable edit.
  act(() => studioStore.getState().actions.undo());
  expect(studioStore.getState().director.bundle?.project.assets[id]).toBe(
    undefined,
  );
});

it("starts nothing when the project copy does not save", async () => {
  state.save.mockResolvedValue(false);
  await mount(await fruitsBundle());
  await dropStill();
  act(() => type(section()!.querySelector("textarea")!, "use this"));
  act(() => startButton().click());
  await vi.waitFor(
    async () => {
      await act(async () => {});
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "did not save",
      );
    },
    { timeout: 15_000 },
  );
  expect(state.spawn).not.toHaveBeenCalled();
});

it("without a runner set up keeps the button live with the setup hint; without a copy it is disabled with the reason", async () => {
  state.agent.label = { button: "Send to Genobi", hint: "none yet" };
  await mount(await fruitsBundle());
  expect(section()!.textContent).toContain(AGENT_SETUP_HINT);
  for (const close of unmount.splice(0)) close();
  state.agent.copy = false;
  await mount(await fruitsBundle());
  expect(section()!.textContent).toContain(AGENT_NO_COPY);
  expect(startButton().disabled).toBe(true);
  expect(section()!.querySelector("textarea")!.disabled).toBe(true);
});

it("starts from the sentence alone, typed, with no reference and no commit", async () => {
  const bundle = await fruitsBundle();
  await mount(bundle);
  act(() =>
    type(
      section()!.querySelector("textarea")!,
      "make a papaya instead of the apple",
    ),
  );
  expect(startButton().disabled).toBe(false);
  act(() => startButton().click());
  await vi.waitFor(
    async () => {
      await act(async () => {});
      expect(state.spawn).toHaveBeenCalledTimes(1);
    },
    { timeout: 15_000 },
  );
  expect(state.spawn).toHaveBeenCalledWith({
    prompt: versionAgentPrompt(
      fruits,
      undefined,
      "make a papaya instead of the apple",
    ),
    source: "typed",
  });
  expect(studioStore.getState().director.bundle).toBe(bundle);
});

it("is a voice destination: a dictated sentence starts the session as voice, and the mic aims at the field", async () => {
  setVoiceDestination("agent");
  await mount(await fruitsBundle());
  const field = section()!.querySelector("textarea")!;
  field.checkVisibility = () => true;
  expect(promptById("version-with-what")).toBe(field);
  act(() =>
    section()!
      .querySelector<HTMLButtonElement>(".dir-version-agent-mic button")!
      .click(),
  );
  expect(voiceRouting().destination).toBe("prompt:version-with-what");
  act(() => void fillPrompt("swap the apple with a papaya", field));
  expect(field.value).toBe("swap the apple with a papaya");
  act(() => startButton().click());
  await vi.waitFor(
    async () => {
      await act(async () => {});
      expect(state.spawn).toHaveBeenCalledTimes(1);
    },
    { timeout: 15_000 },
  );
  expect(state.spawn.mock.calls[0][0].source).toBe("voice");
  // Closing the panel gives the person's own routing back.
  for (const close of unmount.splice(0)) close();
  expect(voiceRouting().destination).toBe("agent");
});
