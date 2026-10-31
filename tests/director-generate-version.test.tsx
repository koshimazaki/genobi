// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GenerateVersionAction from "../src/director/GenerateVersionAction";
import { studioStore } from "../src/studio/store";
import { versionCharacter, versionMix } from "./director-version-fixtures";
import { readBrief, writeBrief } from "../src/director/prompt-brief";
import { cleanInstruction } from "../shared/director/regenerate";
import type { Bundle } from "../src/director/bundle";

const state = vi.hoisted(() => ({
  copy: true as boolean | undefined,
  send: vi.fn(),
  preset: "director",
}));
vi.mock("../src/director/useAgentSend", () => ({
  useAgentSend: () => ({
    ...state,
    sending: false,
    working: false,
    setNote: vi.fn(),
  }),
}));
vi.mock("../src/studio/ShellContext", () => ({
  useShell: () => ({ preset: state.preset }),
}));
vi.mock("../src/director/MediaTile", () => ({
  default: () => <span>Media preview</span>,
}));
vi.mock("../src/director/feedback-file", () => ({ feedbackOf: () => ({}) }));
vi.mock("../shared/director/prompt-send", async (original) => ({
  ...(await original<object>()),
  promptsInstruction: () => ({ text: "My current direction and edits" }),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const unmount: (() => void)[] = [];
beforeEach(() => {
  state.copy = true;
  state.preset = "director";
  state.send.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No generation HTTP is allowed");
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
    director: { ...studioStore.getState().director, bundle },
    operations: { workingFile: false, playing: false, rendering: false },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = () => root.render(<GenerateVersionAction disabled={false} />);
  await act(async () => {
    render();
  });
  unmount.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, render: () => act(render) };
}
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(label),
  )!;

it("opens inputs when a template is selected and hands a finished mix to the agent without quoting or submitting", async () => {
  await mount(await versionMix());
  expect(document.querySelector("dialog")?.open).toBe(true);
  const choices = document.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  expect(choices.length).toBeGreaterThan(0);
  await act(async () => {
    if (!choices[0].checked) choices[0].click();
    button("Review generation plan").click();
  });
  expect(document.body.textContent).toContain("Generate replacement");
  await act(async () => {
    button("Prepare with Genobi").click();
    await vi.waitFor(() => expect(state.send).toHaveBeenCalledOnce());
  });
  expect(state.send).toHaveBeenCalledOnce();
  const message = state.send.mock.calls[0][0];
  expect(message).toContain("Generate a replacement");
  expect(message).toContain("Reuse current media");
  expect(cleanInstruction(message)).toBe(message);
  expect(message).toContain("brief/prompt.json");
  expect(message).toContain("wait for explicit approval");
  expect(message).toContain("never retry an uncertain submission");
  expect(fetch).not.toHaveBeenCalled();
  expect(document.querySelector("dialog")).toBeNull();
});

it("allows an undoable asset swap without starting an agent", async () => {
  const bundle = await versionMix();
  await mount(bundle);
  await act(async () => {
    button("Apply swaps only").click();
    await vi.waitFor(() =>
      expect(studioStore.getState().director.bundle).not.toBe(bundle),
    );
  });
  expect(document.body.textContent).toContain("Nothing was generated");
  expect(studioStore.getState().director.bundle).not.toBe(bundle);
  expect(state.send).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("offers a project ZIP handoff on hosted and never sends unavailable media", async () => {
  state.copy = false;
  await mount(await versionCharacter());
  act(() => button("Review generation plan").click());
  expect(button("Prepare with Genobi").disabled).toBe(true);
  expect(button("Save project ZIP")).toBeDefined();
  const link = document.querySelector<HTMLAnchorElement>(
    'a[href^="http://127.0.0.1:4317/director?"]',
  )!;
  expect(new URL(link.href).searchParams.get("example")).toBe(
    "character-piece",
  );
  expect(new URL(link.href).searchParams.get("workspace")).toBe("director");
  expect(document.body.textContent).toContain(
    "pairing alone does not transfer project media",
  );
  expect(state.send).not.toHaveBeenCalled();
});

it("keeps Gallery free of the template modal and does not reopen a dismissed panel on an edit", async () => {
  state.preset = "gallery";
  const mounted = await mount(await versionCharacter());
  expect(document.querySelector("dialog")).toBeNull();
  state.preset = "director";
  mounted.render();
  expect(document.querySelector("dialog")).not.toBeNull();
  act(() => button("Close").click());
  const old = studioStore.getState().director.bundle!;
  act(() =>
    studioStore.setState({
      director: {
        ...studioStore.getState().director,
        bundle: { ...old, project: { ...old.project, name: "My edit" } },
      },
    }),
  );
  expect(document.querySelector("dialog")).toBeNull();
  const next = await versionMix();
  act(() =>
    studioStore.setState({
      director: { ...studioStore.getState().director, bundle: next },
    }),
  );
  expect(document.querySelector("dialog")).not.toBeNull();
});

it("keeps Make it yours description and character/style bindings in the prepared project", async () => {
  const original = await versionCharacter();
  const brief = readBrief(original);
  const text = `Character: [${brief.references[0].label}]\nStyle: quiet watercolor, keep the red coat`;
  const bundle = writeBrief(original, { ...brief, text });
  await mount(bundle);
  expect(
    document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Make it yours description"]',
    )?.value,
  ).toBe(text);
  act(() => button("Review generation plan").click());
  await act(async () => {
    button("Prepare with Genobi").click();
    await vi.waitFor(() => expect(state.send).toHaveBeenCalledOnce());
  });
  const saved = readBrief(studioStore.getState().director.bundle!);
  expect(saved.text).toBe(text);
  expect(saved.references).toEqual(brief.references);
  expect(state.send.mock.calls[0][0]).toContain("quiet watercolor");
  expect(fetch).not.toHaveBeenCalled();
});
