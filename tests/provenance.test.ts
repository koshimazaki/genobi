import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { knownAgentOpenness, provenanceTier } from "../shared/provenance";
import {
  ProvenanceError,
  buildProvenance,
  readProvenance,
} from "../shared/provenance-card";
import {
  duration,
  madeWith,
  provenanceBadge,
  provenanceMarkdown,
} from "../shared/provenance-render";
import { registry } from "../shared/registry";
import { houseTemplates } from "../shared/templates/catalogue";
import { tierFrom, tierOf } from "../shared/templates/plan";
import { SHA, hermes, take } from "./provenance-fixtures";

const shots = [
  take("hero-1", "ltx-2-5-fast", "router", {
    estimateUsd: 0.5173,
    actualUsd: 0.51,
    credits: 108.64,
  }),
  take("detail-1", "ltx-2-5-fast", "router", {
    estimateUsd: 0.388,
    actualUsd: 0.39,
    credits: 81.48,
    createdAt: "2026-10-21T10:01:00.000Z",
  }),
];
const base = {
  title: "FIELD ONE: product video",
  template: "product-video",
  skill: "plugins/genobi/skills/product-video/SKILL.md",
  agent: hermes,
  workflows: "cloud" as const,
  hardware: "Comfy Router (hosted)",
  takes: shots.map((t, i) => ({
    take: t,
    finishedAt: `2026-10-21T10:0${i + 2}:30.000Z`,
  })),
};

