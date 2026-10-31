// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  useBuilderSession,
  type BuilderSession,
} from "../src/world-builder/useBuilderSession";
import { useRecipeHandoff } from "../src/world-builder/useRecipeHandoff";
import { type Recipe } from "../src/world-builder/recipe";
import { decodeAudio } from "../src/world-builder/audio";
import { studioStore } from "../src/studio/store";
import { readWorldFiles } from "../src/director/world-files";
import type { Project } from "../shared/director/types";
import project from "../docs/director-bundle/example/studio.json";

const scene = vi.hoisted(() => ({
  edit: undefined as ((patch: Partial<Recipe>) => void) | undefined,
  world: {
    configure: vi.fn(),
    prepareCharacter: vi.fn(async () => () => {}),
    renderFrame: vi.fn(async () => document.createElement("canvas")),
    setMedia: vi.fn(async () => {}),
    clearMedia: vi.fn(),
    dispose: vi.fn(),
    editor: {
      mode: "shot",
      dragging: false,
      lockEdits: vi.fn(),
      holdEdits: vi.fn(() => vi.fn()),
    },
  },
}));
vi.mock("../src/world-builder/runtime", () => ({
  createWorld: (_: unknown, edit: typeof scene.edit) => {
    scene.edit = edit;
    return scene.world;
  },
}));
vi.mock("../src/world-builder/live-session", () => ({
  liveSession: () => ({
    dispose: vi.fn(),
    status: () => ({ recording: false }),
  }),
}));
vi.mock("../src/world-builder/useAudioHistory", () => ({
  useAudioHistory: () => ({ add: vi.fn(async () => ({ label: "Sound" })) }),
}));
vi.mock("../src/world-builder/example-track", () => ({
  useExampleTrack: () => null,
}));
vi.mock("../src/world-builder/audio", async (original) => ({
  ...(await original<typeof import("../src/world-builder/audio")>()),
  decodeAudio: vi.fn(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let session: BuilderSession;
let handoff: Record<string, unknown>;
let reports: Record<string, unknown>[];
const decoded = () => ({
  channels: [new Float32Array([0.1])],
  sampleRate: 24,
  envelope: [0.1],
  bands: { low: [0.1], mid: [0.1], high: [0.1] },
});
const bundle = (id = project.id) => ({
  project: { ...structuredClone(project), id } as unknown as Project,
  files: new Map<string, Uint8Array<ArrayBuffer>>(),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  scene.world.prepareCharacter.mockResolvedValue(() => {});
  scene.world.editor.dragging = false;
  vi.mocked(decodeAudio).mockResolvedValue(decoded());
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL() {
        return "blob:sound";
      }
      static revokeObjectURL() {}
    },
  );
  handoff = { state: "none" };
  reports = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        reports.push(JSON.parse(String(init.body)));
        return Response.json({});
      }
      return Response.json(handoff);
    }),
  );
  studioStore.setState({ director: { history: [], drafts: {} } });
  studioStore.getState().actions.initialize(bundle());
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function mount() {
  function Harness() {
    session = useBuilderSession();
    useRecipeHandoff(session, true);
    return <canvas ref={session.canvas} />;
  }
  await act(async () => root.render(<Harness />));
  expect(session.ready).toBe(true);
  return session.api.current!;
}
const tick = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
function queued(revision: string, take = false) {
  handoff = {
    state: "waiting",
    sequence: 1,
    expectedRevision: revision,
    recipe: { ...session.api.current!.getRecipe(), prompt: "Agent's scene" },
    take: take ? "falling-room" : null,
  };
}

it("advances the live guard through real human controls, viewport edits, textures and audio", async () => {
  const api = await mount();
  const tokens = [api.getRecipeRevision()];
  await act(async () => {
    await session.change({ prompt: "Human edit" });
  });
  tokens.push(api.getRecipeRevision());
  await act(async () => {
    scene.edit!({ orbit: 75 });
  });
  tokens.push(api.getRecipeRevision());
  await act(async () => {
    await api.setSurface(
      "screen/all",
      new Blob(["still"], { type: "image/png" }),
    );
  });
  tokens.push(api.getRecipeRevision());
  await act(async () => {
    await api.clearSurface("screen/all");
  });
  tokens.push(api.getRecipeRevision());
  await act(async () => {
    await api.setAudio(new Blob(["sound"]));
  });
  tokens.push(api.getRecipeRevision());
  expect(new Set(tokens).size).toBe(tokens.length);
  expect(new Set(tokens.map((value) => value.split(":")[0])).size).toBe(1);
  expect(api.getRecipe()).not.toHaveProperty("revision");
});

