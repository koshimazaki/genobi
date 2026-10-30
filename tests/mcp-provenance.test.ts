import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GenobiApi, studioUrl } from "../mcp/api";
import { createServer } from "../mcp/server";
import { tools } from "../mcp/tools";
import { readProvenance } from "../shared/provenance-card";
import { estimateRunUsd } from "../shared/quote";
import { houseTemplates } from "../shared/templates/catalogue";
import { planTemplate } from "../shared/templates/plan";
import { hermes, take } from "./provenance-fixtures";

const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CLIP = new TextEncoder().encode("not really an mp4");
const takes = {
  "hero-1": take("hero-1", "ltx-2-5-fast", "router", { actualUsd: 0.51 }),
  "up-1": take("up-1", "flux-video-upscale", "bfl", {
    estimateUsd: 0.99,
    createdAt: "2026-10-21T10:05:00.000Z",
    available: false,
  }),
  // Older than the history's latest 50: read from the job itself.
  "old-1": take("old-1", "ltx-2-5-fast", "router", {
    createdAt: "2026-10-20T09:00:00.000Z",
  }),
  // Its job record is gone: timing cannot be known.
  "lost-1": take("lost-1", "ltx-2-5-fast", "router", {
    createdAt: "2026-10-20T09:00:00.000Z",
  }),
};

/** A stand-in studio with two finished takes, one clip and one project. */
function studio(seen: string[]) {
  return (async (url: URL, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const headers = { "Set-Cookie": `camera_session=${SESSION}; Path=/` };
    // Optional tool history, off: answered as the studio does, and not part of
    // the reads this test checks (tests/mcp-activity.test.ts does).
    if (path === "/api/activity")
      return Response.json({ recorded: false }, { headers });
    seen.push(`${init?.method ?? "GET"} ${path}`);
    if (path === "/api/history")
      return Response.json(
        {
          jobs: [
            { id: "up-1", updatedAt: "2026-10-21T10:07:00.000Z" },
            { id: "hero-1", updatedAt: "2026-10-21T10:02:00.000Z" },
          ],
        },
        { headers },
      );
    const id = path.split("/").at(-1)!;
    if (path.startsWith("/api/takes/"))
      return id in takes
        ? Response.json({ take: takes[id as keyof typeof takes] })
        : Response.json(
            { error: "No take yet.", code: "take_not_ready" },
            { status: 409 },
          );
    if (path === "/api/jobs/old-1")
      return Response.json({
        job: {
          id: "old-1",
          status: "Ready",
          updatedAt: "2026-10-20T09:04:00.000Z",
        },
      });
    if (path === "/api/clips/hero-1")
      return new Response(CLIP, { headers: { "Content-Type": "video/mp4" } });
    if (path === "/api/projects/product-video.k7qm2xrpab")
      return Response.json({
        project: { template: { id: "product-video", inputs: {} } },
      });
    return Response.json({ error: "Not found." }, { status: 404 });
  }) as typeof fetch;
}

const clients: Client[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
});

async function agent() {
  const seen: string[] = [];
  const api = new GenobiApi(studioUrl("http://127.0.0.1:4317"), studio(seen));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(api).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  clients.push(client);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[])[0].text;
    return { error: result.isError === true, text };
  };
  return { call, seen, client };
}

const request = {
  title: "FIELD ONE: two passes",
  jobIds: ["hero-1", "up-1"],
  copyId: "product-video.k7qm2xrpab",
  skill: "plugins/genobi/skills/genobi-hermes/SKILL.md",
  agent: hermes,
  hardware: "Comfy Router and the BFL API (hosted)",
};

