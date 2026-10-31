import { expect, it, vi } from "vitest";
import type { WorkflowClient } from "../shared/comfy/workflow";
import { GenobiApi, studioUrl } from "../mcp/api";
import { generationBody } from "../mcp/inputs";
import { agentStudio } from "./agent-harness";
import { mcpAgent } from "./mcp-agent-harness";
import { linkAgentProject } from "./agent-project-harness";

const endpoint = "https://approved.run.comfy.app";

it("uses only the staged input session of an explicitly approved deployment quote, discloses billing and submits once", async () => {
  const run = vi.fn<WorkflowClient["run"]>(
    async () => `${endpoint}/api/v2/jobs/approved-job`,
  );
  const fetcher = vi.fn<typeof fetch>(async (target, init) => {
    const url = new URL(String(target));
    expect(url.origin).toBe(endpoint);
    if (init?.method === "HEAD") return new Response(null, { status: 404 });
    expect(url.pathname).toBe("/api/v2/assets");
    return Response.json(
      { id: "staged-asset", created_new: true },
      { status: 201 },
    );
  });
  const studio = await agentStudio({
    app: {
      serverKey: "comfyui-approval-test-key",
      runLocation: { destination: { kind: "deployment", url: endpoint } },
      deploymentFetcher: fetcher,
      workflows: { run, poll: vi.fn(), download: vi.fn() },
    },
  });
  const person = await studio.fresh();
  const { code } = await linkAgentProject(studio.base, person);
  const started = await studio.start(person, "grant hang");
  expect(started.status).toBe(201);
  const [, grant] = await studio.waitFor(
    person,
    started.body.id,
    /^grant ([0-9a-f]{24})$/,
  );
  const api = new GenobiApi(studioUrl(studio.base), fetch, true, grant);
  const agent = await mcpAgent(api);
  const { copyId } = await agent.json("genobi_link_project", { code });
  const image = await agent.json("genobi_deployment_stage", {
    token: "REFERENCE_PNG",
    contentType: "image/png",
    projectAsset: { copyId, assetId: "image-1" },
  });
  const audio = await agent.json("genobi_deployment_stage", {
    token: "TRACK_AUDIO",
    contentType: "audio/wav",
    projectAsset: { copyId, assetId: "audio" },
  });
  const input = {
    generator: "video",
    model: "ltx-deploy-akuspace",
    description: "A quiet hall.",
    presetId: "orbit_l",
    duration: 8,
    resolution: "hd",
    aspectRatio: "16:9",
    draft: false,
    deploy: {
      seed: 12,
      negativePrompt: "No cuts.",
      assets: { REFERENCE_PNG: image.id, TRACK_AUDIO: audio.id },
    },
  };
  const quote = await agent.json("genobi_quote", input);
  const read = await studio.call(person, `/sessions/${started.body.id}`);
  expect(read.body.approvals[0].plan).toMatchObject({
    billing: expect.stringContaining("GPU time"),
    deployment: { url: endpoint, name: "approved" },
  });
  expect(
    read.body.lines.some(
      (line: string) => line.includes("GPU time") && line.includes("approved"),
    ),
  ).toBe(true);
  expect(read.body.lines.some((line: string) => line.includes("$0.00"))).toBe(
    false,
  );
  expect(run).not.toHaveBeenCalled();
  const forbidden = await agent.call("genobi_submit", {
    ...input,
    quoteId: quote.quoteId,
    idempotencyKey: "agent-cannot-approve",
  });
  expect(forbidden.error).toBe(true);
  expect(forbidden.text).toContain("agent_cannot_spend");
  // Merely knowing the tickets never grants the owner the agent's input session.
  const direct = await fetch(`${studio.base}/api/quotes`, {
    method: "POST",
    headers: { cookie: person, "Content-Type": "application/json" },
    body: JSON.stringify(generationBody(input)),
  });
  expect(direct.status).toBe(400);
  expect((await direct.json()).code).toBe("invalid_deployment_input");

  const approve = (quoteId: string, key: string) =>
    studio.call(
      person,
      `/sessions/${started.body.id}/approvals/${quoteId}/approve`,
      { method: "POST", body: {}, headers: { "Idempotency-Key": key } },
    );
  const approved = await approve(quote.quoteId, "owner-approved-deploy");
  expect(approved.status, JSON.stringify(approved.body)).toBe(202);
  expect(run).toHaveBeenCalledOnce();
  expect(JSON.stringify(run.mock.calls[0][1])).toContain("staged-asset");
  const saved = studio.store.data.jobs[0];
  expect(saved.sessionId).toBe(person.slice(15));
  expect(saved.take?.recipe.deployment?.url).toBe(endpoint);
  expect(
    (await approve(quote.quoteId, "owner-approved-deploy")).body.code,
  ).toBe("approval_closed");

  // The trusted input session does not bypass the approved endpoint binding.
  const next = await agent.json("genobi_quote", {
    ...input,
    description: "Another hall.",
  });
  const changed = await fetch(`${studio.base}/api/settings/run-location`, {
    method: "POST",
    headers: { cookie: person, "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "deployment",
      deploymentUrl: "https://other.run.comfy.app",
    }),
  });
  expect(changed.status).toBe(200);
  const refused = await approve(next.quoteId, "changed-endpoint-refused");
  expect(refused.status).toBe(400);
  expect(refused.body.code).toBe("invalid_deployment_input");
  expect(run).toHaveBeenCalledOnce();
});
