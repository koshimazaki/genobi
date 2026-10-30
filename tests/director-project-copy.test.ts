import { describe, expect, it } from "vitest";
import {
  applyEvent,
  copyAvailable,
  pushCopy,
  readCopy,
} from "../src/director/project-copy";
import { readBrief } from "../src/director/prompt-brief";
import { base } from "./house-template-fixtures";
import { setup } from "./server-harness";

// The studio's client against the real local server: it pushes files then
// the manifest, learns of a conflict, reads the copy back with its own bytes,
// and applies a streamed command to the same project the server stored.
async function client() {
  const harness = await setup();
  const fetcher = ((input: string, init: RequestInit = {}) =>
    fetch(`${harness.base}${input}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        cookie: harness.cookie,
      },
    })) as typeof fetch;
  return { ...harness, fetcher };
}

describe("the studio's project copy client", () => {
  it("finds no copy on the hosted Worker or a bare Vite preview", async () => {
    const answer = (body: string, status: number) =>
      (async () => new Response(body, { status })) as unknown as typeof fetch;
    expect(
      await copyAvailable(answer('{"error":"API route not found."}', 404)),
    ).toBe(false);
    expect(await copyAvailable(answer("<!doctype html>", 200))).toBe(false);
    expect(await copyAvailable(answer('{"projects":[]}', 200))).toBe(true);
  });

  it("pushes, reports a stale base and reads the copy back", async () => {
    const { fetcher } = await client();
    expect(await copyAvailable(fetcher)).toBe(true);
    const bundle = base();
    const uploaded = new Set<string>();
    expect(await pushCopy(bundle, null, uploaded, fetcher)).toEqual({
      ok: true,
      revision: 1,
    });
    expect(uploaded.size).toBeGreaterThan(0);
    // A second page with no base meets the stored revision.
    expect(await pushCopy(bundle, null, new Set(), fetcher)).toEqual({
      ok: false,
      revision: 1,
    });
    const back = await readCopy(bundle.project.id, undefined, fetcher);
    expect(back.project).toEqual(bundle.project);
    // Buffer.compare checks the ~900 KB of fixture media in native code;
    // toEqual walks a typed array byte by byte (over a second when idle,
    // past the timeout when the machine is busy).
    for (const [path, bytes] of back.files)
      expect(Buffer.compare(bytes, bundle.files.get(path)!), path).toBe(0);
  });

  it("uploads again what a server lost", async () => {
    const { fetcher } = await client();
    const bundle = base();
    // This page believes every file is already there.
    const uploaded = new Set<string>(
      Object.values(bundle.project.assets).map((a) => a.file.sha256),
    );
    expect(await pushCopy(bundle, null, uploaded, fetcher)).toMatchObject({
      ok: true,
    });
  });

  it("applies a streamed command exactly as the server did", async () => {
    const { fetcher } = await client();
    const bundle = base();
    await pushCopy(bundle, null, new Set(), fetcher);
    const command = { op: "set-prompt", text: "Hold on the title" };
    const response = await fetcher(
      `/api/projects/${bundle.project.id}/commands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRevision: 1, command }),
      },
    );
    expect(response.status).toBe(200);
    const event = {
      projectId: bundle.project.id,
      revision: 2,
      baseRevision: 1,
      source: "command" as const,
      command: command as never,
    };
    const next = applyEvent(bundle, event)!;
    expect(next.project.revision).toBe(2);
    expect(readBrief(next).text).toBe("Hold on the title");
    const stored = await readCopy(bundle.project.id, bundle, fetcher);
    expect(next.project).toEqual(stored.project);
    // Another base means the studio moved on: reload instead.
    expect(applyEvent(next, event)).toBeUndefined();
  });

  it("keeps the global and clip prompts through the copy and its commands", async () => {
    const { fetcher } = await client();
    const bundle = base();
    bundle.project = {
      ...bundle.project,
      globalPrompt: "Cold mist over stone",
      layers: bundle.project.layers.map((l) =>
        l.id === "plate"
          ? { ...l, prompt: "Slow reveal", directions: { lens: "35mm" } }
          : l,
      ),
    } as typeof bundle.project;
    await pushCopy(bundle, null, new Set(), fetcher);
    expect(
      (await readCopy(bundle.project.id, bundle, fetcher)).project,
    ).toEqual(bundle.project);
    const command = {
      op: "set-clip-directions",
      layerId: "plate",
      directions: { shot: "wide" },
    };
    const response = await fetcher(
      `/api/projects/${bundle.project.id}/commands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRevision: 1, command }),
      },
    );
    expect(response.status).toBe(200);
    const next = applyEvent(bundle, {
      projectId: bundle.project.id,
      revision: 2,
      baseRevision: 1,
      source: "command" as const,
      command: command as never,
    })!;
    const stored = await readCopy(bundle.project.id, bundle, fetcher);
    expect(next.project).toEqual(stored.project);
    expect(stored.project.layers.find((l) => l.id === "plate")).toMatchObject({
      prompt: "Slow reveal",
      directions: { lens: "35mm", shot: "wide" },
    });
    // The server refuses a manifest whose prompt the schema refuses.
    const bad = await fetcher(`/api/projects/${bundle.project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRevision: 2,
        project: { ...stored.project, revision: 3, globalPrompt: "a\x07" },
        brief: null,
      }),
    });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(await bad.json())).toMatch(/globalPrompt/);
  });

  it("reaches the server's bytes after placement, parameters and an in-point", async () => {
    const { fetcher } = await client();
    let bundle = base();
    await pushCopy(bundle, null, new Set(), fetcher);
    const commands = [
      {
        op: "add-clip",
        layerId: "shot",
        assetId: "video",
        track: "new",
        startFrame: 0,
        durationFrames: 60,
        sourceStartFrame: 45,
      },
      {
        op: "set-placement",
        layerId: "shot",
        scale: 1.2,
        motion: { scaleTo: 1.5, xTo: 30, yTo: -10 },
      },
      {
        op: "set-parameters",
        layerId: "title",
        parameters: { text: "MORPHING TWINS", size: 64 },
      },
    ];
    for (const [i, command] of commands.entries()) {
      const response = await fetcher(
        `/api/projects/${bundle.project.id}/commands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseRevision: i + 1, command }),
        },
      );
      expect(response.status).toBe(200);
      bundle = applyEvent(bundle, {
        projectId: bundle.project.id,
        revision: i + 2,
        baseRevision: i + 1,
        source: "command",
        command: command as never,
      })!;
      expect(bundle.project.revision).toBe(i + 2);
    }
    const stored = await readCopy(bundle.project.id, bundle, fetcher);
    expect(JSON.stringify(bundle.project)).toBe(JSON.stringify(stored.project));
    const title = stored.project.layers.find((l) => l.id === "title");
    expect(title && "parameters" in title && title.parameters.text).toBe(
      "MORPHING TWINS",
    );
  });
  it("keeps notes through a push and reaches the server's bytes after note commands", async () => {
    const { fetcher } = await client();
    let bundle = base();
    const note = {
      id: "note-title",
      frame: 30,
      layerId: "title",
      text: "Extend this title by a beat",
      author: "person" as const,
      createdAt: "2026-10-21T09:30:00.000Z",
    };
    bundle = { ...bundle, project: { ...bundle.project, notes: [note] } };
    await pushCopy(bundle, null, new Set(), fetcher);
    expect(
      (await readCopy(bundle.project.id, undefined, fetcher)).project.notes,
    ).toEqual([note]);
    const commands = [
      {
        op: "add-note",
        noteId: "note-agent",
        frame: 45,
        text: "Done: the title ends on the next beat",
        author: "agent",
        createdAt: "2026-10-21T09:31:00.000Z",
      },
      { op: "resolve-note", noteId: "note-title" },
      { op: "delete-note", noteId: "note-agent" },
    ];
    for (const [i, command] of commands.entries()) {
      const response = await fetcher(
        `/api/projects/${bundle.project.id}/commands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseRevision: i + 1, command }),
        },
      );
      expect(response.status).toBe(200);
      bundle = applyEvent(bundle, {
        projectId: bundle.project.id,
        revision: i + 2,
        baseRevision: i + 1,
        source: "command",
        command: command as never,
      })!;
      const stored = await readCopy(bundle.project.id, bundle, fetcher);
      expect(JSON.stringify(bundle.project)).toBe(
        JSON.stringify(stored.project),
      );
    }
    expect(bundle.project.notes).toEqual([{ ...note, resolved: true }]);
  });
});
