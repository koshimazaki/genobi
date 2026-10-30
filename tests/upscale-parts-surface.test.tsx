import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import UpscaleSplit from "../src/components/UpscaleSplit";
import { partRange, partState } from "../src/upscale-parts-client";
import { upscalePartsTools } from "../mcp/upscale-parts-tools";
import type { GenobiApi } from "../mcp/api";
import { planParts, type PartSetView } from "../shared/upscale-parts";
import type { GenerateInput, Job, Source } from "../shared/types";

// The studio's offer and dialog helpers, and the agents' tools, over a set
// that stands in for the server's: what each shows and what each sends.
const plan = planParts(555, 24);
const job = (status: Job["status"], extra: Partial<Job> = {}) =>
  ({ id: "job-1", status, prompt: "", createdAt: "", ...extra }) as Job;
const set: PartSetView = {
  id: "8d0b3f8e-4b7a-4c1e-9f0a-2b3c4d5e6f70",
  sourceId: "mix",
  model: "seedvr2-upscale",
  upscaleFactor: 2,
  upscaleCreativity: 0,
  partSeconds: 19,
  status: "quoted",
  plan,
  parts: plan.parts.map((part) => ({ ...part, sourceId: `cut-${part.index}` })),
  quoteId: "0e8b6d3c-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
  estimateUsd: 0,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  confirmed: false,
};
const input = {
  generator: "upscale",
  model: "seedvr2-upscale",
  sourceId: "mix",
  upscaleFactor: 2,
  upscaleCreativity: 0,
} as GenerateInput;

describe("the studio's split offer", () => {
  it("offers the split beside a clip too long for one upscale", () => {
    const html = renderToStaticMarkup(
      <UpscaleSplit
        input={input}
        source={{ id: "mix", duration: 23.125 } as Source}
        apiKey=""
        refresh={async () => {}}
      />,
    );
    expect(html).toContain("Split into 2 parts");
    expect(html).not.toContain("<dialog");
  });

  it("names each part's range and state", () => {
    expect(partRange(set.parts[1])).toBe(
      "Part 2 · 19.00–23.13 s · frames 456–554",
    );
    expect(partState(set.parts[0])).toBe("Waiting");
    expect(partState({ ...set.parts[0], job: job("Ready") })).toBe("Ready");
    expect(
      partState({ ...set.parts[0], job: job("Error"), uncertain: true }),
    ).toMatch(/may have been charged/);
    expect(partState({ ...set.parts[0], refused: "Budget." })).toBe(
      "Not sent: Budget.",
    );
  });
});

describe("the agents' split tools", () => {
  const tool = (name: string) =>
    upscalePartsTools.find((item) => item.name === name)!;
  const fake = () => {
    const calls: { path: string; body?: unknown; headers?: unknown }[] = [];
    const api = {
      post: async (path: string, body: unknown, headers?: unknown) => {
        calls.push({ path, body, headers });
        return { set };
      },
      get: async (path: string) => {
        calls.push({ path });
        return { set };
      },
    } as unknown as GenobiApi;
    return { api, calls };
  };

  it("plans for free and says to ask before confirming", async () => {
    const { api, calls } = fake();
    const result = (await tool("genobi_upscale_parts_plan").run(api, {
      generator: "upscale",
      model: "seedvr2-upscale",
      sourceId: "mix",
      upscaleFactor: 2,
    })) as { parts: { frames: string }[]; next: string };
    expect(calls[0].path).toBe("/api/upscale-parts");
    expect(result.parts.map((p) => p.frames)).toEqual(["0–455", "456–554"]);
    expect(result.next).toMatch(
      /one step waiting for the person.s approval.*only after they agree/,
    );
    expect(tool("genobi_upscale_parts_plan").paid).toBeUndefined();
  });

  it("confirms the set and a part's retry only with a quote, as paid tools", async () => {
    const { api, calls } = fake();
    await tool("genobi_upscale_parts_confirm").run(api, {
      setId: set.id,
      quoteId: set.quoteId,
    });
    await tool("genobi_upscale_parts_retry_confirm").run(api, {
      setId: set.id,
      part: 2,
      quoteId: set.quoteId,
    });
    expect(calls.map((call) => call.path)).toEqual([
      `/api/upscale-parts/${set.id}/confirm`,
      `/api/upscale-parts/${set.id}/parts/1/confirm`,
    ]);
    expect(calls[0].headers).toEqual({ "Quote-Id": set.quoteId });
    expect(tool("genobi_upscale_parts_confirm").paid).toBe(true);
    expect(tool("genobi_upscale_parts_retry_confirm").paid).toBe(true);
    await expect(
      tool("genobi_upscale_parts_confirm").run(api, {
        setId: set.id,
        quoteId: "not-a-quote",
      }),
    ).rejects.toThrow();
  });
});
