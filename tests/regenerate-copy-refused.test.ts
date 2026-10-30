// The reproduction of the owner's 29 Oct report: the Global prompt typed
// into the Editor, then Regenerate's Send answered "did not reach the
// project copy in time". The local server had been started before the
// global prompt existed, so its validator refused every push of a project
// carrying `globalPrompt` (400 `invalid_project`, "must NOT have additional
// properties"). CopySync marks that revision failed and never retries it, so
// the save answered false at once: a refusal, reported as a slow save.
// Against the real local server, wrapped to refuse as that older one did.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSession } from "../shared/agent-session";
import { CopySync } from "../src/director/project-copy-sync";
import { createStudioStore } from "../src/studio/store";
import { base } from "./house-template-fixtures";
import { setup } from "./server-harness";

const OLD_SERVER = "Invalid bundle:  must NOT have additional properties";
const started: AgentSession = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "claude",
  status: "running",
  prompt: "Regenerate",
  startedAt: "2026-10-29T12:00:00.000Z",
  lines: [],
};

beforeEach(() => vi.resetModules());

/** A studio window whose copy lives on a server older than the client. */
async function staleServer({ refuse = true } = {}) {
  const harness = await setup();
  const fetcher = (async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    if (
      refuse &&
      method === "PUT" &&
      /^\/api\/projects\/[a-z-]+$/.test(input) &&
      "globalPrompt" in JSON.parse(String(init.body)).project
    )
      return Response.json(
        { error: OLD_SERVER, code: "invalid_project" },
        { status: 400 },
      );
    return fetch(`${harness.base}${input}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        cookie: harness.cookie,
      },
    });
  }) as typeof fetch;
  const store = createStudioStore();
  const notices: string[] = [];
  const sync = new CopySync({
    store,
    fetcher,
    debounce: 10,
    notice: (text) => notices.push(text),
    live: () => {},
  });
  store.getState().actions.initialize(base());
  await sync.push();
  const guard = await import("../src/director/leave-guard");
  guard.flushBeforeLeaving(
    (all) => sync.flush(all),
    () => sync.isSynced(),
    () => sync.whyNotSaved(),
  );
  /** What the Global prompt's field commits on blur. */
  const writeGlobalPrompt = (text: string) => {
    const now = store.getState().director.bundle!;
    store.getState().actions.commit({
      ...now,
      project: { ...now.project, globalPrompt: text },
    });
    sync.schedule();
  };
  const prompts: string[] = [];
  const spawn = vi.fn(
    async (request: {
      prompt: string;
      writePrompt?: () => Promise<string>;
    }) => {
      prompts.push(
        request.writePrompt ? await request.writePrompt() : request.prompt,
      );
      return started;
    },
  );
  const { regenerate } = await import("../src/director/regenerate");
  const send = (instruction: string) =>
    regenerate(instruction, {
      bundle: () => store.getState().director.bundle,
      copy: async () => true,
      inFlight: () => false,
      latest: () => undefined,
      startedOn: () => undefined,
      show: () => {},
      spawn: spawn as never,
    });
  return { store, sync, notices, writeGlobalPrompt, send, spawn, prompts };
}

describe("Send after the Global prompt, on a server older than the studio", () => {
  it("says the server refused the edit, with its reason, and sends nothing", async () => {
    const studio = await staleServer();
    studio.writeGlobalPrompt("A slow push in through the rooms.");
    const outcome = await studio.send("A slow push in through the rooms.");
    expect(outcome).toEqual({
      kind: "unsaved",
      problem: { kind: "refused", message: OLD_SERVER },
    });
    expect(studio.prompts).toEqual([]);
    const { outcomeNote } = await import("../src/director/RegenerateAction");
    const note = outcomeNote(outcome)!;
    expect(note.alert).toBe(true);
    expect(note.text).toContain(OLD_SERVER);
    expect(note.text).toMatch(/restart/i);
    expect(note.text).not.toMatch(/in time/);
  });

  it("sends once the server takes the edit, with the Global prompt in the copy", async () => {
    const studio = await staleServer({ refuse: false });
    studio.writeGlobalPrompt("A slow push in through the rooms.");
    const outcome = await studio.send("A slow push in through the rooms.");
    expect(outcome).toMatchObject({ kind: "sent", turn: "new" });
    expect(studio.prompts).toHaveLength(1);
    expect(studio.prompts[0]).toContain("A slow push in through the rooms.");
    expect(studio.sync.holdsCurrent()).toBe(true);
  });
});
