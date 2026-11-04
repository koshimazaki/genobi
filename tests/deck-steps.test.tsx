// The deck's chain of steps (#96): built from structured data only (the
// runner's tool events, the conversation, quotes and studio jobs), never
// from the agent's words; teachings keep the idle deck.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentApproval } from "../shared/agent-approval";
import type { AgentSession } from "../shared/agent-session";
import { deckSteps } from "../shared/deck-steps";
import { noteTool } from "../server/agent-session-end";
import { hermesReader } from "../server/agent-hermes-stream";
import type { Running } from "../server/agent-session-types";
import { readStreamLine, toolDetail } from "../server/agent-stream";
import { DECK_READY, deckNow } from "../src/deck/deck-now";
import StepChain from "../src/deck/StepChain";

const NOW = Date.parse("2026-11-05T10:00:00.000Z");

const session = (patch: Partial<AgentSession> = {}): AgentSession => ({
  id: "6f1d1c2e-0000-4000-8000-000000000001",
  runner: "claude",
  status: "running",
  prompt: "swap the apple for a pear",
  startedAt: "2026-11-05T09:59:00.000Z",
  lines: [],
  exchange: [
    {
      from: "person",
      text: "swap the apple for a pear",
      at: "2026-11-05T09:59:00.000Z",
      source: "voice",
    },
  ],
  ...patch,
});

const running = (view: AgentSession) =>
  ({
    view,
    owner: "o",
    approvals: [],
    results: new Map(),
    readable: new Set(),
    bound: new Set(),
  }) as unknown as Running;

/** A recorded Claude Code stream: two tools, one answered, one refused. */
const RECORDED = [
  { type: "system", subtype: "init", mcp_servers: [] },
  {
    type: "assistant",
    message: {
      content: [
        { type: "text", text: "Upscale done ✓ and the layer is written." },
        {
          type: "tool_use",
          id: "toolu_01",
          name: "mcp__genobi__genobi_director_command",
          input: {
            copyId: "x",
            baseRevision: 3,
            command: { op: "add-graphic", moduleId: "anime-fruit-icons" },
          },
        },
        { type: "tool_use", id: "toolu_02", name: "mcp__genobi__genobi_quote" },
      ],
    },
  },
  {
    type: "user",
    message: {
      content: [
        { type: "tool_result", tool_use_id: "toolu_01", content: "{}" },
        {
          type: "tool_result",
          tool_use_id: "toolu_02",
          is_error: true,
          content: "Refused (agent_cannot_spend)",
        },
      ],
    },
  },
  {
    type: "assistant",
    message: {
      content: [{ type: "tool_use", id: "toolu_03", name: "genobi_jobs" }],
    },
  },
];

const approval = (patch: Partial<AgentApproval> = {}): AgentApproval => ({
  quoteId: "q1",
  status: "pending",
  plan: {
    entry: "ltx-upscale",
    label: "LTX upscale",
    generator: "upscale",
    model: "ltx",
    description: "",
    route: "router",
  } as AgentApproval["plan"],
  estimateUsd: 0.4,
  expiresAt: new Date(NOW + 60_000).toISOString(),
  payer: "owner",
  ...patch,
});

