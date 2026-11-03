// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GenerateVersionAction from "../src/director/GenerateVersionAction";
import { studioStore } from "../src/studio/store";
import { versionCharacter, versionMix } from "./director-version-fixtures";
import { readBrief, writeBrief } from "../src/director/prompt-brief";
import type { Bundle } from "../src/director/bundle";

const state = vi.hoisted(() => ({
  preset: "director",
  select: vi.fn(),
}));
vi.mock("../src/studio/ShellContext", () => ({
  useShell: () => ({ preset: state.preset, select: state.select }),
}));
vi.mock("../src/director/MediaTile", () => ({
  default: () => <span>Media preview</span>,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const unmount: (() => void)[] = [];
beforeEach(() => {
  state.preset = "director";
  state.select.mockReset();
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
async function mount(bundle: Bundle, press = true, request = 0) {
  studioStore.setState({
    director: { ...studioStore.getState().director, bundle },
    operations: { workingFile: false, playing: false, rendering: false },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (nextRequest = request) =>
    root.render(
      <GenerateVersionAction disabled={false} request={nextRequest} />,
    );
  await act(async () => {
    render();
  });
  unmount.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  // The panel opens only on its button: Director opens on the timeline.
  if (press) act(() => trigger().click());
  return {
    host,
    render: (nextRequest = request) => act(() => render(nextRequest)),
  };
}
const trigger = () =>
  document.querySelector<HTMLButtonElement>(".dir-generate-version")!;
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(label),
  )!;

it("opens a swap-only panel: no generation choices, plan, agent or HTTP", async () => {
  await mount(await versionMix());
  const dialog = document.querySelector("dialog");
  expect(dialog?.open).toBe(true);
  expect(dialog?.getAttribute("aria-label")).toBe("Make my version");
  expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  const text = document.body.textContent ?? "";
  for (const gone of [
    "Generate replacement",
    "Review generation plan",
    "Prepare with Genobi",
    "Generation plan",
    "Replace slot IDs",
  ])
    expect(text).not.toContain(gone);
  expect(button("Generate my version")).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});

it("allows an undoable asset swap without starting anything", async () => {
  const bundle = await versionMix();
  await mount(bundle);
  await act(async () => {
    button("Apply swaps").click();
    // Failed polls must not format the bundle's megabytes of media bytes:
    // that synchronous work can delay the validation/commit we are awaiting.
    await vi.waitFor(() =>
      expect(studioStore.getState().director.bundle === bundle).toBe(false),
    );
  });
  expect(document.body.textContent).toContain("Nothing was generated");
  expect(studioStore.getState().director.bundle).not.toBe(bundle);
  expect(fetch).not.toHaveBeenCalled();
});

it("applies Words, closes on continue editing and undoes cleanly", async () => {
  const bundle = await versionMix();
  await mount(bundle);
  const title = document.querySelectorAll<HTMLInputElement>(
    ".dir-version-words input",
  )[1];
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(title, "MY REMIX");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    button("Apply swaps and continue editing").click();
    await vi.waitFor(
      () =>
        expect(studioStore.getState().director.bundle === bundle).toBe(false),
      { timeout: 5000 },
    );
  });
  expect(document.querySelector("dialog")).toBeNull();
  expect(
    studioStore.getState().director.bundle?.project.template?.inputs.title,
  ).toBe("MY REMIX");
  expect(fetch).not.toHaveBeenCalled();
  act(() => studioStore.getState().actions.undo());
  expect(
    studioStore.getState().director.bundle?.project.template?.inputs.title,
  ).toBe(bundle.project.template?.inputs.title);
});

it("offers Create in Camera per video slot: it only navigates and closes the panel", async () => {
  const bundle = await versionMix();
  await mount(bundle);
  const create = button("Create in Camera");
  expect(create).toBeDefined();
  act(() => create.click());
  expect(state.select).toHaveBeenCalledWith("camera");
  expect(document.querySelector("dialog")).toBeNull();
  expect(studioStore.getState().director.bundle).toBe(bundle);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps the advanced brief collapsed by default and preserves it when applied", async () => {
  const original = await versionCharacter();
  const brief = readBrief(original);
  const text =
    "Keep the original camera; make the room breathe to the bass. [Image 1]";
  const bundle = writeBrief(original, { ...brief, text });
  await mount(bundle);
  const advanced = document.querySelector<HTMLDetailsElement>(
    ".dir-version-advanced",
  )!;
  const field = document.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="Make it yours description"]',
  )!;
  expect(advanced.open).toBe(false);
  act(() => advanced.querySelector("summary")!.click());
  expect(advanced.open).toBe(true);
  expect(field.value).toBe(text);
  act(() => advanced.querySelector("summary")!.click());
  expect(advanced.open).toBe(false);
  expect(field.value).toBe(text);
  await act(async () => {
    button("Apply swaps").click();
    await vi.waitFor(() =>
      expect(studioStore.getState().director.bundle).not.toBe(bundle),
    );
  });
  expect(readBrief(studioStore.getState().director.bundle!).text).toBe(text);
  expect(fetch).not.toHaveBeenCalled();
});

it("never opens by itself: Director opens on the timeline until the button is pressed", async () => {
  state.preset = "gallery";
  const mounted = await mount(await versionCharacter(), false);
  expect(document.querySelector("dialog")).toBeNull();
  state.preset = "director";
  mounted.render();
  expect(document.querySelector("dialog")).toBeNull();
  const next = await versionMix();
  act(() =>
    studioStore.setState({
      director: { ...studioStore.getState().director, bundle: next },
    }),
  );
  expect(document.querySelector("dialog")).toBeNull();
  act(() => trigger().click());
  expect(document.querySelector("dialog")?.open).toBe(true);
  act(() => button("Close").click());
  expect(document.querySelector("dialog")).toBeNull();
});

it("opens Make my version only on request in Editor and Director", async () => {
  state.preset = "editor";
  const mounted = await mount(await versionCharacter(), false);
  expect(document.querySelector("dialog")).toBeNull();
  act(() => button("Make my version").click());
  expect(document.querySelector("dialog")).not.toBeNull();
  act(() => button("Close").click());
  // Moving to Director keeps the timeline in front: no panel reopens.
  state.preset = "director";
  mounted.render();
  expect(document.querySelector("dialog")).toBeNull();
});

it("ignores a stale request on mount but opens for a new explicit request", async () => {
  const mounted = await mount(await versionCharacter(), false, 7);
  expect(document.querySelector("dialog")).toBeNull();
  mounted.render(8);
  expect(document.querySelector("dialog")?.open).toBe(true);
});

it("closes the swap dialog when a different project is opened", async () => {
  await mount(await versionCharacter());
  expect(document.querySelector("dialog")?.open).toBe(true);
  const next = await versionMix();
  act(() => {
    studioStore.setState({
      director: { ...studioStore.getState().director, bundle: next },
    });
  });
  expect(document.querySelector("dialog")).toBeNull();
});

it("keeps Make it yours description and character/style bindings when applied", async () => {
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
  await act(async () => {
    button("Apply swaps").click();
    await vi.waitFor(() =>
      expect(studioStore.getState().director.bundle).not.toBe(bundle),
    );
  });
  const saved = readBrief(studioStore.getState().director.bundle!);
  expect(saved.text).toBe(text);
  expect(saved.references).toEqual(brief.references);
  expect(fetch).not.toHaveBeenCalled();
});
