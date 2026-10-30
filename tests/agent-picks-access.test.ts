// Picks and context (issue #23): an agent session can read the person's
// picked takes, and only those, through its Genobi MCP server's grant; and
// its studio session quotes under the person's run location. The test acts
// as that MCP server, with the grant the fake runner reports from its config.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Project } from "../shared/director/types";
import { base } from "./house-template-fixtures";
import { ServerKeys } from "../server/keys";
import { agentStudio } from "./agent-harness";
import { input } from "./server-harness";

type Studio = Awaited<ReturnType<typeof agentStudio>>;

/** A run in the person's session, on the fake provider. */
async function run(studio: Studio, cookie: string, description: string) {
  const response = await fetch(`${studio.base}/api/jobs`, {
    method: "POST",
    headers: {
      cookie,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ ...input, description }),
  });
  expect(response.status).toBe(202);
  return (await response.json()).job.id as string;
}

/** Starts a hanging session and acts as its MCP server: mark and grant. */
async function agentOf(studio: Studio, person: string, extra: object = {}) {
  const started = await studio.start(person, "grant hang", extra);
  expect(started.status).toBe(201);
  const [, grant] = await studio.waitFor(
    person,
    started.body.id,
    /^grant ([0-9a-f]{24})$/,
  );
  const marks = { "X-Genobi-Agent-Session": "1", "X-Genobi-Agent-Run": grant };
  const health = await fetch(`${studio.base}/api/health`, { headers: marks });
  const cookie = health.headers.get("set-cookie")!.split(";")[0];
  const send = (route: string, body?: object, headers: object = marks) =>
    fetch(`${studio.base}${route}`, {
      method: body ? "POST" : "GET",
      headers: { ...headers, cookie, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return { id: started.body.id as string, grant, send, marks };
}

const take = (id: string) => ({
  kind: "take",
  id,
  media: "video",
  name: "Picked",
});

describe("an agent session and the person's picks", () => {
  it("reads a picked take, and nothing else of the person's", async () => {
    const studio = await agentStudio();
    const person = await studio.fresh();
    const picked = await run(studio, person, "Picked");
    const other = await run(studio, person, "Not picked");
    const stranger = await studio.fresh();
    const theirs = await run(studio, stranger, "Someone else's");
    const agent = await agentOf(studio, person, {
      context: { picks: [take(picked), take(theirs)] },
    });
    const read = await agent.send(`/api/jobs/${picked}`);
    expect(read.status).toBe(200);
    expect((await read.json()).job.id).toBe(picked);
    // The take route reads the same job (not ready yet, but found).
    expect((await agent.send(`/api/takes/${picked}`)).status).not.toBe(404);
    // An unpicked job of the person's, and a job they do not own, are 404.
    expect((await agent.send(`/api/jobs/${other}`)).status).toBe(404);
    expect((await agent.send(`/api/takes/${other}`)).status).toBe(404);
    expect((await agent.send(`/api/jobs/${theirs}`)).status).toBe(404);
    // Without the grant, the agent's session is on its own.
    expect(
      (
        await agent.send(`/api/jobs/${picked}`, undefined, {
          "X-Genobi-Agent-Session": "1",
        })
      ).status,
    ).toBe(404);
    // Read only: the agent still cannot spend.
    const spend = await agent.send("/api/jobs", input);
    expect(spend.status).toBe(403);
    // Once the session stops, the grant reads nothing.
    await studio.call(person, `/sessions/${agent.id}/stop`, { method: "POST" });
    await studio.settle(person, agent.id);
    expect((await agent.send(`/api/jobs/${picked}`)).status).toBe(404);
  });

  it("quotes under the person's run location", async () => {
    const studio = await agentStudio({
      app: {
        keys: new ServerKeys({
          comfy: "comfyui-test-key-0012",
          bfl: "test-server-key",
        }),
        runLocation: { destination: { kind: "cloud" } },
      },
    });
    const person = await studio.fresh();
    const local = await fetch(`${studio.base}/api/settings/run-location`, {
      method: "POST",
      headers: { cookie: person, "Content-Type": "application/json" },
      body: JSON.stringify({ location: "local" }),
    });
    expect(local.status).toBe(200);
    const agent = await agentOf(studio, person);
    const where = await (await agent.send("/api/settings/run-location")).json();
    expect(where.location).toBe("local");
    const quoted = await agent.send("/api/quotes", {
      ...input,
      model: "ltx-2.5-akuspace",
      duration: 6,
      acoustic: { mode: "room", preset: "empty_club", level: "high" },
    });
    expect(quoted.status).toBe(201);
    const { quote } = await quoted.json();
    expect(quote.recipe.location).toBe("local");
    expect(quote.estimateUsd).toBe(0);
    expect(studio.bfl.submissions).toBe(0);
  });

  it("imports a picked take into the agent's linked project, and no other", async () => {
    const studio = await agentStudio();
    const person = await studio.fresh();
    // The person's project, pushed and offered to the agent with a link code.
    const bundle = base();
    const project = bundle.project as Project;
    for (const bytes of new Set(bundle.files.values()))
      await fetch(
        `${studio.base}/api/projects/${project.id}/files/${createHash("sha256").update(bytes).digest("hex")}`,
        {
          method: "PUT",
          headers: {
            cookie: person,
            "Content-Type": "application/octet-stream",
          },
          body: bytes,
        },
      );
    const projects = (
      route: string,
      cookie: string,
      body?: object,
      headers = {},
    ) =>
      fetch(`${studio.base}/api/projects${route}`, {
        method: body ? (route === `/${project.id}` ? "PUT" : "POST") : "GET",
        headers: { ...headers, cookie, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    expect(
      (
        await projects(`/${project.id}`, person, {
          baseRevision: null,
          project: { ...project, revision: 1 },
          brief: null,
        })
      ).status,
    ).toBe(200);
    const { code } = await (
      await projects(`/${project.id}/link`, person, {})
    ).json();
    // Two finished takes of the person's, on the fake provider.
    studio.bfl.media = new Uint8Array(
      await readFile(path.resolve("tests/fixtures/metadata.mp4")),
    );
    studio.bfl.ready = true;
    const ready = async (description: string) => {
      const id = await run(studio, person, description);
      for (let i = 0; i < 50; i++) {
        const { job } = await (
          await fetch(`${studio.base}/api/jobs/${id}`, {
            headers: { cookie: person },
          })
        ).json();
        if (job.status === "Ready") return id;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("The take did not finish.");
    };
    const picked = await ready("Picked");
    const other = await ready("Not picked");
    const agent = await agentOf(studio, person, {
      context: { picks: [take(picked)] },
    });
    // The agent links the copy as its own session, as genobi_link_project does.
    const linked = await agent.send("/api/projects/link", { code });
    expect(linked.status).toBe(200);
    const copyId = (await linked.json()).project.copyId as string;
    const hand = (jobId: string) =>
      agent.send(`/api/projects/${copyId}/takes`, { jobId, baseRevision: 1 });
    const refused = await hand(other);
    expect(refused.status).toBe(404);
    const added = await hand(picked);
    expect(added.status).toBe(200);
    expect(await added.json()).toMatchObject({
      assetId: `take-${picked}`,
      added: true,
    });
    // The destination is still the agent's own link: an unlinked id is not found.
    const elsewhere = await agent.send(`/api/projects/not-linked/takes`, {
      jobId: picked,
      baseRevision: 2,
    });
    expect(elsewhere.status).toBe(404);
    expect(studio.bfl.submissions).toBe(2);
  });
});
