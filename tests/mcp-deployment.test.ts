import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { GenobiApi, studioUrl } from "../mcp/api";
import { tools } from "../mcp/tools";
import { commandSchema, commandTool } from "../cli/commands";
import { WorkflowDestinations } from "../server/workflow-destinations";
import { NotYetWorkflow } from "../shared/comfy/workflow";
import { mcpAgent } from "./mcp-agent-harness";
import { studio } from "./project-copy-harness";
import { wav } from "./audio-fixtures";

const endpoint = "https://agent-fixture.run.comfy.app";
const input = {
  generator: "video",
  model: "ltx-deploy-akuspace",
  description: "A quiet gallery.",
  presetId: "orbit_l",
  cameraEnabled: false,
  duration: 8,
  resolution: "hd",
  aspectRatio: "16:9",
  draft: false,
};

describe("MCP deployment lifecycle", () => {
  it("registers, stages scoped media, quotes and submits once through the real HTTP routes and SDK", async () => {
    const submitted: Record<string, unknown>[] = [];
    let uploads = 0;
    const fetcher = vi.fn<typeof fetch>(async (target, init) => {
      const url = new URL(String(target));
      expect(url.origin).toBe(endpoint);
      if (url.pathname.includes("/assets/by-hash/") && init?.method === "HEAD")
        return new Response(null, { status: 404 });
      if (url.pathname === "/api/v2/assets") {
        uploads++;
        return Response.json(
          { id: `asset-${uploads}`, created_new: true },
          { status: 201 },
        );
      }
      if (url.pathname === "/api/v2/jobs" && init?.method === "POST") {
        submitted.push(JSON.parse(String(init.body)));
        return Response.json(
          {
            id: "fixture-job",
            status: "queued",
            created_at: "2026-10-30T00:00:00Z",
            started_at: null,
            completed_at: null,
            expires_at: "2026-10-31T00:00:00Z",
            queue_position: null,
            progress: null,
            outputs: [],
            error: null,
            urls: { self: "/api/v2/jobs/fixture-job", events: "", cancel: "" },
          },
          { status: 201 },
        );
      }
      throw new Error(`Unexpected deployment request: ${url.pathname}`);
    });
    const owner = await studio(undefined, {
      serverKey: "comfyui-test-key",
      deploymentFetcher: fetcher,
      workflows: new WorkflowDestinations(new NotYetWorkflow(), { fetcher }),
    });
    await owner.upload(owner.cookie);
    await owner.push(owner.cookie, null, 1);
    const agent = await mcpAgent(owner.base);
    expect(
      await agent.json("genobi_run_location", {
        location: "deployment",
        deploymentUrl: endpoint,
      }),
    ).toMatchObject({ deployment: { url: endpoint }, location: "deployment" });
    expect(fetcher).not.toHaveBeenCalled();
    const { code } = await owner.send(
      owner.cookie,
      `/${owner.project.id}/link`,
      "POST",
    );
    const { copyId } = await agent.json("genobi_link_project", { code });
    const image = await agent.json("genobi_deployment_stage", {
      token: "REFERENCE_PNG",
      contentType: "image/png",
      projectAsset: { copyId, assetId: "image-1" },
    });
    const audioPath = path.join(owner.directory, "agent-track.wav");
    await writeFile(audioPath, wav(8));
    const audio = await agent.json("genobi_deployment_stage", {
      token: "TRACK_AUDIO",
      contentType: "audio/wav",
      filePath: audioPath,
    });
    expect(image).toMatchObject({
      token: "REFERENCE_PNG",
      maxAgeSeconds: 7200,
    });
    expect(uploads).toBe(2);
    const request = {
      ...input,
      deploy: {
        seed: 42,
        negativePrompt: "No cuts.",
        assets: { REFERENCE_PNG: image.id, TRACK_AUDIO: audio.id },
      },
    };
    const quote = await agent.json("genobi_quote", request);
    expect(quote.billing).toContain("GPU time");
    expect(quote.recipe.deployment.url).toBe(endpoint);
    expect(submitted).toHaveLength(0);
    const run = {
      ...request,
      quoteId: quote.quoteId,
      idempotencyKey: "mcp-deployment-0001",
    };
    const made = await agent.json("genobi_submit", run);
    expect(await agent.json("genobi_submit", run)).toMatchObject({
      id: made.id,
    });
    expect(submitted).toHaveLength(1);
    expect(JSON.stringify(submitted[0])).toContain("asset-1");
    expect(JSON.stringify(submitted[0])).toContain("asset-2");
    expect(JSON.stringify(submitted[0])).not.toContain(image.id);
    expect(
      await readFile(path.join(owner.directory, "jobs.json"), "utf8"),
    ).not.toContain("comfyui-test-key");

    const other = await mcpAgent(owner.base);
    await other.json("genobi_run_location", {
      location: "deployment",
      deploymentUrl: endpoint,
    });
    const stolen = await other.call("genobi_quote", request);
    expect(stolen.error).toBe(true);
    expect(stolen.text).toContain("Reattach");
    await agent.json("genobi_run_location", {
      location: "deployment",
      deploymentUrl: "https://changed.run.comfy.app",
    });
    const changed = await agent.call("genobi_quote", request);
    expect(changed.error).toBe(true);
    expect(changed.text).toContain("Reattach");
    expect(submitted).toHaveLength(1);
  });

  it("keeps staging source schemas and file access restrictions identical in the CLI", async () => {
    const tool = commandTool(["deployment", "stage"], true);
    expect(tool.name).toBe("genobi_deployment_stage");
    const schema = commandSchema(tool);
    expect(
      schema.safeParse({ token: "TRACK_AUDIO", contentType: "audio/wav" })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({
        token: "TRACK_AUDIO",
        contentType: "audio/wav",
        filePath: "/tmp/audio.wav",
        projectAsset: { copyId: "project.abcdefghjk", assetId: "audio" },
      }).success,
    ).toBe(false);
    const fetcher = vi.fn<typeof fetch>();
    const api = new GenobiApi(studioUrl(), fetcher, true);
    await expect(
      tool.run(api, {
        token: "TRACK_AUDIO",
        contentType: "audio/wav",
        filePath: "/etc/passwd",
      }),
    ).rejects.toThrow("linked project");
    expect(fetcher).not.toHaveBeenCalled();
    const location = tools.find((t) => t.name === "genobi_run_location")!;
    await expect(
      location.run(api, {
        location: "deployment",
        deploymentUrl: "http://169.254.169.254/",
      }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