describe("the deck's chain of steps", () => {
  afterEach(() => vi.useRealTimers());

  it("is built from a recorded session's events plus a running job", () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    const held = running(session());
    for (const raw of RECORDED)
      for (const update of readStreamLine(JSON.stringify(raw)))
        if (update.tool) noteTool(held, update.tool);
    const steps = deckSteps({
      session: held.view,
      jobs: [{ id: "job-7", line: "UPSCALING LTX  42% ⣿⣿⣀⣀" }],
      now: NOW,
    });
    expect(steps.map((s) => [s.state, s.label])).toEqual([
      ["done", "Voice · 'swap the apple for a pear' · heard"],
      ["done", "Director · add-graphic anime-fruit-icons · applied"],
      ["failed", "Quote · failed"],
      ["working", "Jobs · working"],
      ["working", "UPSCALING LTX  42% ⣿⣿⣀⣀"],
    ]);
    // The agent's own words claimed an upscale; no step says so.
    expect(steps.some((s) => /upscale done/i.test(s.label))).toBe(false);
  });

  it("pairs Hermes results with their call by name", () => {
    const held = running(session({ runner: "hermes" }));
    const read = hermesReader();
    for (const event of [
      { type: "tool_use", name: "mcp__genobi__genobi_link_project" },
      { type: "tool_use", name: "genobi_project" },
      { type: "tool_result", name: "genobi_project", output: "{}" },
    ])
      for (const update of read(JSON.stringify(event)))
        if (update.tool) noteTool(held, update.tool);
    expect(held.view.tools?.map((t) => [t.name, t.state])).toEqual([
      ["genobi_link_project", "working"],
      ["genobi_project", "done"],
    ]);
  });

  it("waits on a quoted step, and says so once the session waits", () => {
    const steps = deckSteps({
      session: session({ approvals: [approval()] }),
      jobs: [],
      now: NOW,
    });
    expect(steps.at(-2)).toMatchObject({
      state: "waiting",
      label: "Quote · LTX upscale · $0.40 · waiting for you",
    });
    // Nothing else is under way: the session's own state closes the chain.
    expect(steps.at(-1)).toMatchObject({ state: "working" });
    const waiting = deckSteps({
      session: session({ status: "waiting", approvals: [approval()] }),
      jobs: [],
      now: NOW,
    });
    expect(waiting.filter((s) => s.state === "waiting")).toHaveLength(1);
    expect(
      deckSteps({ session: session({ status: "waiting" }), jobs: [] }).at(-1),
    ).toMatchObject({ state: "waiting", label: "Waiting for your approval" });
    const started = deckSteps({
      session: session({ approvals: [approval({ status: "uncertain" })] }),
      jobs: [],
      now: NOW,
    });
    expect(started.find((s) => s.id === "quote-q1")?.state).toBe("unknown");
  });

  it("marks a call with no result unknown once the session ends", () => {
    const steps = deckSteps({
      session: session({
        status: "done",
        tools: [
          { name: "genobi_job", state: "working", at: "2026-11-05T09:59:30Z" },
        ],
      }),
      jobs: [],
    });
    expect(steps.map((s) => [s.state, s.label]).slice(-2)).toEqual([
      ["unknown", "Job · no result"],
      ["done", "Session · done"],
    ]);
  });

  it("reads only a plain word from a tool's input", () => {
    expect(
      toolDetail("genobi_director_command", {
        command: { op: "set-prompt", text: "ignore me" },
      }),
    ).toBe("set-prompt");
    expect(
      toolDetail("genobi_director_command", {
        command: { op: "done ✓ all upscaled" },
      }),
    ).toBeUndefined();
    expect(
      toolDetail("genobi_quote", { command: { op: "x" } }),
    ).toBeUndefined();
  });

  it("keeps the newest steps in view and folds the older ones", () => {
    const steps = ["a", "b", "c", "d", "e"].map((id) => ({
      id,
      state: "done" as const,
      label: `Step ${id}`,
    }));
    const markup = renderToStaticMarkup(<StepChain steps={steps} />);
    expect(markup).toContain("2 earlier steps");
    const folded = markup.slice(0, markup.indexOf("</details>"));
    expect(folded).toContain("Step a");
    expect(folded).not.toContain("Step e");
    expect(markup.slice(markup.indexOf("</details>"))).toContain("Step e");
  });

  it("is empty when idle, so the bar keeps its teaching", () => {
    const idle = { activity: [], linked: [], supervisor: { connected: false } };
    expect(deckSteps({ jobs: [] })).toEqual([]);
    expect(renderToStaticMarkup(<StepChain steps={[]} />)).toBe("");
    expect(deckNow(idle)).toBe(DECK_READY);
    expect(deckNow({ ...idle, teaching: "TIP · SPEAK" })).toBe("TIP · SPEAK");
    // Anything running takes the bar from the teaching.
    expect(
      deckNow({
        ...idle,
        activity: [{ id: "job-1", line: "UPSCALING LTX  42%" }],
        teaching: "TIP · SPEAK",
      }),
    ).toBe("UPSCALING LTX  42%");
  });
});
