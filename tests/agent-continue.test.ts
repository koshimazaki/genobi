// Continue this conversation (issue #58): a finished Hermes run resumes the
// same Hermes conversation in a new run (`--resume <id>`), the id stays on the
// server, and anything that cannot continue exactly is refused rather than
// started clean.
import { describe, expect, it } from "vitest";
import type { AgentSession } from "../shared/agent-session";
import { parseAgentSessionRequest } from "../shared/agent-session";
import { relayRequest } from "../shared/runner-relay";
import { continueFrom } from "../server/agent-continue";
import { hermesReader } from "../server/agent-hermes-stream";
import type { Running } from "../server/agent-session-types";
import { agentStudio, fakeConfig, fakeHermesConfig } from "./agent-harness";

const ID = "11111111-1111-4111-8111-111111111111";
const ended = (overrides: Partial<Running> = {}): Running => ({
  owner: "me",
  approvals: [],
  results: new Map(),
  readable: new Set(),
  bound: new Set(),
  resumeId: "20261105_000000_fake01",
  view: {
    id: ID,
    runner: "hermes",
    status: "done",
    prompt: "Cut the drop",
    startedAt: "",
    lines: [],
  },
  ...overrides,
});
const request = (extra: object = {}) =>
  parseAgentSessionRequest({
    prompt: "slower",
    source: "voice",
    continues: ID,
    ...extra,
  });

describe("reading Hermes' conversation id", () => {
  const events = (...list: object[]) => list.map((e) => JSON.stringify(e));

  it("keeps the init id once the run answers, and the newest id at the end", () => {
    const read = hermesReader();
    const updates = events(
      { type: "system", subtype: "init", session_id: "20261105_000000_aaaaaa" },
      { type: "text", text: "Working." },
      {
        type: "result",
        session_id: "20261105_000001_bbbbbb",
        exit_code: 0,
        text: "Done.",
      },
    ).flatMap(read);
    expect(updates.filter((u) => u.runnerSession)).toEqual([
      { runnerSession: "20261105_000000_aaaaaa" },
      { runnerSession: "20261105_000001_bbbbbb" },
    ]);
  });

  it("keeps nothing for a start that failed before any turn", () => {
    const read = hermesReader();
    const updates = events(
      { type: "system", subtype: "init", session_id: "20261105_000000_aaaaaa" },
      {
        type: "result",
        session_id: "20261105_000000_aaaaaa",
        exit_code: 1,
        error: "credentials or agent init failed",
      },
    ).flatMap(read);
    expect(updates.some((u) => u.runnerSession)).toBe(false);
  });

  it.each(["latest", "LATEST", "--yolo", "-r", "", "a b c d e f"])(
    "never keeps %j, which could resume another conversation",
    (id) => {
      const read = hermesReader();
      const updates = events(
        { type: "system", subtype: "init", session_id: id },
        { type: "tool_use", name: "x" },
        { type: "result", session_id: id, exit_code: 0, text: "" },
      ).flatMap(read);
      expect(updates.some((u) => u.runnerSession)).toBe(false);
    },
  );
});

