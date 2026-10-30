// Picks and context (issue #23), what a session start keeps: a catalogue
// clip as "these settings"' upscale source (public, so kept without a read
// grant), and asset picks of the linked project only, with a note for the
// ones left out. Fake runner and provider only.
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentContext } from "../shared/agent-context";
import type { Project } from "../shared/director/types";
import { agentStudio } from "./agent-harness";
import { base } from "./house-template-fixtures";
import { input } from "./server-harness";

const asset = (id: string, projectId: string) => ({
  kind: "asset" as const,
  id,
  media: "audio" as const,
  name: `${id}.wav`,
  projectId,
});

describe("what a session start keeps", () => {
  it("keeps a library clip as the upscale source, and those settings quote", async () => {
    const studio = await agentStudio({
      app: { publicDirectory: path.resolve("public") },
    });
    const person = await studio.fresh();
    const settings = {
      generator: "upscale",
      model: "flux-3",
      duration: 5,
      aspectRatio: "16:9",
      resolution: "hd",
      draft: false,
      cameraEnabled: false,
      camera: { "shot-sizes": null, angles: null, movements: null },
      upscaleFactor: 2,
      upscaleCreativity: 0,
      sourceId: "library-02",
    } as const;
    const started = await studio.start(person, "echo grant hang", {
      context: { picks: [], settings },
    });
    const [, grant] = await studio.waitFor(
      person,
      started.body.id,
      /^grant ([0-9a-f]{24})$/,
    );
    await studio.waitFor(
      person,
      started.body.id,
      /^context picks= settings=flux-3 source=library-02$/,
    );
    // "These settings", quoted by the agent as they came, are accepted.
    const marks = {
      "X-Genobi-Agent-Session": "1",
      "X-Genobi-Agent-Run": grant,
    };
    const health = await fetch(`${studio.base}/api/health`, { headers: marks });
    const cookie = health.headers.get("set-cookie")!.split(";")[0];
    const quoted = await fetch(`${studio.base}/api/quotes`, {
      method: "POST",
      headers: { ...marks, cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, description: "" }),
    });
    expect(quoted.status, await quoted.clone().text()).toBe(201);
    expect(studio.bfl.submissions).toBe(0);
  });

  it("leaves out a source that is neither the person's nor in the catalogue", async () => {
    const studio = await agentStudio({
      app: { publicDirectory: path.resolve("public") },
    });
    const person = await studio.fresh();
    const started = await studio.start(person, "echo", {
      context: {
        picks: [],
        settings: {
          ...input,
          generator: "upscale",
          model: "flux-3",
          sourceId: "made-up",
        },
      },
    });
    const done = await studio.settle(person, started.body.id);
    expect(done.lines).toContain("context picks= settings=flux-3");
  });

  it("offers asset picks of the linked project only, and says what it left out", async () => {
    const studio = await agentStudio();
    const person = await studio.fresh();
    // The person's open project, which the session links.
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
    await fetch(`${studio.base}/api/projects/${project.id}`, {
      method: "PUT",
      headers: { cookie: person, "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRevision: null,
        project: { ...project, revision: 1 },
        brief: null,
      }),
    });
    const context: AgentContext = {
      picks: [asset("harbour", "harbour-cut"), asset("audio", project.id)],
    };
    const started = await studio.start(person, "echo: use my last two picks", {
      context,
      copyId: project.id,
    });
    expect(started.status).toBe(201);
    const done = await studio.settle(person, started.body.id);
    expect(done.lines).toContain(
      "context picks=audio settings=none note=1 pick from another project was left out; open that project to use it.",
    );
    expect(done.lines).toContain(
      `prompt echo: use my last two picks [asset audio “audio.wav” (audio, project ${project.id}); only 1 pick in the studio]`,
    );
    // With no project linked, no asset pick is offered.
    const unlinked = await studio.start(person, "echo", { context });
    const alone = await studio.settle(person, unlinked.body.id);
    expect(alone.lines).toContain(
      "context picks= settings=none note=2 picks from another project were left out; open that project to use them.",
    );
  });

  it("launches only the per-owner and machine limits when starts race a catalogue lookup", async () => {
    const studio = await agentStudio({
      app: { publicDirectory: path.resolve("public") },
    });
    const context = {
      picks: [],
      settings: {
        ...input,
        generator: "upscale",
        model: "flux-3",
        sourceId: "library-02",
      },
    };
    const person = await studio.fresh();
    const same = await Promise.all(
      Array.from({ length: 4 }, () =>
        studio.start(person, "hang", { context }),
      ),
    );
    expect(same.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    expect(
      same
        .filter((r) => r.status === 409)
        .every((r) => r.body.code === "agent_busy"),
    ).toBe(true);
    // Three other people at once: one more slot on the machine.
    const others = await Promise.all(
      Array.from({ length: 3 }, async () =>
        studio.start(await studio.fresh(), "hang", { context }),
      ),
    );
    expect(others.map((r) => r.status).sort()).toEqual([201, 429, 429]);
  });
});
