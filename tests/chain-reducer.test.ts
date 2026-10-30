import { describe, expect, it } from "vitest";
import type { ChainView } from "../shared/chain";
import type { GenerateInput } from "../shared/types";
import { chainClient } from "../src/chain-client";
import {
  chainForJob,
  chainsReducer,
  emptyChains,
  liveChainFor,
  reviewFor,
  reviewTake,
} from "../src/chain-state";
import { composerInput, initialComposer } from "../src/useComposer";

// The chain state's own rules: what a reply or a list keeps, which take a
// chain's review shows, and when a take may open its own draft review.
const draft: GenerateInput = {
  ...composerInput({ ...initialComposer, draft: true }),
  description: "A chrome motorbike.",
};
const upscale: GenerateInput = {
  ...draft,
  generator: "upscale",
  draft: false,
  upscaleFactor: 1.5,
};

describe("chain state", () => {
  const view = (id: string, status: ChainView["status"]): ChainView => ({
    id,
    status,
    createdAt: "",
    updatedAt: "",
    stages: [{ status: "paused", input: draft }],
  });

  it("keeps what the page holds when history arrives, and refusals until the chain moves", () => {
    let state = chainsReducer(emptyChains, {
      type: "reply",
      reply: { chain: { ...view("a", "paused"), pausedAt: 0 } },
      origin: "studio",
      draftJobId: "take-1",
    });
    state = chainsReducer(state, {
      type: "listed",
      chains: [view("a", "running"), view("b", "paused")],
    });
    expect(state.entries.a.chain.status).toBe("paused");
    expect(state.order).toEqual(["a", "b"]);
    expect(chainForJob(state, "take-1")?.chain.id).toBe("a");

    state = chainsReducer(state, {
      type: "refused",
      id: "a",
      message: "No.",
      code: "quote_mismatch",
    });
    state = chainsReducer(state, {
      type: "reply",
      reply: { chain: { ...view("a", "paused"), pausedAt: 0 } },
    });
    expect(state.entries.a.refusal?.code).toBe("quote_mismatch");
    state = chainsReducer(state, {
      type: "reply",
      reply: { chain: view("a", "running") },
    });
    expect(state.entries.a.refusal).toBeUndefined();
    expect(state.entries.a.origin).toBe("studio");
  });

  it("reviews a chain over its newest take, else the draft it continues", () => {
    const chain = view("c", "paused");
    expect(reviewTake({ chain, draftJobId: "draft-1" })).toBe("draft-1");
    expect(reviewTake({ chain })).toBeUndefined();
    const ran: ChainView = {
      ...chain,
      stages: [
        { status: "ready", input: draft, jobId: "stage-0" },
        { status: "running", input: upscale, jobId: "stage-1" },
      ],
    };
    expect(reviewTake({ chain: ran, draftJobId: "draft-1" })).toBe("stage-1");
  });

  it("knows the take a Studio upscale continues after a reload", () => {
    const studioChain: ChainView = {
      ...view("s", "paused"),
      pausedAt: 0,
      stages: [
        { status: "paused", input: { ...upscale, sourceId: "take-0001" } },
      ],
    };
    // Loaded from history: no draft was recorded on this page.
    let state = chainsReducer(emptyChains, {
      type: "listed",
      chains: [studioChain],
    });
    expect(state.entries.s.draftJobId).toBe("take-0001");
    expect(reviewTake(state.entries.s)).toBe("take-0001");
    expect(chainForJob(state, "take-0001")?.chain.id).toBe("s");
    // Read first rather than listed, it is recovered the same way.
    state = chainsReducer(emptyChains, {
      type: "reply",
      reply: { chain: studioChain },
    });
    expect(reviewTake(state.entries.s)).toBe("take-0001");
    // A Fast chain starts from text: no take until a stage runs.
    state = chainsReducer(emptyChains, {
      type: "listed",
      chains: [view("f", "paused")],
    });
    expect(reviewTake(state.entries.f)).toBeUndefined();
  });

  it("shows a focused chain only over its own take, or before it has one", () => {
    const studioChain: ChainView = {
      ...view("s", "paused"),
      pausedAt: 0,
      stages: [
        { status: "paused", input: { ...upscale, sourceId: "take-0001" } },
      ],
    };
    let state = chainsReducer(emptyChains, {
      type: "reply",
      reply: { chain: studioChain },
      focus: true,
    });
    expect(reviewFor(state, "take-0001")?.chain.id).toBe("s");
    // Another run, or a library clip (no run), is not this chain's take.
    expect(reviewFor(state, "another-run")).toBeUndefined();
    expect(reviewFor(state, undefined)).toBeUndefined();
    // A Fast chain before its first stage has no take to be over.
    state = chainsReducer(state, {
      type: "reply",
      reply: { chain: { ...view("f", "paused"), pausedAt: 0 } },
      focus: true,
    });
    expect(reviewFor(state, undefined)?.chain.id).toBe("f");
    // Unfocused, the chain the shown run belongs to.
    state = chainsReducer(state, { type: "focus", id: null });
    expect(reviewFor(state, "take-0001")?.chain.id).toBe("s");
  });

  it("keeps a take with a live chain from reopening as a draft review", () => {
    const over = (status: ChainView["status"]): ChainView => ({
      ...view("c", status),
      stages: [
        { status: "ready", input: draft, jobId: "stage-0" },
        { status: "paused", input: upscale },
      ],
    });
    for (const status of ["paused", "running", "complete"] as const) {
      const state = chainsReducer(emptyChains, {
        type: "reply",
        reply: { chain: over(status) },
      });
      expect(liveChainFor(state, "stage-0")?.chain.id).toBe("c");
    }
    for (const status of ["cancelled", "failed"] as const) {
      const state = chainsReducer(emptyChains, {
        type: "reply",
        reply: { chain: over(status) },
      });
      expect(liveChainFor(state, "stage-0")).toBeUndefined();
    }
    expect(liveChainFor(emptyChains, "stage-0")).toBeUndefined();
  });

  it("reads a list that a fixture answered without one", async () => {
    const client = chainClient(
      async () => new Response(JSON.stringify({ jobs: [] })),
      () => "",
    );
    expect(await client.list()).toEqual([]);
  });
});
