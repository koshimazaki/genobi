// Picks and context (issue #23) end to end: the studio's picks and composer
// settings, the start request that carries them, and a session started on
// the fake runner whose prompt and brief carry the resolved ids.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentContext } from "../shared/agent-context";
import type { Project } from "../shared/director/types";
import type { Job } from "../shared/types";
import { startAgentSession } from "../src/agent/api";
import {
  assetPick,
  composerSettings,
  followDirectorPicks,
  notePick,
  noteSettings,
  resetStudioContext,
  studioContext,
  takePick,
} from "../src/agent/studio-context";
import { useSettingsStore } from "../src/settings-store";
import { createStudioStore } from "../src/studio/store";
import { initialComposer } from "../src/useComposer";
import { agentStudio } from "./agent-harness";
import { base } from "./house-template-fixtures";
import { input } from "./server-harness";

afterEach(() => {
  resetStudioContext();
  useSettingsStore.setState({ location: undefined });
  vi.unstubAllGlobals();
});

const job = (id: string, description: string, extra: Partial<Job> = {}) =>
  ({ id, description, generator: "video", ...extra }) as Job;

describe("the studio's picks and settings", () => {
  it("records gallery takes and Director assets newest first", () => {
    const store = createStudioStore();
    const bundle = base();
    store.getState().actions.initialize(bundle);
    const stop = followDirectorPicks(store);
    notePick(takePick(job("run-1", "Penguin on ice")));
    store.getState().actions.workspace({ assetSelection: "audio" });
    notePick(takePick(job("run-2", "Harbour", { generator: "image" })));
    notePick(takePick(job("run-1", "Penguin on ice")));
    stop();
    store.getState().actions.workspace({ assetSelection: "video" });
    expect(studioContext()?.picks).toEqual([
      { kind: "take", id: "run-1", media: "video", name: "Penguin on ice" },
      { kind: "take", id: "run-2", media: "image", name: "Harbour" },
      {
        kind: "asset",
        id: "audio",
        media: "audio",
        name: "pulse.wav",
        projectId: "signal-studies",
      },
    ]);
  });

  it("records each explicit selection, the same asset again included", () => {
    const store = createStudioStore();
    store.getState().actions.initialize(base());
    const stop = followDirectorPicks(store);
    const { workspace, settings } = store.getState().actions;
    workspace({ assetSelection: "audio" }); // A
    notePick(takePick(job("run-b", "Take B"))); // B
    workspace({ assetSelection: "audio" }); // A again, still the selection
    expect(studioContext()?.picks.map((p) => p.id)).toEqual(["audio", "run-b"]);
    // Unrelated updates record nothing.
    notePick(takePick(job("run-c", "Take C")));
    workspace({ drawerOpen: true });
    settings({ zoom: 120 });
    expect(studioContext()?.picks.map((p) => p.id)).toEqual([
      "run-c",
      "audio",
      "run-b",
    ]);
    stop();
    workspace({ assetSelection: "video" });
    expect(studioContext()?.picks[0].id).toBe("run-c");
  });

  it("names an asset by its file name only, and ignores an unknown one", () => {
    const project = base().project as Project;
    expect(assetPick(project, "moodboard")?.name).toBe("palette.svg");
    expect(assetPick(project, "missing")).toBeUndefined();
    expect(assetPick(undefined, "audio")).toBeUndefined();
  });

  it("sends the composer's settings with the run location, and no prompt text", () => {
    const settings = composerSettings({
      ...initialComposer,
      generator: "video",
      model: "ltx-2.5",
      duration: 6,
      description: "a private prompt",
      slots: { scene: "wet street", character: "", action: "", audio: "" },
    });
    expect(settings).toMatchObject({
      generator: "video",
      model: "ltx-2.5",
      duration: 6,
      gaps: { scene: "wet street" },
    });
    // The composer's hook publishes this as it changes.
    noteSettings(settings);
    useSettingsStore.setState({ location: "local" });
    const context = studioContext();
    expect(context?.picks).toEqual([]);
    expect(context?.settings).toMatchObject({
      model: "ltx-2.5",
      runLocation: "local",
    });
    expect(JSON.stringify(context)).not.toContain("private prompt");
  });

  it("starts a session with the context, and none when there is nothing", async () => {
    const sent: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ id: "s" }), { status: 201 });
      }),
    );
    await startAgentSession({ prompt: "Hi", source: "typed" });
    notePick(takePick(job("run-1", "Penguin")));
    useSettingsStore.setState({ location: "cloud" });
    await startAgentSession({ prompt: "Use my last pick", source: "voice" });
    expect(sent[0]).toEqual({ prompt: "Hi", source: "typed" });
    expect(sent[1]).toEqual({
      prompt: "Use my last pick",
      source: "voice",
      context: {
        picks: [{ kind: "take", id: "run-1", media: "video", name: "Penguin" }],
      },
    });
  });
});

describe("a session started with the context", () => {
  it("hands the runner the resolved prompt and the block in its brief", async () => {
    const studio = await agentStudio();
    const cookie = await studio.fresh();
    // A take of the person's own; "run-0" is nobody's, so it is dropped.
    const made = await fetch(`${studio.base}/api/jobs`, {
      method: "POST",
      headers: {
        cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ ...input, description: "Penguin" }),
    });
    const run1 = (await made.json()).job.id as string;
    const context: AgentContext = {
      picks: [
        { kind: "take", id: run1, media: "video", name: "Penguin" },
        {
          kind: "asset",
          id: "audio",
          media: "audio",
          name: "pulse.wav",
          projectId: "signal-studies",
        },
        { kind: "take", id: "run-0", media: "image", name: "Old" },
      ],
      settings: { generator: "video", model: "flux-3", duration: 5 },
    };
    const started = await studio.start(
      cookie,
      "echo: cut my last two picks with these settings",
      { context },
    );
    expect(started.status).toBe(201);
    // The session shows what the person said, not the expanded prompt.
    expect(started.body.prompt).toBe(
      "echo: cut my last two picks with these settings",
    );
    const done = await studio.settle(cookie, started.body.id);
    // No project is linked, so the asset pick is left out, with a note.
    expect(done.lines).toContain(
      `prompt echo: cut my last two picks [take ${run1} “Penguin” (video); only 1 pick in the studio] with these settings [flux-3 video, 5 s]`,
    );
    expect(done.lines).toContain(
      `context picks=${run1} settings=flux-3 note=1 pick from another project was left out; open that project to use it.`,
    );
  });

  it("starts without a block when no context came, and refuses a bad one", async () => {
    const studio = await agentStudio();
    const cookie = await studio.fresh();
    const plain = await studio.start(cookie, "echo: my last pick");
    const done = await studio.settle(cookie, plain.body.id);
    expect(done.lines).toContain("prompt echo: my last pick");
    expect(done.lines).toContain("context none");
    const bad = await studio.start(cookie, "echo", {
      context: { picks: [{ kind: "take", id: "a/b", media: "video" }] },
    });
    expect(bad).toMatchObject({ status: 400, body: { code: "agent_request" } });
  });
});
