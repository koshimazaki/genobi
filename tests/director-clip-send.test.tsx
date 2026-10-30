// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import studio from "../docs/director-bundle/example/studio.json";
import type { AgentSession } from "../shared/agent-session";
import type { Project } from "../shared/director/types";

// The clip inspector's Send to Genobi: beside the CLIP INSPECTOR heading,
// it commits the Prompt field (the press takes its focus) and hands that
// clip's direction to the agent through Regenerate's Send. It never quotes
// or submits a generation; the line under the field says when it was sent.

const SESSION: AgentSession = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "hermes",
  status: "running",
  prompt: "Regenerate",
  startedAt: "2026-10-29T12:00:00.000Z",
  lines: [],
};
const sent = vi.hoisted(() => [] as string[]);
const studioCopy = vi.hoisted(() => ({ kept: true }));
vi.mock("../src/director/regenerate", async (original) => ({
  ...(await original<typeof import("../src/director/regenerate")>()),
  regenerate: vi.fn(async (instruction: string) => {
    sent.push(instruction);
    return { kind: "sent", session: SESSION, turn: "new" };
  }),
}));
vi.mock("../src/director/project-copy", async (original) => ({
  ...(await original<typeof import("../src/director/project-copy")>()),
  copyAvailable: async () => studioCopy.kept,
}));
vi.mock("../src/agent/api", async (original) => ({
  ...(await original<typeof import("../src/agent/api")>()),
  agentStatus: async () => ({ available: true, runner: "hermes" }),
}));

const { default: Inspector } = await import("../src/director/Inspector");
const { studioStore } = await import("../src/studio/store");
const { resetClipSends } = await import("../src/director/clip-send-store");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const original = studioStore.getState();
const requests: string[] = [];
let root: Root | null = null;
let project: Project;

beforeEach(() => {
  project = structuredClone(studio) as unknown as Project;
  studioStore.setState({
    director: {
      bundle: { project, files: new Map() },
      history: [],
      drafts: {},
    },
  });
  sent.length = 0;
  studioCopy.kept = true;
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(String(url));
      return new Response("{}", { status: 404 });
    }),
  );
});
let leaving = false;
afterEach(() => {
  leaving = true;
  act(() => root?.unmount());
  leaving = false;
  root = null;
  document.body.replaceChildren();
  studioStore.setState(original, true);
  resetClipSends();
  vi.unstubAllGlobals();
});

/** The Prompt field's command, as the Editor runs it: into the store. */
function command(value: unknown) {
  const { layerId, text } = value as { layerId: string; text: string };
  project = {
    ...project,
    layers: project.layers.map((l) =>
      l.id === layerId ? { ...l, prompt: text || undefined } : l,
    ),
  };
  studioStore.setState({
    director: {
      bundle: { project, files: new Map() },
      history: [],
      drafts: {},
    },
  });
  if (!leaving) show(layerId);
  return "";
}
function show(id: string) {
  if (!root) {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  const node = (
    <Inspector
      project={project}
      layer={project.layers.find((l) => l.id === id)}
      close={() => {}}
      edit={() => {}}
      duplicate={() => {}}
      remove={() => {}}
      reorder={() => {}}
      replace={() => {}}
      command={command}
      disabled={false}
    />
  );
  act(() => root!.render(node));
}
const area = () => document.querySelector("textarea")!;
function type(text: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(area(), text);
    area().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const send = () =>
  document.querySelector<HTMLButtonElement>("header .dir-clip-send")!;
/** A press: the field loses focus (committing), then the click. */
async function press() {
  act(() =>
    area().dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  await act(async () => {
    send().click();
  });
}
const text = (selector: string) =>
  [...document.querySelectorAll(selector)].map((n) => n.textContent);

describe("the clip inspector's Send to Genobi", () => {
  it("sits beside the CLIP INSPECTOR heading and names no agent", async () => {
    show("pulse");
    await act(async () => {});
    const header = document.querySelector(".dir-inspector header")!;
    expect(header.children[0].textContent).toBe("CLIP INSPECTOR");
    expect(header.children[1]).toBe(send());
    expect(send().textContent).toBe("Send to Genobi");
    expect(send().className).toContain("dir-primary dir-agent-action");
    // The runner is named only in the tooltip.
    expect(send().title).toMatch(/Genobi \(Hermes\)$/);
  });

  it("asks for the clip's prompt first, and sends nothing", async () => {
    show("pulse");
    await press();
    expect(sent).toEqual([]);
    expect(text('[role="alert"]')).toContain(
      "Write this clip's prompt first, then send it to Genobi.",
    );
  });

  it("commits the field, then sends this clip's words, and shows when", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 29, 14, 5));
    show("pulse");
    type("Rings pulse on every beat");
    await press();
    vi.useRealTimers();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('clip pulse "p5 rings"');
    expect(sent[0]).toMatch(/Its prompt:\nRings pulse on every beat$/);
    expect(text('[role="status"]')).toContain("Sent to Genobi · 14:05");
    // Still editable; once committed, the line says the words changed.
    expect(area().disabled).toBe(false);
    type("Rings pulse on every other beat");
    act(() =>
      area().dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
    );
    expect(text('[role="status"]')).toContain(
      "Sent to Genobi · 14:05 · edited since",
    );
    // Sending again sends the new words.
    await press();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatch(/every other beat$/);
    expect(text('[role="status"]').join()).not.toContain("edited since");
  });

  it("never asks for a quote or a generation", async () => {
    show("pulse");
    type("Slower rings");
    await press();
    expect(sent).toHaveLength(1);
    expect(
      requests.filter((url) => /jobs|quote|generat|submit/i.test(url)),
    ).toEqual([]);
  });

  it("says to unlock a locked clip with no prompt, and sends one with words", async () => {
    // "labels" is locked in the example: its Prompt is read-only.
    show("labels");
    expect(area().matches(":disabled")).toBe(true);
    await press();
    expect(sent).toEqual([]);
    expect(text('[role="alert"]')).toContain(
      "Unlock this clip to write its prompt, then send it to Genobi.",
    );
    command({ layerId: "labels", text: "Bars hold their height" });
    await press();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/Its prompt:\nBars hold their height$/);
  });

  it("shows why Send is off on a studio that keeps no project copy", async () => {
    studioCopy.kept = false;
    show("pulse");
    await act(async () => {});
    expect(send().disabled).toBe(true);
    expect(text('[role="status"]')).toContain(
      "This studio keeps no project copy, so an agent could not read your edits. Regenerate needs the local studio (npm run dev).",
    );
  });
});
