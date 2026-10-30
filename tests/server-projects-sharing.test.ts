import { describe, expect, it } from "vitest";
import { eventStream, studio } from "./project-copy-harness";

// Who may see a copy: two owners can hold the same project id (templates
// reuse fixed ids), so a linked session works by the copy's handle; and a
// session that loses its link stops hearing about the copy at once.
type Linked = { project: { copyId: string } };

describe("sharing a project copy", () => {
  it("keeps two owners' copies of one project id apart for a session linked to both", async () => {
    const { cookie, fresh, send, upload, push, project } = await studio();
    const other = await fresh();
    const agent = await fresh();
    for (const owner of [cookie, other]) {
      await upload(owner);
      expect(await push(owner, null, 1)).toMatchObject({ status: 200 });
    }
    const handles: string[] = [];
    for (const owner of [cookie, other]) {
      const { code } = await send(owner, `/${project.id}/link`, "POST");
      const linked = (await send(agent, "/link", "POST", {
        code,
      })) as unknown as Linked;
      handles.push(linked.project.copyId);
    }
    expect(new Set(handles).size).toBe(2);
    const listed = (await send(agent, "")).projects as {
      id: string;
      copyId: string;
    }[];
    expect(listed.map((p) => p.id)).toEqual([project.id, project.id]);
    expect(listed.map((p) => p.copyId).sort()).toEqual([...handles].sort());
    // A command by the second handle changes only the second owner's copy.
    expect(
      await send(agent, `/${handles[1]}/commands`, "POST", {
        baseRevision: 1,
        command: { op: "set-prompt", text: "Only the second" },
      }),
    ).toMatchObject({ status: 200, revision: 2 });
    expect(await send(cookie, `/${project.id}`)).toMatchObject({
      revision: 1,
      brief: null,
    });
    expect(await send(other, `/${project.id}`)).toMatchObject({
      revision: 2,
      brief: { text: "Only the second" },
    });
    // Neither owner reaches the other's copy by its handle.
    expect(await send(cookie, `/${handles[1]}`)).toMatchObject({
      status: 404,
    });
  });

  it("ends an evicted session's stream, so it hears nothing more", async () => {
    const {
      cookie,
      fresh,
      send,
      upload,
      push,
      project,
      projects,
      base: url,
    } = await studio();
    await upload(cookie);
    await push(cookie, null, 1);
    const link = async (session: string) => {
      const { code } = await send(cookie, `/${project.id}/link`, "POST");
      return (
        (await send(session, "/link", "POST", { code })) as unknown as Linked
      ).project.copyId;
    };
    const first = await fresh();
    const handle = await link(first);
    const stream = await eventStream(
      `${url}/api/projects/${handle}/events`,
      first,
    );
    expect(await stream.next()).toMatchObject({ source: "snapshot" });
    // Four more links: the first session is the oldest and loses its place.
    for (let i = 0; i < 4; i++) await link(await fresh());
    expect(await stream.next()).toBeUndefined();
    expect(await send(first, `/${handle}`)).toMatchObject({ status: 404 });
    // A later write reaches the owner's stream, not the evicted one.
    const owner = await eventStream(
      `${url}/api/projects/${project.id}/events`,
      cookie,
    );
    expect(await owner.next()).toMatchObject({ source: "snapshot" });
    await push(cookie, 1, 2);
    expect(await owner.next()).toMatchObject({ revision: 2, source: "studio" });
    owner.abort();
    stream.abort();
    projects.close();
  });
});