describe("genobi_provenance over MCP", () => {
  it("builds a checked card from the takes, hashing what it can read", async () => {
    const { call, seen, client } = await agent();
    const listed = await client.listTools();
    const tool = listed.tools.find((t) => t.name === "genobi_provenance")!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
    const result = await call("genobi_provenance", request);
    expect(result.error, result.text).toBe(false);
    const { card, markdown, badge, unhashed } = JSON.parse(result.text);
    expect(readProvenance(card)).toEqual(card);
    expect(card).toMatchObject({
      template: "product-video",
      tier: "semi-open",
      time: { seconds: 420 },
      cost: { estimateUsd: 1.49, actualUsd: null },
    });
    expect(card.outputs).toEqual([
      expect.objectContaining({
        assetId: "hero-1",
        sha256: createHash("sha256").update(CLIP).digest("hex"),
      }),
      expect.objectContaining({ assetId: "up-1", sha256: null }),
    ]);
    expect(unhashed).toEqual(["up-1: media no longer stored"]);
    expect(markdown).toContain("one premium step (FLUX Video Upscale)");
    expect(badge.tierLabel).toBe("Semi-open");
    // Reads only: no write reached the studio.
    expect(seen.every((line) => line.startsWith("GET "))).toBe(true);
  });

  it("says when a job has no take yet, and refuses a closed claim", async () => {
    const { call } = await agent();
    const early = await call("genobi_provenance", {
      ...request,
      jobIds: ["hero-1", "pending-1"],
    });
    expect(early.error).toBe(true);
    expect(early.text).toMatch(/pending-1 has no take yet/);
    const wrong = await call("genobi_provenance", {
      ...request,
      agent: { ...hermes, open: false },
    });
    expect(wrong.error).toBe(true);
    expect(wrong.text).toMatch(/LICENCES.md records/);
  });
});

describe("genobi_provenance timing", () => {
  it("reads a job outside the history window from the job itself", async () => {
    const { call, seen } = await agent();
    const result = await call("genobi_provenance", {
      ...request,
      jobIds: ["old-1"],
      hashOutputs: false,
    });
    expect(result.error, result.text).toBe(false);
    const { card } = JSON.parse(result.text);
    expect(card.time).toEqual({
      startedAt: "2026-10-20T09:00:00.000Z",
      finishedAt: "2026-10-20T09:04:00.000Z",
      seconds: 240,
    });
    expect(seen).toContain("GET /api/jobs/old-1");
  });

  it("says timing is unavailable rather than using the creation time", async () => {
    const { call } = await agent();
    const result = await call("genobi_provenance", {
      ...request,
      jobIds: ["hero-1", "lost-1"],
      hashOutputs: false,
    });
    expect(result.error, result.text).toBe(false);
    const { card, markdown, badge, timing } = JSON.parse(result.text);
    expect(card.time).toBeNull();
    expect(badge.seconds).toBeNull();
    expect(timing).toMatch(/Unavailable/);
    expect(markdown).toContain("| Time taken | unavailable");
    expect(readProvenance(card)).toEqual(card);
  });
});

describe("genobi_template_plan over MCP", () => {
  it("gives each shot the planner's run as quote arguments, with its price", async () => {
    const { call } = await agent();
    for (const template of houseTemplates) {
      const result = await call("genobi_template_plan", {
        template: template.id,
        inputs: { subject: "a walnut desk radio", title: "WALNUT" },
      });
      expect(result.error, result.text).toBe(false);
      const plan = JSON.parse(result.text);
      const expected = planTemplate(template, {
        subject: "a walnut desk radio",
        title: "WALNUT",
      });
      expect(plan.shots.map((s: { quote: unknown }) => s.quote)).toEqual(
        expected.shots.map((s) =>
          JSON.parse(JSON.stringify({ ...s.input, sourceId: undefined })),
        ),
      );
      expect(plan.estimateUsd).toBeCloseTo(
        expected.shots.reduce((sum, s) => sum + estimateRunUsd(s.input), 0),
      );
      expect(plan.run).toBe(template.run ?? "agent");
    }
  });

  it("takes a project's camera for a shot and refuses an unknown shot", async () => {
    const { call } = await agent();
    const camera = {
      "shot-sizes": "close-up",
      angles: null,
      movements: "static",
    };
    const moved = JSON.parse(
      (
        await call("genobi_template_plan", {
          template: "product-video",
          cameras: { hero: camera },
        })
      ).text,
    );
    expect(moved.shots[0].quote.camera).toEqual(camera);
    const wrong = await call("genobi_template_plan", {
      template: "product-video",
      cameras: { nowhere: camera },
    });
    expect(wrong.error).toBe(true);
    expect(wrong.text).toMatch(/no shot nowhere/);
    expect(tools.find((t) => t.name === "genobi_template_plan")).toBeDefined();
  });
});