it("acknowledges an obsolete handoff as refused without changing the person's scene or saved recipe", async () => {
  const api = await mount();
  queued(api.getRecipeRevision());
  await act(async () => {
    await session.change({ prompt: "Keep my correction" });
  });
  const before = api.getRecipe();
  const revision = api.getRecipeRevision();
  await tick();
  expect(api.getRecipe()).toEqual(before);
  expect(api.getRecipeRevision()).toBe(revision);
  expect(reports).toEqual([
    expect.objectContaining({
      ok: false,
      expectedRevision: handoff.expectedRevision,
    }),
  ]);
  expect(reports[0].error).toMatch(/scene changed/);
  expect(
    readWorldFiles(studioStore.getState().director.bundle!).recipe,
  ).toBeUndefined();
});

it("applies a matching handoff once and keeps its ephemeral token out of saved files", async () => {
  const api = await mount();
  const revision = api.getRecipeRevision();
  queued(revision);
  await tick();
  expect(api.getRecipe().prompt).toBe("Agent's scene");
  expect(api.getRecipeRevision()).not.toBe(revision);
  expect(reports).toEqual([
    { sequence: 1, expectedRevision: revision, ok: true },
  ]);
  expect(
    readWorldFiles(studioStore.getState().director.bundle!).recipe,
  ).not.toHaveProperty("revision");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(reports).toHaveLength(1);
});

it("leaves another mounted tab's handoff waiting", async () => {
  const api = await mount();
  queued("00000000-0000-4000-8000-000000000001:0");
  const before = api.getRecipe();
  await tick();
  expect(api.getRecipe()).toEqual(before);
  expect(reports).toEqual([]);
});

it("refuses during a transform drag and locks new drags through guarded preparation", async () => {
  const api = await mount();
  const before = api.getRecipe();
  scene.world.editor.dragging = true;
  await expect(
    api.configure(
      { ...before, prompt: "Agent" },
      { expectedRevision: api.getRecipeRevision() },
    ),
  ).rejects.toThrow(/drag/i);
  expect(api.getRecipe()).toEqual(before);
  scene.world.editor.dragging = false;
  let finish!: (commit: () => void) => void;
  scene.world.prepareCharacter.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let write!: Promise<Recipe>;
  await act(async () => {
    write = api.configure(before, {
      expectedRevision: api.getRecipeRevision(),
    });
  });
  const release = scene.world.editor.holdEdits.mock.results.at(-1)!.value;
  await act(async () => session.setPlaying(false));
  expect(release).not.toHaveBeenCalled();
  await act(async () => {
    finish(() => {});
    await write;
  });
  expect(release).toHaveBeenCalledOnce();
});

it("rechecks project identity after async character preparation before any live commit", async () => {
  const api = await mount();
  const before = api.getRecipe();
  const revision = api.getRecipeRevision();
  const commitCharacter = vi.fn();
  let finish!: (commit: () => void) => void;
  scene.world.prepareCharacter.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  queued(revision);
  await tick();
  expect(finish).toBeTypeOf("function");
  await act(async () => {
    studioStore.getState().actions.commit(bundle("another-project"));
  });
  await act(async () => {
    finish(commitCharacter);
  });
  expect(commitCharacter).not.toHaveBeenCalled();
  expect(api.getRecipe()).toEqual(before);
  expect(api.getRecipeRevision()).toBe(revision);
  expect(session.audioURL).toBe("");
  expect(reports[0]).toMatchObject({ ok: false });
  expect(reports[0].error).toMatch(/project changed/);
  expect(
    readWorldFiles(studioStore.getState().director.bundle!).recipe,
  ).toBeUndefined();
});

it("does not partially apply a named take when the project changes during sound decoding", async () => {
  const api = await mount();
  const before = api.getRecipe();
  const revision = api.getRecipeRevision();
  let finish!: (audio: ReturnType<typeof decoded>) => void;
  vi.mocked(decodeAudio).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  queued(revision, true);
  await tick();
  expect(api.getRecipe()).toEqual(before);
  await act(async () => {
    studioStore.getState().actions.commit(bundle("another-project"));
  });
  await act(async () => {
    finish(decoded());
  });
  expect(api.getRecipe()).toEqual(before);
  expect(api.getRecipeRevision()).toBe(revision);
  expect(session.audioURL).toBe("");
  expect(reports[0]).toMatchObject({ ok: false });
});

