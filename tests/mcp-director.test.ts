import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GenobiApi, studioUrl } from "../mcp/api";
import { createServer } from "../mcp/server";
import type { Project } from "../shared/director/types";
import { base } from "./house-template-fixtures";
import { setup } from "./server-harness";

// An agent over MCP against the real local server: it sees nothing until the
// studio's owner links the project, then reads it and sends a command that
// the owner's next push has to build on.
async function linkedStudio() {
  const harness = await setup();
  const { base: url, cookie } = harness;
  const bundle = base();
  const { project } = bundle;
  for (const bytes of new Set(bundle.files.values()))
    await fetch(
      `${url}/api/projects/${project.id}/files/${createHash("sha256").update(bytes).digest("hex")}`,
      {
        method: "PUT",
        headers: { cookie, "Content-Type": "application/octet-stream" },
        body: bytes,
      },
    );
  const owner = (route: string, method: string, body?: unknown) =>
    fetch(`${url}/api/projects/${project.id}${route}`, {
      method,
      headers: { cookie, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).then(
      async (r) =>
        ({
          ...((await r.json()) as object),
          status: r.status,
        }) as Record<string, unknown>,
    );
  expect(
    (await owner("", "PUT", { baseRevision: null, project, brief: null }))
      .status,
  ).toBe(200);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(new GenobiApi(studioUrl(url))).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    const text = result.content[0].text;
    return result.isError
      ? { error: text }
      : (JSON.parse(text) as Record<string, unknown>);
  };
  return { ...harness, project, owner, call, client };
}

describe("Director commands over MCP", () => {
  it("discovers and runs timeline controls against the same protected project revision", async () => {
    const { owner, call, client } = await linkedStudio();
    const { code } = await owner("/link", "POST");
    const { copyId } = await call("genobi_link_project", {
      code: String(code),
    });
    const discovered = (await client.listTools()).tools.find(
      (t) => t.name === "genobi_director_command",
    )!;
    const command = discovered.inputSchema.properties?.command as {
      anyOf: { properties: Record<string, { const?: string }> }[];
    };
    const schemas = command.anyOf.filter((s) => s.properties.op.const);
    expect(schemas.map((s) => s.properties.op.const)).toEqual([
      "remove-clip",
      "duplicate-clip",
      "split-clip",
      "set-muted",
      "set-gain",
    ]);
    expect(
      schemas.find((s) => s.properties.op.const === "split-clip")?.properties,
    ).toHaveProperty("newLayerId");
    const commands = [
      { op: "duplicate-clip", layerId: "plate", newLayerId: "plate-copy" },
      {
        op: "split-clip",
        layerId: "plate-copy",
        frame: 90,
        newLayerId: "plate-end",
      },
      { op: "set-muted", layerId: "plate-end", muted: true },
      { op: "set-gain", layerId: "score", gain: 0.5 },
      { op: "remove-clip", layerId: "plate-end" },
    ];
    for (const [index, command] of commands.entries()) {
      const args = { copyId, baseRevision: index + 1, command };
      expect(await call("genobi_director_command", args)).toMatchObject({
        revision: index + 2,
      });
      expect(await call("genobi_director_command", args)).toEqual({
        error: expect.stringContaining("revision_conflict"),
      });
    }
    expect(
      await call("genobi_director_command", {
        copyId,
        baseRevision: 6,
        command: { op: "remove-clip", layerId: "labels" },
      }),
    ).toEqual({ error: expect.stringContaining("Unlock") });
    const stored = await owner("", "GET");
    expect(stored.revision).toBe(6);
    const project = stored.project as Project;
    expect(project.layers.some((l) => l.id === "plate-end")).toBe(false);
    expect(project.layers.find((l) => l.id === "plate")).toMatchObject({
      startFrame: 0,
      durationFrames: 180,
    });
    expect(project.layers.find((l) => l.id === "score")).toMatchObject({
      gain: 0.5,
    });
    expect(project.assets.video).toBeDefined();
    await client.close();
  });

  it("lists, links, reads and commands the studio's project", async () => {
    const { project, owner, call, client } = await linkedStudio();
    expect(await call("genobi_projects")).toEqual([]);
    // A handle-shaped guess is not access.
    expect(
      await call("genobi_project", { copyId: `${project.id}.aaaaaaaaaa` }),
    ).toEqual({ error: expect.stringContaining("Project not found") });
    const { code } = await owner("/link", "POST");
    const linked = await call("genobi_link_project", { code: String(code) });
    expect(linked).toMatchObject({ id: project.id, revision: 1 });
    const copyId = String(linked.copyId);
    expect(await call("genobi_projects")).toEqual([
      expect.objectContaining({ id: project.id, access: "linked" }),
    ]);
    const read = (await call("genobi_project", {
      copyId,
    })) as {
      revision: number;
      tracks: { track: string; clips: { layerId: string }[] }[];
    };
    expect(read.revision).toBe(1);
    expect(read.tracks.flatMap((t) => t.clips.map((c) => c.layerId))).toEqual(
      project.layers.map((l) => l.id),
    );
    const moved = await call("genobi_director_command", {
      copyId,
      baseRevision: 1,
      command: { op: "move-clip", layerId: "photo-1", startFrame: 0 },
    });
    expect(moved).toMatchObject({ revision: 2 });
    // Repeating it is a conflict, not a second edit.
    expect(
      await call("genobi_director_command", {
        copyId,
        baseRevision: 1,
        command: { op: "move-clip", layerId: "photo-1", startFrame: 0 },
      }),
    ).toEqual({ error: expect.stringContaining("revision_conflict") });
    // A malformed command is refused before it reaches the studio.
    expect(
      await call("genobi_director_command", {
        copyId,
        baseRevision: 2,
        command: { op: "move-clip", layerId: "photo-1" },
      }),
    ).toEqual({ error: expect.stringContaining("needs startFrame") });
    const after = await owner("", "GET");
    expect(after).toMatchObject({ status: 200, revision: 2 });
    await client.close();
  });

  it("reads placement and parameters, and sets them, text included", async () => {
    const { owner, call, client } = await linkedStudio();
    const { code } = await owner("/link", "POST");
    const { copyId } = await call("genobi_link_project", {
      code: String(code),
    });
    type Clip = Record<string, unknown> & { layerId: string };
    type Read = {
      revision: number;
      tracks: { clips: Clip[] }[];
      recipes: { moduleId: string; parameters: Record<string, unknown> }[];
    };
    const read = async () =>
      (await call("genobi_project", { copyId })) as unknown as Read;
    const clip = (r: Read, id: string) =>
      r.tracks.flatMap((t) => t.clips).find((c) => c.layerId === id)!;
    const first = await read();
    expect(clip(first, "photo-1")).toMatchObject({
      placement: {
        position: { x: 0, y: 0 },
        scale: 1,
        opacity: 1,
        rotationDegrees: 0,
        motion: { scaleTo: 1.12, xTo: 0, yTo: 0, opacityTo: 1 },
      },
    });
    expect(clip(first, "plate")).toMatchObject({
      sourceStartFrame: 0,
      placement: { motion: null },
    });
    expect(clip(first, "score")).toMatchObject({
      sourceStartFrame: 0,
      gain: 1,
    });
    expect(clip(first, "title")).toMatchObject({
      parameters: { text: "SIGNAL STUDIES" },
    });
    expect(
      first.recipes.find((r) => r.moduleId === "title")!.parameters,
    ).toHaveProperty("text", { type: "string", maxLength: 80 });
    const send = (baseRevision: number, command: unknown) =>
      call("genobi_director_command", { copyId, baseRevision, command });
    expect(
      await send(1, {
        op: "add-clip",
        layerId: "shot",
        assetId: "video",
        track: "new",
        startFrame: 0,
        durationFrames: 30,
        sourceStartFrame: 20,
      }),
    ).toMatchObject({ revision: 2 });
    expect(
      await send(2, {
        op: "set-placement",
        layerId: "shot",
        motion: { scaleTo: 1.4 },
      }),
    ).toMatchObject({ revision: 3 });
    expect(
      await send(3, {
        op: "set-parameters",
        layerId: "title",
        parameters: { text: "MORPHING TWINS" },
      }),
    ).toMatchObject({ revision: 4 });
    // The recipe's own schema is checked on the server.
    expect(
      await send(4, {
        op: "set-parameters",
        layerId: "title",
        parameters: { font: "W9" },
      }),
    ).toEqual({ error: expect.stringContaining("no parameter font") });
    const last = await read();
    expect(last.revision).toBe(4);
    expect(clip(last, "shot")).toMatchObject({
      sourceStartFrame: 20,
      placement: {
        scale: 1,
        motion: { scaleTo: 1.4, xTo: 0, yTo: 0, opacityTo: 1 },
      },
    });
    expect(clip(last, "title")).toMatchObject({
      parameters: { text: "MORPHING TWINS" },
    });
    await client.close();
  });
  it("returns the person's notes, and adds and resolves notes as the agent", async () => {
    const { project, owner, call, client } = await linkedStudio();
    const note = {
      id: "note-hud",
      frame: 20,
      layerId: "title",
      text: "Move the title lower",
      author: "person",
      createdAt: "2026-10-21T09:30:00.000Z",
    };
    expect(
      (
        await owner("", "PUT", {
          baseRevision: 1,
          project: { ...project, revision: 2, notes: [note] },
          brief: null,
        })
      ).status,
    ).toBe(200);
    const { code } = await owner("/link", "POST");
    const { copyId } = await call("genobi_link_project", {
      code: String(code),
    });
    type Read = { revision: number; notes: Record<string, unknown>[] };
    const read = async () =>
      (await call("genobi_project", { copyId })) as unknown as Read;
    const first = await read();
    expect(first.notes).toEqual([
      {
        noteId: "note-hud",
        frame: 20,
        layerId: "title",
        text: "Move the title lower",
        author: "person",
        createdAt: "2026-10-21T09:30:00.000Z",
        resolved: false,
      },
    ]);
    const send = (baseRevision: number, command: unknown) =>
      call("genobi_director_command", { copyId, baseRevision, command });
    // The agent's note is marked as its own and timed, whatever it claims.
    expect(
      await send(2, {
        op: "add-note",
        noteId: "note-reply",
        frame: 20,
        text: "Moved it 40 px lower",
        layerId: "title",
        author: "person",
      }),
    ).toMatchObject({ revision: 3 });
    expect(
      await send(3, { op: "resolve-note", noteId: "note-hud" }),
    ).toMatchObject({ revision: 4 });
    expect(await send(4, { op: "delete-note", noteId: "note-x" })).toEqual({
      error: expect.stringContaining("No note note-x"),
    });
    expect(
      await send(4, { op: "add-note", noteId: "late", frame: 999, text: "x" }),
    ).toEqual({ error: expect.stringContaining("before the project's") });
    const last = await read();
    expect(last.revision).toBe(4);
    expect(last.notes).toEqual([
      expect.objectContaining({ noteId: "note-hud", resolved: true }),
      expect.objectContaining({
        noteId: "note-reply",
        author: "agent",
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
        resolved: false,
      }),
    ]);
    // The studio's owner reads the same notes from the copy.
    const stored = (await owner("", "GET")) as {
      project?: { notes?: unknown[] };
    };
    expect(stored.project?.notes).toHaveLength(2);
    await client.close();
  });

  it("returns the person's changes since the agent's edit, with their note", async () => {
    const { owner, call, client } = await linkedStudio();
    const { code } = await owner("/link", "POST");
    const { copyId } = await call("genobi_link_project", {
      code: String(code),
    });
    const empty = await call("genobi_project_feedback", { copyId });
    expect(empty).toMatchObject({ baseRevision: null, commands: [] });
    // The agent's edit: the title from frame 30 for four seconds.
    expect(
      await call("genobi_director_command", {
        copyId,
        baseRevision: 1,
        command: {
          op: "trim-clip",
          layerId: "title",
          startFrame: 30,
          durationFrames: 120,
        },
      }),
    ).toMatchObject({ revision: 2 });
    expect(await call("genobi_project", { copyId })).toMatchObject({
      agentRevision: 2,
    });
    // The person moves the title 12 frames later and pins a note to it.
    const stored = (await owner("", "GET")) as unknown as {
      project: Project;
      brief: null;
    };
    const note = {
      id: "note-kick",
      frame: 42,
      layerId: "title",
      text: "Land it on the kick",
      author: "person" as const,
      createdAt: "2026-10-21T09:30:00.000Z",
    };
    const edited: Project = {
      ...stored.project,
      revision: 3,
      layers: stored.project.layers.map((l) =>
        l.id === "title" ? { ...l, startFrame: 42 } : l,
      ),
      notes: [note],
    };
    expect(
      await owner("", "PUT", { baseRevision: 2, project: edited, brief: null }),
    ).toMatchObject({ status: 200, revision: 3 });
    const feedback = await call("genobi_project_feedback", { copyId });
    expect(feedback).toEqual({
      schema: "genobi.director-feedback.v1",
      projectId: "signal-studies",
      baseRevision: 2,
      revision: 3,
      commands: [
        {
          command: { op: "move-clip", layerId: "title", startFrame: 42 },
          label:
            "title SIGNAL STUDIES starts 12 frames (0.8 beats) later, at frame 42 (3 frames before bar 1 beat 4)",
        },
        {
          command: {
            op: "add-note",
            noteId: "note-kick",
            frame: 42,
            text: "Land it on the kick",
            layerId: "title",
            author: "person",
            createdAt: note.createdAt,
          },
          label: expect.stringContaining('"Land it on the kick"'),
        },
      ],
      notes: [note],
      unmapped: [],
    });
    // The agent's next command makes a new base: nothing is outstanding.
    expect(
      await call("genobi_director_command", {
        copyId,
        baseRevision: 3,
        command: { op: "resolve-note", noteId: "note-kick" },
      }),
    ).toMatchObject({ revision: 4 });
    expect(await call("genobi_project_feedback", { copyId })).toMatchObject({
      baseRevision: 4,
      commands: [],
      notes: [],
    });
    await client.close();
  });
});
