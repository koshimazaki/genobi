import { describe, expect, it } from "vitest";
import type { CopyEvent } from "../src/director/project-copy";
import { readCopy } from "../src/director/project-copy";
import { readBrief } from "../src/director/prompt-brief";
import { base } from "./house-template-fixtures";
import { CopySync } from "../src/director/project-copy-sync";
import { createStudioStore } from "../src/studio/store";
import { settle, studio, tab } from "./copy-sync-harness";

// Reloads against the real local server: a read that fails part way does not
// strand a newer reload waiting behind it, and a reload that replaces edits
// the server never got says so, whatever asked for it.
const event = (
  id: string,
  source: CopyEvent["source"],
  revision: number,
  baseRevision: number,
): CopyEvent => ({ projectId: id, revision, baseRevision, source });

describe("reloads", () => {
  it("run the newer queued reload when a read fails", async () => {
    const { fetcher, hold, agent } = await studio();
    const a = tab(fetcher);
    const id = base().project.id;
    a.store.getState().actions.initialize(base());
    await a.sync.push();
    // An unpushed edit makes the window reload instead of applying in place.
    a.rename("Local draft");
    expect(
      (await agent(id, 1, { op: "set-prompt", text: "First" })).revision,
    ).toBe(2);
    const fail = hold("GET", new RegExp(`^/api/projects/${id}$`), 404);
    const first = a.sync.event(id, event(id, "command", 2, 1));
    await settle();
    expect(
      (
        await agent(id, 2, {
          op: "move-clip",
          layerId: "photo-1",
          startFrame: 0,
        })
      ).revision,
    ).toBe(3);
    const second = a.sync.event(id, event(id, "command", 3, 2));
    fail();
    await Promise.all([first, second]);
    const bundle = a.store.getState().director.bundle!;
    expect(a.sync.serverRevision(id)).toBe(3);
    expect(readBrief(bundle).text).toBe("First");
    expect(
      bundle.project.layers.find((l) => l.id === "photo-1")!.startFrame,
    ).toBe(0);
    expect(a.notices).toEqual([
      expect.stringMatching(
        /^An agent changed this project; reloaded revision 3/,
      ),
    ]);
  });

  it("say so when another window's push replaces unpushed edits", async () => {
    const { fetcher } = await studio();
    const a = tab(fetcher),
      b = tab(fetcher);
    const id = base().project.id;
    a.store.getState().actions.initialize(base());
    await a.sync.push();
    b.store.getState().actions.initialize(base());
    await b.sync.push();
    // A edits; before A's push comes due, B pushes its own edit.
    a.rename("From window A");
    b.rename("From window B");
    await b.sync.push();
    const fromB = b.sync.serverRevision(id)!;
    await a.sync.event(id, event(id, "studio", fromB, 1));
    expect(a.name()).toBe("From window B");
    expect(a.notices).toEqual([
      expect.stringMatching(
        /^Another window changed this project; reloaded revision \d+ from the project copy\. Undo brings back your version\.$/,
      ),
    ]);
    // The replaced edit is one Undo away.
    expect(
      a.store
        .getState()
        .director.history.some((h) => h.project.name === "From window A"),
    ).toBe(true);
    expect((await readCopy(id, undefined, fetcher)).project.name).toBe(
      "From window B",
    );
  });

  it("stay quiet when nothing unpushed is replaced", async () => {
    const { fetcher } = await studio();
    const a = tab(fetcher),
      b = tab(fetcher);
    const id = base().project.id;
    a.store.getState().actions.initialize(base());
    await a.sync.push();
    b.store.getState().actions.initialize(base());
    await b.sync.push();
    b.rename("From window B");
    await b.sync.push();
    await a.sync.event(id, event(id, "studio", b.sync.serverRevision(id)!, 1));
    expect(a.name()).toBe("From window B");
    expect(a.notices).toEqual([]);
  });

  it("keep catching up when newer revisions arrive during every read of a round", async () => {
    const harness = await studio();
    const id = base().project.id;
    let revision = 1;
    let bumps = 0;
    // Every read of the copy, for the first eight, lets an agent write first.
    const fetcher = (async (input: string, init: RequestInit = {}) => {
      const response = await harness.fetcher(input, init);
      if (
        !init.method &&
        response.ok &&
        input === `/api/projects/${id}` &&
        bumps < 8
      ) {
        bumps++;
        const { revision: next } = await harness.agent(id, revision, {
          op: "set-prompt",
          text: `Pass ${bumps}`,
        });
        void a.sync.event(id, event(id, "command", next, revision));
        revision = next;
      }
      return response;
    }) as typeof fetch;
    const a = tab(fetcher);
    a.store.getState().actions.initialize(base());
    await a.sync.push();
    // No local edits. The window missed revision 2's event, so revision 3's
    // does not apply in place and it reloads; every read of that reload
    // round then meets a newer revision.
    await harness.agent(id, 1, { op: "set-prompt", text: "Missed" });
    const { revision: third } = await harness.agent(id, 2, {
      op: "set-prompt",
      text: "Pass 0",
    });
    revision = third;
    await a.sync.event(id, event(id, "command", third, 2));
    for (let i = 0; i < 300 && a.sync.serverRevision(id) !== revision; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(bumps).toBe(8);
    expect(a.sync.serverRevision(id)).toBe(revision);
    expect(readBrief(a.store.getState().director.bundle!).text).toBe("Pass 8");
  });

  it("send no push while a conflict reload waits for a render, and push again after", async () => {
    const { fetcher, agent } = await studio();
    // Manifest PUTs are counted when sent; `landed` is the latest one's
    // answer and `sent` fires on the next send, so the test waits for the
    // push itself rather than for a guessed number of milliseconds.
    let puts = 0;
    let landed: Promise<Response> | undefined;
    let sent = () => {};
    const counted = (async (input: string, init: RequestInit = {}) => {
      const response = fetcher(input, init);
      if (init.method === "PUT" && !input.includes("/files/")) {
        puts++;
        landed = response;
        sent();
      }
      return response;
    }) as typeof fetch;
    const store = createStudioStore();
    const notices: string[] = [];
    const sync = new CopySync({
      store,
      fetcher: counted,
      debounce: 10,
      notice: (text) => notices.push(text),
      live: () => {},
    });
    const later: Promise<void>[] = [];
    store.subscribe((now, before) => {
      const run = sync.storeChanged(now, before);
      if (run) later.push(run);
    });
    const id = base().project.id;
    const edit = (name: string) => {
      const now = store.getState().director.bundle!;
      store
        .getState()
        .actions.commit({ ...now, project: { ...now.project, name } });
      sync.schedule();
    };
    store.getState().actions.initialize(base());
    await sync.push();
    expect(puts).toBe(1);
    // A render starts; an agent writes; the reload has to wait for the render.
    store.getState().actions.operations({ rendering: true });
    const { revision } = await agent(id, 1, {
      op: "set-prompt",
      text: "Agent",
    });
    await sync.event(id, event(id, "command", revision, 1));
    // The person keeps editing during the render: nothing is pushed.
    for (const name of ["One", "Two", "Three"]) {
      edit(name);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    expect(puts).toBe(1);
    // The render ends: the reload runs, then pushes resume.
    store.getState().actions.operations({ rendering: false });
    await Promise.all(later);
    expect(sync.serverRevision(id)).toBe(revision);
    expect(notices).toEqual([expect.stringMatching(/while it was busy/)]);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(puts).toBe(1);
    const next = new Promise<void>((resolve) => (sent = resolve));
    edit("After the render");
    // The debounced push goes out, and the server answers it, before the
    // copy is read back: a busy machine can take longer than any fixed wait.
    await next;
    expect((await landed!).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(puts).toBe(2);
    expect((await readCopy(id, undefined, fetcher)).project.name).toBe(
      "After the render",
    );
    sync.stop();
  });
});
