// Picks and context through the agent's real tools (issue #23): the Genobi
// MCP server, built as a studio-started session builds it (agent mark and
// the session's grant), links the person's project, hands a picked take into
// it with genobi_take_to_project and quotes an upscale of it with
// genobi_quote. Unpicked takes stay out of reach. Fake provider only.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GenobiApi, studioUrl } from "../mcp/api";
import { createServer } from "../mcp/server";
import { GENOBI_TOOLS } from "../server/agent-runner";
import type { Project } from "../shared/director/types";
import { agentStudio } from "./agent-harness";
import { base } from "./house-template-fixtures";
import { input } from "./server-harness";

type Studio = Awaited<ReturnType<typeof agentStudio>>;

/** A finished take in the person's session, on the fake provider. */
async function finished(studio: Studio, cookie: string, description: string) {
  const made = await fetch(`${studio.base}/api/jobs`, {
    method: "POST",
    headers: {
      cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ ...input, description }),
  });
  const id = (await made.json()).job.id as string;
  for (let i = 0; i < 50; i++) {
    const { job } = await (
      await fetch(`${studio.base}/api/jobs/${id}`, { headers: { cookie } })
    ).json();
    if (job.status === "Ready") return id;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The take did not finish.");
}

/** The person's project, pushed, with a link code for the agent. */
async function linkCode(studio: Studio, cookie: string) {
  const bundle = base();
  const project = bundle.project as Project;
  for (const bytes of new Set(bundle.files.values()))
    await fetch(
      `${studio.base}/api/projects/${project.id}/files/${createHash("sha256").update(bytes).digest("hex")}`,
      {
        method: "PUT",
        headers: { cookie, "Content-Type": "application/octet-stream" },
        body: bytes,
      },
    );
  const send = (route: string, method: string, body: object) =>
    fetch(`${studio.base}/api/projects${route}`, {
      method,
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  await send(`/${project.id}`, "PUT", {
    baseRevision: null,
    project: { ...project, revision: 1 },
    brief: null,
  });
  return (await (await send(`/${project.id}/link`, "POST", {})).json())
    .code as string;
}

describe("a studio-started agent and the person's picks, through its tools", () => {
  it("may call genobi_take_to_project", () => {
    expect(GENOBI_TOOLS).toContain("genobi_take_to_project");
    expect(GENOBI_TOOLS).not.toContain("genobi_submit");
  });

  it("hands a picked take into the linked project and quotes its upscale; unpicked ones are not found", async () => {
    const studio = await agentStudio();
    const person = await studio.fresh();
    const code = await linkCode(studio, person);
    studio.bfl.media = new Uint8Array(
      await readFile(path.resolve("tests/fixtures/metadata.mp4")),
    );
    studio.bfl.ready = true;
    const picked = await finished(studio, person, "Picked");
    const other = await finished(studio, person, "Not picked");
    const started = await studio.start(person, "grant hang", {
      context: {
        picks: [{ kind: "take", id: picked, media: "video", name: "Picked" }],
      },
    });
    const [, grant] = await studio.waitFor(
      person,
      started.body.id,
      /^grant ([0-9a-f]{24})$/,
    );
    // The session's Genobi MCP server: agent-marked, with its grant.
    const api = new GenobiApi(studioUrl(studio.base), fetch, true, grant);
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(api).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      const text = (result.content as { text: string }[])[0].text;
      return { error: result.isError === true, text };
    };
    try {
      const linked = JSON.parse(
        (await call("genobi_link_project", { code })).text,
      );
      const copyId = linked.copyId as string;
      const unpicked = await call("genobi_take_to_project", {
        id: other,
        copyId,
        baseRevision: 1,
      });
      expect(unpicked.error).toBe(true);
      const handed = await call("genobi_take_to_project", {
        id: picked,
        copyId,
        baseRevision: 1,
      });
      expect(handed.error, handed.text).toBe(false);
      expect(JSON.parse(handed.text)).toMatchObject({
        assetId: `take-${picked}`,
        added: true,
      });
      const upscale = (sourceId: string) =>
        call("genobi_quote", {
          ...input,
          generator: "upscale",
          sourceId,
          upscaleFactor: 2,
        });
      const quoted = await upscale(picked);
      expect(quoted.error, quoted.text).toBe(false);
      expect(JSON.parse(quoted.text).estimateUsd).toBeGreaterThan(0);
      // The quote is the agent's own: the person's session does not hold it.
      const quoteId = JSON.parse(quoted.text).quoteId as string;
      const record = studio.store.data.quotes.find((q) => q.id === quoteId);
      expect(record?.sessionId).not.toBe(
        studio.store.data.jobs.find((j) => j.id === picked)?.sessionId,
      );
      const refused = await upscale(other);
      expect(refused.error).toBe(true);
      expect(refused.text).toMatch(/Choose a video from this session/);
    } finally {
      await client.close();
    }
    expect(studio.bfl.submissions).toBe(2);
  });
});