it("commits a named take and its dry sound together, and reports post-commit preview failure truthfully", async () => {
  const api = await mount();
  const before = api.getRecipeRevision();
  queued(before, true);
  scene.world.renderFrame.mockRejectedValueOnce(
    new Error("Preview unavailable"),
  );
  await tick();
  expect(api.getRecipe().prompt).toBe("Agent's scene");
  expect(api.getRecipe().envelope).toEqual(decoded().envelope);
  expect(api.getRecipeRevision()).toBe(`${before.split(":")[0]}:1`);
  expect(session.audioURL).toBe("blob:sound");
  expect(session.error).toBe("Preview unavailable");
  expect(reports).toEqual([
    { sequence: 1, expectedRevision: before, ok: true },
  ]);
});

it.each(["network", "http"])(
  "retries only the receipt after a %s acknowledgement failure",
  async (failure) => {
    const api = await mount();
    queued(api.getRecipeRevision());
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method !== "POST") return Response.json(handoff);
      reports.push(JSON.parse(String(init.body)));
      if (reports.length === 1) {
        if (failure === "network") throw new Error("Connection interrupted");
        return new Response(null, { status: 503 });
      }
      return Response.json({});
    });
    await tick();
    expect(reports).toHaveLength(1);
    expect(reports[0].ok).toBe(true);
    await act(async () => {
      await session.change({ prompt: "Human edit after agent applied" });
    });
    const revision = api.getRecipeRevision();
    const configured = scene.world.configure.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(reports).toHaveLength(2);
    expect(reports[1]).toEqual(reports[0]);
    expect(api.getRecipe().prompt).toBe("Human edit after agent applied");
    expect(api.getRecipeRevision()).toBe(revision);
    expect(scene.world.configure).toHaveBeenCalledTimes(configured);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(reports).toHaveLength(2);
  },
);

it("recognizes an accepted acknowledgement after its response is lost", async () => {
  const api = await mount();
  queued(api.getRecipeRevision());
  vi.mocked(fetch).mockImplementation(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(handoff);
    reports.push(JSON.parse(String(init.body)));
    handoff = { ...handoff, state: "applied" };
    throw new Error("Response lost after acceptance");
  });
  await tick();
  const revision = api.getRecipeRevision();
  const configured = scene.world.configure.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(reports).toHaveLength(1);
  expect(api.getRecipeRevision()).toBe(revision);
  expect(scene.world.configure).toHaveBeenCalledTimes(configured);
});

it("keeps a failed receipt with its project and resumes it only when reopened", async () => {
  const api = await mount();
  queued(api.getRecipeRevision());
  const read = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).includes("/another-project/"))
      return Response.json({ state: "none" });
    if (init?.method === "POST" && !reports.length) {
      reports.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 503 });
    }
    return read(url, init);
  });
  await tick();
  const original = studioStore.getState().director.bundle!;
  const revision = api.getRecipeRevision();
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  await act(async () => {
    studioStore.getState().actions.commit(bundle("another-project"));
    finish(Response.json(handoff));
  });
  expect(reports).toHaveLength(1);
  await act(async () => {
    studioStore.getState().actions.commit(original);
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(reports).toHaveLength(2);
  expect(reports[1]).toEqual(reports[0]);
  expect(api.getRecipeRevision()).toBe(revision);
  const posts = vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === "POST");
  expect(posts.map(([url]) => url)).toEqual([
    `/api/projects/${project.id}/world-recipe/applied`,
    `/api/projects/${project.id}/world-recipe/applied`,
  ]);
});

it("does not send an old receipt after the server replaces its handoff", async () => {
  const api = await mount();
  queued(api.getRecipeRevision());
  vi.mocked(fetch).mockImplementation(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(handoff);
    reports.push(JSON.parse(String(init.body)));
    return new Response(null, { status: reports.length === 1 ? 503 : 200 });
  });
  await tick();
  queued(api.getRecipeRevision());
  handoff = {
    ...handoff,
    sequence: 2,
    recipe: { ...api.getRecipe(), prompt: "Replacement handoff" },
  };
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(reports.map((r) => r.sequence)).toEqual([1, 2]);
  expect(api.getRecipe().prompt).toBe("Replacement handoff");
});

it("stops pending receipt retries when World Builder closes", async () => {
  const api = await mount();
  queued(api.getRecipeRevision());
  vi.mocked(fetch).mockImplementation(async (_url, init) => {
    if (init?.method !== "POST") return Response.json(handoff);
    reports.push(JSON.parse(String(init.body)));
    return new Response(null, { status: 503 });
  });
  await tick();
  await act(async () => root.unmount());
  const calls = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(fetch).toHaveBeenCalledTimes(calls);
  expect(reports).toHaveLength(1);
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