describe("provenance cards", () => {
  it("builds an open card from open takes and an open agent", () => {
    const card = buildProvenance({ ...base, hashes: { "hero-1": SHA(7) } });
    expect(card.tier).toBe("open");
    expect(card.agent).toEqual({ ...hermes, open: true, openness: "licences" });
    expect(card.generations.map((g) => [g.entry, g.label, g.role])).toEqual([
      ["ltx-2-5-fast", "LTX-2.5 Fast · Text to video", "shot"],
      ["ltx-2-5-fast", "LTX-2.5 Fast · Text to video", "shot"],
    ]);
    expect(card.run).toEqual({
      generations: "cloud",
      agent: "cloud",
      hardware: "Comfy Router (hosted)",
    });
    expect(card.time).toEqual({
      startedAt: "2026-10-21T10:00:00.000Z",
      finishedAt: "2026-10-21T10:03:30.000Z",
      seconds: 210,
    });
    expect(card.cost).toEqual({
      estimateUsd: 0.9053,
      actualUsd: 0.9,
      credits: 190.12,
    });
    expect(card.workflowFiles).toEqual([]);
    expect(card.outputs.map((o) => o.sha256)).toEqual([SHA(7), null]);
    // A card read back from JSON is the same card.
    expect(readProvenance(JSON.parse(JSON.stringify(card)))).toEqual(card);
  });

  it("derives the tier by the templates' rule, counting a closed agent as a step", () => {
    const upscale = take("up-1", "flux-video-upscale", "bfl");
    const still = take("still-1", "flux-3-image", "router", {
      mediaType: "image",
    });
    const tier = (agent: object, extra: ReturnType<typeof take>[] = []) =>
      buildProvenance({
        ...base,
        agent: agent as typeof hermes,
        takes: [...shots, ...extra].map((t) => ({ take: t })),
      }).tier;
    const claude = {
      harness: "claude-code",
      model: "claude-opus-5-5",
      provider: "anthropic",
    };
    expect(tier(hermes)).toBe("open");
    expect(tier(hermes, [upscale])).toBe("semi-open");
    expect(tier(claude)).toBe("semi-open");
    expect(tier(claude, [upscale])).toBe("premium");
    expect(tier(hermes, [upscale, still])).toBe("premium");
    expect(tier({ harness: "person" }, [upscale])).toBe("semi-open");
    const closedShot = take("flux-1", "flux-3-video", "router");
    expect(tier(hermes, [closedShot])).toBe("premium");
    // The same rule the templates use, case by case.
    for (const template of houseTemplates)
      expect(tierOf(template)).toBe(template.tier);
    expect([
      tierFrom(false, 0),
      tierFrom(false, 1),
      tierFrom(false, 2),
    ]).toEqual(["open", "semi-open", "premium"]);
    expect(tierFrom(true, 0)).toBe("premium");
  });

  it("names the workflow files of workflow takes, and they exist", () => {
    const card = buildProvenance({
      ...base,
      workflows: "local",
      agent: { ...hermes, provider: "local", model: "qwen3-vl-8b" },
      takes: [
        { take: take("av-1", "ltx-2-5-akuspace", "workflow") },
        {
          take: take("k-1", "flux-3-klein", "workflow", { mediaType: "image" }),
        },
      ],
    });
    expect(card.workflowFiles).toEqual([
      "workflows/ltx-2-5-akuspace-t2v.json",
      "workflows/flux-3-klein-t2i.json",
    ]);
    expect(card.run.generations).toBe("local");
    expect(card.run.agent).toBe("local");
    expect(card.generations.map((g) => g.runsOn)).toEqual([
      "local-comfyui",
      "local-comfyui",
    ]);
    for (const entry of registry)
      if (entry.status === "ready" && entry.route === "workflow")
        expect(existsSync(`workflows/${entry.model.slice(9)}.json`)).toBe(true);
  });

  it("knows which agent models LICENCES.md records, and asks about the rest", () => {
    expect(knownAgentOpenness("deepseek/deepseek-v4.1-flash")).toBe(true);
    expect(knownAgentOpenness("qwen/qwen3-vl-235b-a22b-instruct")).toBe(true);
    expect(knownAgentOpenness("claude-opus-5-5")).toBe(false);
    expect(knownAgentOpenness("openai/gpt-6.1-sol")).toBe(false);
    expect(knownAgentOpenness("z-ai/glm-5.2")).toBeUndefined();
    const glm = { harness: "hermes", model: "z-ai/glm-5.2", provider: "nous" };
    expect(() => buildProvenance({ ...base, agent: glm as never })).toThrow(
      /agent\.open/,
    );
    const declared = buildProvenance({
      ...base,
      agent: { ...glm, open: true } as never,
    });
    expect(declared.agent.openness).toBe("declared");
    expect(() =>
      buildProvenance({ ...base, agent: { ...hermes, open: false } }),
    ).toThrow(/LICENCES.md records/);
  });

  it("refuses a card whose claims disagree with its models", () => {
    const card = buildProvenance(base);
    const json = () => JSON.parse(JSON.stringify(card));
    const refused = (change: (c: ReturnType<typeof json>) => void) => {
      const c = json();
      change(c);
      return () => readProvenance(c);
    };
    expect(refused((c) => (c.tier = "premium"))).toThrow(/not premium/);
    expect(refused((c) => (c.generations[0].open = false))).toThrow(
      /disagrees with the registry/,
    );
    expect(refused((c) => (c.generations[0].runsOn = "local-comfyui"))).toThrow(
      /ran on router/,
    );
    expect(refused((c) => (c.cost.estimateUsd = 0.1))).toThrow(/cost/);
    expect(refused((c) => (c.workflowFiles = ["x.json"]))).toThrow(
      /workflowFiles/,
    );
    expect(refused((c) => (c.time.seconds = 1))).toThrow(/time.seconds/);
    expect(refused((c) => (c.outputs[0].sha256 = "abc"))).toThrow(/malformed/);
    expect(refused((c) => (c.template = "unknown-template"))).toThrow(
      /Unknown/,
    );
    expect(refused((c) => (c.skill = "../secrets.md"))).toThrow(/skill/);
    expect(refused((c) => (c.agent.provider = "local"))).toThrow(/agent ran/);
    expect(refused((c) => (c.title = "x".repeat(81)))).toThrow(/title/);
    expect(refused((c) => c.outputs.pop())).toThrow(/outputs/);
    expect(refused((c) => (c.outputs[0].operationId = "detail-1"))).toThrow(
      /under its take/,
    );
    expect(refused((c) => (c.generations[1] = c.generations[0]))).toThrow(
      /twice/,
    );
    expect(() => readProvenance("card")).toThrow(ProvenanceError);
    expect(() => buildProvenance({ ...base, takes: [] })).toThrow(/at least/);
  });

  it("never takes a creation time for a finish time", () => {
    const card = buildProvenance({
      ...base,
      takes: [
        ...base.takes,
        { take: take("late-1", "ltx-2-5-fast", "router") },
      ],
    });
    expect(card.time).toBeNull();
    // The session's own end, when the agent kept it, is a real finish time.
    const ended = buildProvenance({
      ...base,
      takes: [{ take: take("late-1", "ltx-2-5-fast", "router") }],
      finishedAt: "2026-10-21T10:09:00.000Z",
    });
    expect(ended.time?.seconds).toBe(540);
  });

  it("refuses a route the entry cannot run on, and allows the BFL fallback", () => {
    const card = buildProvenance({
      ...base,
      takes: [
        {
          take: take("k-1", "flux-3-klein-api", "bfl"),
          finishedAt: "2026-10-21T10:01:00.000Z",
        },
      ],
    });
    const forged = JSON.parse(JSON.stringify(card));
    forged.generations[0].route = "workflow";
    forged.generations[0].runsOn = "local-comfyui";
    forged.run.generations = "local";
    expect(() => readProvenance(forged)).toThrow(
      /flux-3-klein-api runs on bfl, not workflow/,
    );
    expect(() =>
      buildProvenance({
        ...base,
        takes: [{ take: take("l-1", "ltx-2-5-fast", "bfl") }],
      }),
    ).toThrow(/ltx-2-5-fast runs on router, not bfl/);
    const fallback = buildProvenance({
      ...base,
      takes: [
        {
          take: take("f-1", "flux-3-video", "bfl"),
          finishedAt: "2026-10-21T10:01:00.000Z",
        },
      ],
    });
    expect(fallback.generations[0].runsOn).toBe("bfl-api");
    // FLUX Video Upscale left the FLUX family for Upscale; it is still BFL's
    // model on Router, so a BFL key still runs it direct.
    const upscale = buildProvenance({
      ...base,
      takes: [
        {
          take: take("u-1", "flux-video-upscale", "bfl"),
          finishedAt: "2026-10-21T10:01:00.000Z",
        },
      ],
    });
    expect(upscale.generations[0].runsOn).toBe("bfl-api");
  });

  it("strips control characters from its text", () => {
    const card = buildProvenance({
      ...base,
      title: "FIELD\u0000ONE\n video",
      hardware: "RTX\t5090",
    });
    expect(card.title).toBe("FIELD ONE video");
    expect(card.run.hardware).toBe("RTX 5090");
  });
});

