import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GenobiApi, studioUrl } from "../mcp/api";
import { createServer } from "../mcp/server";
import type { Project } from "../shared/director/types";
import { studio } from "./project-copy-harness";
import { input } from "./server-harness";

// The handoff from an agent's take to the person's project. The agent's MCP
// server holds its own studio session, so its clips never reach the person's
// history; genobi_take_to_project copies a take the agent owns into the copy
// the person linked, where the person's studio reads it.
async function agentOn(base: string) {
  const api = new GenobiApi(studioUrl(base));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(api).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[])[0].text;
    return { error: result.isError === true, text };
  };
  return { call, close: () => client.close() };
}

describe("genobi_take_to_project", () => {
  it("copies the agent's own take into the linked copy, where the owner sees it", async () => {
    const owner = await studio();
    const { cookie, upload, push, send, project, bfl, base } = owner;
    await upload(cookie);
    await push(cookie, null, 1);
    const { code } = await send(cookie, `/${project.id}/link`, "POST");
    const agent = await agentOn(base);
    try {
      const linked = JSON.parse(
        (await agent.call("genobi_link_project", { code })).text,
      );
      const copyId = linked.copyId as string;
      // A finished take, made in the agent's own session (fake provider).
      const clip = await readFile(path.resolve("tests/fixtures/metadata.mp4"));
      bfl.media = new Uint8Array(clip);
      bfl.ready = true;
      const quote = JSON.parse((await agent.call("genobi_quote", input)).text);
      const job = JSON.parse(
        (
          await agent.call("genobi_submit", {
            ...input,
            quoteId: quote.quoteId,
            idempotencyKey: "handoff-run-0001",
          })
        ).text,
      );
      const ready = JSON.parse(
        (await agent.call("genobi_job", { id: job.id })).text,
      );
      expect(ready.status).toBe("Ready");
      // The person's own session never sees the agent's job.
      const history = await (
        await fetch(`${base}/api/history`, { headers: { cookie } })
      ).json();
      expect(history.jobs).toEqual([]);

      const stale = await agent.call("genobi_take_to_project", {
        id: job.id,
        copyId,
        baseRevision: 9,
      });
      expect(stale.error).toBe(true);
      expect(stale.text).toMatch(/Read the project again/);

      const handed = await agent.call("genobi_take_to_project", {
        id: job.id,
        copyId,
        baseRevision: 1,
      });
      expect(handed.error, handed.text).toBe(false);
      const added = JSON.parse(handed.text);
      expect(added).toMatchObject({
        assetId: `take-${job.id}`,
        revision: 2,
        added: true,
      });

      // The owner reads it through the copy, bytes and backlink included.
      const read = await send(cookie, `/${project.id}`);
      const copy = read.project as Project;
      const asset = copy.assets[added.assetId];
      const sha = createHash("sha256").update(clip).digest("hex");
      expect(asset).toMatchObject({
        kind: "video",
        use: "production",
        origin: "generated",
        file: { sha256: sha },
      });
      expect(asset.durationSeconds).toBeGreaterThan(9);
      expect(copy.generations.at(-1)).toMatchObject({
        id: asset.generationId,
        outputAssetIds: [added.assetId],
      });
      const bytes = await fetch(
        `${base}/api/projects/${project.id}/files/${sha}`,
        { headers: { cookie } },
      );
      expect(Buffer.from(await bytes.arrayBuffer()).equals(clip)).toBe(true);
      // The agent's own take is its revision, not the person's feedback.
      expect(copy.feedbackBase?.project.revision).toBe(2);
      expect(
        JSON.parse(
          (await agent.call("genobi_project_feedback", { copyId })).text,
        ),
      ).toMatchObject({ baseRevision: 2, commands: [], unmapped: [] });

      // Handing the same take in again names the same asset.
      const again = JSON.parse(
        (
          await agent.call("genobi_take_to_project", {
            id: job.id,
            copyId,
            baseRevision: 2,
          })
        ).text,
      );
      expect(again).toMatchObject({ assetId: added.assetId, added: false });

      // And the agent can place it where a plate stood.
      const placed = await agent.call("genobi_director_command", {
        copyId,
        baseRevision: 2,
        command: {
          op: "replace-plate",
          layerId: "photo-1",
          assetId: added.assetId,
        },
      });
      expect(placed.error, placed.text).toBe(false);
      const after = (await send(cookie, `/${project.id}`)).project as Project;
      expect(after.layers.find((l) => l.id === "photo-1")).toMatchObject({
        kind: "video",
        assetId: added.assetId,
      });
    } finally {
      await agent.close();
    }
  });

  it("refuses a job the session does not own, and a malformed request", async () => {
    const owner = await studio();
    const { cookie, upload, push, project, base } = owner;
    await upload(cookie);
    await push(cookie, null, 1);
    const agent = await agentOn(base);
    try {
      const copyId = `${project.id}.abcdefghjk`;
      const missing = await agent.call("genobi_take_to_project", {
        id: "someone-elses-job",
        copyId,
        baseRevision: 1,
      });
      expect(missing.error).toBe(true);
      expect(missing.text).toMatch(/Job not found/);
    } finally {
      await agent.close();
    }
    const raw = await fetch(`${base}/api/projects/${project.id}/takes`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "x", baseRevision: 1, extra: true }),
    });
    expect(raw.status).toBe(400);
  });
});