describe("which earlier session a Continue start may resume", () => {
  const sessions = (session: Running) => new Map([[session.view.id, session]]);

  it("resumes the owner's finished session on the same runner and project", () => {
    const earlier = ended({ project: "p1" });
    expect(
      continueFrom(
        sessions(earlier),
        "me",
        request({ copyId: "p1" }),
        "hermes",
      ),
    ).toBe(earlier);
  });

  it.each<[string, Partial<Running>, object, AgentSession["runner"], RegExp]>([
    ["another owner's", { owner: "you" }, {}, "hermes", /no longer kept/],
    [
      "a running",
      { view: { ...ended().view, status: "running" } },
      {},
      "hermes",
      /still running/,
    ],
    ["another runner's", {}, {}, "claude", /agent changed/],
    [
      "another project's",
      { project: "p1" },
      { copyId: "p2" },
      "hermes",
      /different project/,
    ],
    [
      "a Claude Code",
      { resumeId: undefined, view: { ...ended().view, runner: "claude" } },
      {},
      "claude",
      /Claude Code keeps no conversation/,
    ],
  ])("refuses %s session", (_, overrides, extra, runner, message) => {
    let refusal: unknown;
    try {
      continueFrom(sessions(ended(overrides)), "me", request(extra), runner);
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toMatchObject({
      status: 409,
      code: "agent_continue_unavailable",
    });
    expect((refusal as Error).message).toMatch(message);
  });

  it("refuses a second continuation of the same run, which would fork it", () => {
    const earlier = ended({ continuedBy: "newer" });
    const map = new Map([
      [ID, earlier],
      ["newer", ended()],
    ]);
    expect(() => continueFrom(map, "me", request(), "hermes")).toThrow(
      /already continued/,
    );
  });

  it("is a headless, local start of one session id", () => {
    expect(() =>
      parseAgentSessionRequest({
        prompt: "x",
        source: "voice",
        continues: "latest",
      }),
    ).toThrow();
    expect(() => request({ mode: "terminal" })).toThrow();
    expect(() => relayRequest(request())).toThrow(/local studio only/);
  });
});

describe("Continue on the local server", { timeout: 20_000 }, () => {
  it("resumes the same Hermes conversation after the earlier run finished", async () => {
    const studio = await agentStudio({
      config: await fakeHermesConfig(),
      sampleMs: 50,
    });
    const cookie = await studio.fresh();
    const first = await studio.start(cookie, "Check the studio");
    const done = await studio.settle(cookie, first.body.id);
    expect(done).toMatchObject({ status: "done", resumable: true });
    // The runner's id never leaves the server.
    expect(JSON.stringify(done)).not.toContain("fake01");

    const next = await studio.start(cookie, "Now make it slower", {
      continues: done.id,
    });
    expect(next.status).toBe(201);
    expect(next.body.id).not.toBe(done.id);
    expect(next.body.continues).toBe(done.id);
    const resumed = await studio.settle(cookie, next.body.id);
    expect(resumed.status).toBe("done");
    expect(resumed.lines).toContain("resumed 20261105_000000_fake01 here");
    expect(resumed.exchange?.map((entry) => entry.text)).toEqual([
      "Check the studio",
      "The studio is up.\n\nNothing was spent.",
      "Now make it slower",
      "The studio is up.\n\nNothing was spent.",
    ]);

    // One thread: the earlier run cannot be continued a second time.
    const fork = await studio.start(cookie, "again", { continues: done.id });
    expect(fork.status).toBe(409);
    expect(fork.body.code).toBe("agent_continue_unavailable");
  });

  it("follows the id Hermes rotates to during compression", async () => {
    const studio = await agentStudio({
      config: await fakeHermesConfig(),
      sampleMs: 50,
    });
    const cookie = await studio.fresh();
    const first = await studio.start(cookie, "compress the history");
    const done = await studio.settle(cookie, first.body.id);
    const next = await studio.start(cookie, "go on", { continues: done.id });
    const resumed = await studio.settle(cookie, next.body.id);
    expect(resumed.lines).toContain("resumed 20261105_000001_fake02 here");
  });

  it("refuses to continue a finished Claude Code run, and starts nothing", async () => {
    const studio = await agentStudio({ config: await fakeConfig() });
    const cookie = await studio.fresh();
    const first = await studio.start(cookie, "Check the studio");
    const done = await studio.settle(cookie, first.body.id);
    expect(done.resumable).toBeUndefined();
    const next = await studio.start(cookie, "slower", { continues: done.id });
    expect(next.status).toBe(409);
    expect(next.body).toMatchObject({ code: "agent_continue_unavailable" });
    expect(next.body.error).toMatch(/Start new conversation/);
    const { body } = await studio.call(cookie, "/sessions");
    expect(body.session).toBeNull();
  });
});