describe("provenance renderers", () => {
  it("writes Markdown with every part of the card", () => {
    const card = buildProvenance({
      ...base,
      title: "A | B",
      hashes: { "hero-1": SHA(7) },
    });
    const markdown = provenanceMarkdown(card);
    expect(markdown).toContain("## A \\| B");
    expect(markdown).toContain(
      "**Made with Hermes, only open models.** Tier: Open.",
    );
    expect(markdown).toContain(
      "| Agent | Hermes on deepseek/deepseek-v4.1-flash (Nous inference API, open weights) |",
    );
    expect(markdown).toContain("| Time taken | 3 min 30 s");
    expect(markdown).toContain(
      "estimate $0.905; confirmed $0.900; 190.12 Comfy credits",
    );
    expect(markdown).toContain(
      "| hero-1 | LTX-2.5 Fast · Text to video (`ltx-2-5-fast`) | open | shot | Comfy Router | v1 | $0.517 | $0.510 |",
    );
    expect(markdown).toContain(
      `| hero-1 | hero-1 | video/mp4 | \`${SHA(7)}\` |`,
    );
    expect(markdown).toContain(
      "| detail-1 | detail-1 | video/mp4 | not read |",
    );
    expect(markdown).toContain("none (hosted models only)");
  });

  it("gives the gallery a small summary without ids or hashes", () => {
    const upscale = take("up-1", "flux-video-upscale", "bfl", {
      estimateUsd: 0.99,
    });
    const card = buildProvenance({
      ...base,
      takes: [
        ...base.takes,
        { take: upscale, finishedAt: "2026-10-21T10:03:30.000Z" },
      ],
    });
    const badge = provenanceBadge(card);
    expect(badge).toEqual({
      version: 1,
      title: "FIELD ONE: product video",
      template: "product-video",
      tier: "semi-open",
      tierLabel: "Semi-open",
      madeWith:
        "Made with Hermes, open models and one premium step (FLUX Video Upscale)",
      agent: "Hermes on deepseek/deepseek-v4.1-flash",
      models: ["LTX-2.5 Fast · Text to video", "FLUX Video Upscale"],
      where: "Cloud",
      hardware: "Comfy Router (hosted)",
      seconds: 210,
      costUsd: 1.8953,
      outputs: 3,
    });
    expect(JSON.stringify(badge)).not.toMatch(/hero-1|[0-9a-f]{64}/);
    const claude = buildProvenance({
      ...base,
      agent: {
        harness: "claude-code",
        model: "claude-opus-5-5",
        provider: "anthropic",
      },
    });
    expect(madeWith(claude)).toBe(
      "Made with Claude Code on a premium agent model, open generation models",
    );
    expect(
      madeWith(buildProvenance({ ...base, agent: { harness: "person" } })),
    ).toBe("Made by hand, only open models");
    expect(provenanceTier(claude)).toBe("semi-open");
    expect([duration(5), duration(65), duration(3725)]).toEqual([
      "5 s",
      "1 min 5 s",
      "1 h 2 min 5 s",
    ]);
  });
});
