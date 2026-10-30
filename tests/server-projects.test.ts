import { describe, expect, it } from "vitest";
import type { Project } from "../shared/director/types";
import { eventStream, studio } from "./project-copy-harness";

// The project copy on the local adapter: the owner pushes revisions on top of
// the one it last saw, a stale base is a conflict, another session sees
// nothing until the owner links it, and every write reaches the stream.
describe("the project copy", () => {
  it("stores a validated bundle once its files are uploaded, at the owner's revisions", async () => {
    const {
      cookie,
      send,
      upload,
      push,
      project,
      directory,
      base: url,
    } = await studio();
    const early = await push(cookie, null, 1);
    expect(early).toMatchObject({ status: 409, code: "files_missing" });
    expect((early.missing as string[]).length).toBeGreaterThan(0);
    await upload(cookie);
    expect(await push(cookie, null, 1)).toMatchObject({
      status: 200,
      revision: 1,
    });
    const read = await send(cookie, `/${project.id}`);
    expect(read).toMatchObject({ status: 200, revision: 1, brief: null });
    expect((read.project as Project).layers).toEqual(project.layers);
    expect((await send(cookie, "")).projects).toEqual([
      expect.objectContaining({
        id: project.id,
        revision: 1,
        access: "owner",
      }),
    ]);
    // Stored under the server's data directory, not in the request's words.
    expect(directory).toMatch(/\.local$/);
    // A broken manifest is refused before anything is stored.
    expect(
      await push(cookie, 1, 2, { layers: [{ id: "x" }] as never }),
    ).toMatchObject({ status: 400, code: "invalid_project" });
    // A file is stored only under its own hash.
    const wrong = await fetch(
      `${url}/api/projects/${project.id}/files/${"0".repeat(64)}`,
      {
        method: "PUT",
        headers: { cookie, "Content-Type": "application/octet-stream" },
        body: new Uint8Array([1, 2, 3]),
      },
    );
    expect(wrong.status).toBe(400);
  });

  it("refuses a push whose base revision is stale, with the current revision", async () => {
    const { cookie, upload, push } = await studio();
    await upload(cookie);
    await push(cookie, null, 1);
    expect(await push(cookie, 1, 4)).toMatchObject({
      status: 200,
      revision: 4,
    });
    for (const [baseRevision, revision] of [
      [null, 5],
      [1, 5],
      [4, 4],
      [4, 3],
    ] as const)
      expect(await push(cookie, baseRevision, revision)).toMatchObject({
        status: 409,
        code: "revision_conflict",
        revision: 4,
      });
  });

  it("is invisible to another session until the owner links it with a one-use code", async () => {
    const {
      cookie,
      fresh,
      send,
      upload,
      push,
      project,
      base: url,
    } = await studio();
    await upload(cookie);
    await push(cookie, null, 1);
    const agent = await fresh();
    expect((await send(agent, "")).projects).toEqual([]);
    const command = {
      baseRevision: 1,
      command: { op: "move-clip", layerId: "photo-1", startFrame: 0 },
    };
    for (const [route, method, body] of [
      [`/${project.id}`, "GET"],
      [`/${project.id}/commands`, "POST", command],
      [`/${project.id}/link`, "POST"],
    ] as const)
      expect(await send(agent, route, method, body)).toMatchObject({
        status: 404,
      });
    const events = await fetch(`${url}/api/projects/${project.id}/events`, {
      headers: { cookie: agent },
    });
    expect(events.status).toBe(404);
    const link = await send(cookie, `/${project.id}/link`, "POST");
    expect(link.code).toMatch(/^[A-Z2-9]{8}$/);
    const linked = await send(agent, "/link", "POST", { code: link.code });
    expect(linked).toMatchObject({
      status: 200,
      project: { id: project.id, revision: 1 },
    });
    const handle = (linked.project as { copyId: string }).copyId;
    expect(handle).toMatch(new RegExp(`^${project.id}\\.[a-z2-9]{10}$`));
    // A linked session uses the copy's handle; the bare id names only its own.
    expect(await send(agent, `/${project.id}`)).toMatchObject({ status: 404 });
    expect(
      await send(agent, "/link", "POST", { code: link.code }),
    ).toMatchObject({ status: 404, code: "link_missing" });
    expect((await send(agent, "")).projects).toEqual([
      expect.objectContaining({
        id: project.id,
        copyId: handle,
        access: "linked",
      }),
    ]);
    expect(
      await send(agent, `/${handle}/commands`, "POST", command),
    ).toMatchObject({ status: 200, revision: 2 });
    // The same base again is stale now; the refusal names the revision.
    expect(
      await send(agent, `/${handle}/commands`, "POST", command),
    ).toMatchObject({ status: 409, code: "revision_conflict", revision: 2 });
    expect(
      await send(agent, `/${handle}/commands`, "POST", {
        baseRevision: 2,
        command: { op: "move-clip", layerId: "labels", startFrame: 0 },
      }),
    ).toMatchObject({ status: 422, code: "command_refused" });
    expect(
      await send(agent, `/${handle}/commands`, "POST", {
        baseRevision: 2,
        command: { op: "rm", path: "/" },
      }),
    ).toMatchObject({ status: 400, code: "invalid_command" });
    // The owner's next push must start from the agent's revision.
    expect(await push(cookie, 1, 3)).toMatchObject({
      status: 409,
      revision: 2,
    });
    expect(await push(cookie, 2, 3)).toMatchObject({ status: 200 });
  });

  it("streams each accepted write as a revision event", async () => {
    const {
      cookie,
      send,
      upload,
      push,
      project,
      projects,
      base: url,
    } = await studio();
    await upload(cookie);
    await push(cookie, null, 1);
    const { response, next, abort } = await eventStream(
      `${url}/api/projects/${project.id}/events`,
      cookie,
    );
    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(await next()).toMatchObject({ revision: 1, source: "snapshot" });
    await send(cookie, `/${project.id}/commands`, "POST", {
      baseRevision: 1,
      command: { op: "set-prompt", text: "Cut on the kick" },
    });
    expect(await next()).toEqual({
      projectId: project.id,
      copyId: expect.stringMatching(/\.[a-z2-9]{10}$/),
      revision: 2,
      baseRevision: 1,
      source: "command",
      command: { op: "set-prompt", text: "Cut on the kick" },
    });
    expect((await send(cookie, `/${project.id}`)).brief).toMatchObject({
      text: "Cut on the kick",
    });
    await push(cookie, 2, 5);
    expect(await next()).toMatchObject({
      revision: 5,
      baseRevision: 2,
      source: "studio",
    });
    abort();
    projects.close();
  });
});
