import { describe, expect, it } from "vitest";
import type { CopyEvent } from "../src/director/project-copy";
import { readCopy } from "../src/director/project-copy";
import { CopySync } from "../src/director/project-copy-sync";
import { readBrief } from "../src/director/prompt-brief";
import { createStudioStore } from "../src/studio/store";
import { base } from "./house-template-fixtures";
import { settle, studio, tab } from "./copy-sync-harness";

// Answers that arrive out of order must not undo newer work. Requests reach
// the real local server at once; their answers are held and released in the
// worst order: a slow read of an older copy lands after the person's newer
// push was accepted, and that push is acknowledged last. Under the earlier
// rules the old read rewound the studio and the next push stored it over
// the agent's move and the person's rename.
describe("out-of-order answers", () => {
  it("lose neither the person's rename nor the agent's commands", async () => {
    const { fetcher, hold, agent } = await studio();
    const store = createStudioStore();
    const notices: string[] = [];
    const sync = new CopySync({
      store,
      fetcher,
      notice: (text) => notices.push(text),
      live: () => {},
    });
    const first = base();
    const id = first.project.id;
    store.getState().actions.initialize(first);
    await sync.push();
    expect(sync.serverRevision(id)).toBe(1);
    const event = (revision: number, baseRevision: number): CopyEvent => ({
      projectId: id,
      revision,
      baseRevision,
      source: "command",
    });

    const rename = (name: string) => {
      const now = store.getState().director.bundle!;
      store
        .getState()
        .actions.commit({ ...now, project: { ...now.project, name } });
    };

    // The person edits; before the push, an agent writes the prompt
    // (revision 2). The studio is ahead of the command's base, so it reloads,
    // and that read is slow.
    rename("First draft");
    expect(
      (await agent(id, 1, { op: "set-prompt", text: "Agent prompt" })).revision,
    ).toBe(2);
    const releaseRead = hold("GET", new RegExp(`^/api/projects/${id}$`));
    const reload2 = sync.event(id, event(2, 1));
    await settle();
    // A second command (revision 3) arrives; its own read would be quick.
    expect(
      (
        await agent(id, 2, {
          op: "move-clip",
          layerId: "photo-1",
          startFrame: 0,
        })
      ).revision,
    ).toBe(3);
    const reload3 = sync.event(id, event(3, 2));
    await settle();
    // The person renames; the push is accepted but its answer is slow.
    rename("Renamed");
    const releasePush = hold("PUT", new RegExp(`^/api/projects/${id}$`));
    const pushing = sync.push();
    await settle();
    // Worst order: the old read of revision 2 lands, then the push answer.
    releaseRead();
    await settle();
    releasePush();
    await Promise.all([reload2, reload3, pushing]);
    // Whatever is left to push goes now.
    await sync.push();

    // The agent's work is on the server and in the studio, never rewound.
    const stored = await readCopy(id, undefined, fetcher);
    for (const bundle of [stored, store.getState().director.bundle!]) {
      expect(readBrief(bundle).text).toBe("Agent prompt");
      expect(
        bundle.project.layers.find((l) => l.id === "photo-1")!.startFrame,
      ).toBe(0);
    }
    // The rename made during the slow read lost to the agent's newer
    // revision, as any crossed edit does: one Undo away, with the notice.
    expect(
      store
        .getState()
        .director.history.some((b) => b.project.name === "Renamed"),
    ).toBe(true);
    expect(notices).toEqual([
      expect.stringMatching(/reloaded revision 3 from the project copy/),
    ]);
    // And the person's next edit builds on all of it.
    const latest = store.getState().director.bundle!;
    store.getState().actions.commit({
      ...latest,
      project: { ...latest.project, name: "Renamed again" },
    });
    await sync.push();
    const after = await readCopy(id, undefined, fetcher);
    expect(after.project.name).toBe("Renamed again");
    expect(readBrief(after).text).toBe("Agent prompt");
    expect(
      after.project.layers.find((l) => l.id === "photo-1")!.startFrame,
    ).toBe(0);
  });

  it("a window whose push was out loads the newer revision another window pushed", async () => {
    const { fetcher, hold } = await studio();
    const a = tab(fetcher),
      b = tab(fetcher);
    const id = base().project.id;
    const studioEvent = (revision: number, baseRevision: number) =>
      ({
        projectId: id,
        revision,
        baseRevision,
        source: "studio",
      }) as CopyEvent;
    // Window A creates the copy; window B opens the same project and meets it.
    a.store.getState().actions.initialize(base());
    await a.sync.push();
    b.store.getState().actions.initialize(base());
    await b.sync.push();
    expect(b.sync.serverRevision(id)).toBe(1);

    // A renames; the server accepts revision 2, but A's answer is slow.
    a.rename("From window A");
    const releasePush = hold("PUT", new RegExp(`^/api/projects/${id}$`));
    const pushing = a.sync.push();
    // Wait until the server holds it, however slow the machine.
    for (let i = 0; i < 500; i++) {
      if (
        (await readCopy(id, undefined, fetcher)).project.name ===
        "From window A"
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // B hears revision 2, loads it, renames on top and pushes a newer one.
    await b.sync.event(id, studioEvent(2, 1));
    expect(b.name()).toBe("From window A");
    b.rename("From window B");
    await b.sync.push();
    const fromB = b.sync.serverRevision(id)!;
    expect(fromB).toBeGreaterThan(2);
    // A hears B's revision while its own push is still out, then its answer.
    await a.sync.event(id, studioEvent(fromB, 2));
    releasePush();
    await pushing;
    // A does not settle on its own older revision: it loads B's.
    expect(a.sync.serverRevision(id)).toBe(fromB);
    expect(a.name()).toBe("From window B");
    expect(a.notices).toEqual([]);
    expect((await readCopy(id, undefined, fetcher)).project.name).toBe(
      "From window B",
    );
  });
});
