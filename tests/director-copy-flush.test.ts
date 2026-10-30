// Box 1.6: the wordmark leaves without the guard only when the project copy
// holds the current revision. `CopySync.flush` waits for a push already out,
// pushes again when the revision moved meanwhile, and answers false for a
// revision the server never took. Against the real local server.
import { describe, expect, it } from "vitest";
import { createStudioStore } from "../src/studio/store";
import { CopySync } from "../src/director/project-copy-sync";
import { pushCopy } from "../src/director/project-copy";
import { base } from "./house-template-fixtures";
import { setup } from "./server-harness";

async function studio(failWrites = false) {
  const harness = await setup();
  let gate: Promise<void> | undefined;
  const fetcher = (async (input: string, init: RequestInit = {}) => {
    if (init.method && init.method !== "GET") {
      if (failWrites) throw new Error("The studio could not be reached.");
      if (gate) await gate;
    }
    return fetch(`${harness.base}${input}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        cookie: harness.cookie,
      },
    });
  }) as typeof fetch;
  const store = createStudioStore();
  const sync = new CopySync({
    store,
    fetcher,
    debounce: 10_000,
    notice: () => {},
    live: () => {},
  });
  const hold = () => {
    let release = () => {};
    gate = new Promise<void>((resolve) => (release = resolve));
    return () => {
      gate = undefined;
      release();
    };
  };
  return { store, sync, hold, fetcher };
}
const edit = (store: ReturnType<typeof createStudioStore>) => {
  const bundle = store.getState().director.bundle!;
  store
    .getState()
    .actions.commit({ ...bundle, project: { ...bundle.project } }, bundle);
};

describe("CopySync.flush", () => {
  it("waits for the push already out, then pushes the edit made meanwhile", async () => {
    const { store, sync, hold } = await studio();
    store.getState().actions.initialize(base());
    const release = hold();
    const first = sync.push();
    // An edit lands while the first push is still out.
    edit(store);
    const flushed = sync.flush();
    setTimeout(release, 50);
    await first;
    expect(await flushed).toBe(true);
    expect(sync.holdsCurrent()).toBe(true);
  });

  it("answers false when a conflict during the flush replaced the person's edit", async () => {
    const { store, sync, fetcher } = await studio();
    store.getState().actions.initialize(base());
    await sync.push();
    const id = base().project.id;
    expect(sync.serverRevision(id)).toBeDefined();
    // Another writer (the linked agent, another window) moves the copy on.
    const theirs = base();
    theirs.project = { ...theirs.project, revision: 9 };
    expect(
      (await pushCopy(theirs, sync.serverRevision(id)!, new Set(), fetcher)).ok,
    ).toBe(true);
    // The person's edit meets the newer copy: the reload replaces it.
    edit(store);
    expect(await sync.flush()).toBe(false);
    // The store matches the server, but the person's version is only in undo.
    expect(sync.holdsCurrent()).toBe(true);
    expect(store.getState().director.history.length).toBeGreaterThan(0);
    // Their next edit is saved over the reloaded copy: nothing is lost now.
    edit(store);
    expect(await sync.flush()).toBe(true);
  });

  it("answers false when the server never took the revision", async () => {
    const { store, sync } = await studio(true);
    store.getState().actions.initialize(base());
    edit(store);
    expect(await sync.flush()).toBe(false);
    expect(sync.holdsCurrent()).toBe(false);
  });
});

// Box 1.8: `isSynced` answers what `flush` would, at once, for the guard.
describe("CopySync.isSynced", () => {
  it("reads synced only once the edit is saved, and never while one waits", async () => {
    const { store, sync, hold } = await studio();
    store.getState().actions.initialize(base());
    await sync.push();
    expect(sync.isSynced()).toBe(true);
    // Undo history exists now, but the copy is what counts.
    edit(store);
    expect(store.getState().director.history.length).toBeGreaterThan(0);
    expect(sync.isSynced()).toBe(false);
    const release = hold();
    const out = sync.push();
    expect(sync.isSynced()).toBe(false);
    release();
    await out;
    expect(sync.isSynced()).toBe(true);
  });

  it("reads not synced after a conflict replaced the person's edit, or a failed save", async () => {
    const { store, sync, fetcher } = await studio();
    store.getState().actions.initialize(base());
    await sync.push();
    const id = base().project.id;
    const theirs = base();
    theirs.project = { ...theirs.project, revision: 9 };
    await pushCopy(theirs, sync.serverRevision(id)!, new Set(), fetcher);
    edit(store);
    await sync.flush();
    expect(sync.holdsCurrent()).toBe(true);
    expect(sync.isSynced()).toBe(false);
    const failing = await studio(true);
    failing.store.getState().actions.initialize(base());
    edit(failing.store);
    await failing.sync.flush();
    expect(failing.sync.isSynced()).toBe(false);
  });

  it("reads not synced while another edited project was left unsaved", async () => {
    const { store, sync } = await studio();
    store.getState().actions.initialize(base());
    await sync.push();
    // An unsaved edit, then a switch to another project before its push.
    edit(store);
    const other = base();
    other.project = { ...other.project, id: "another-project" };
    store.getState().actions.commit(other, store.getState().director.bundle);
    await sync.push();
    expect(sync.holdsCurrent()).toBe(true);
    expect(sync.isSynced()).toBe(false);
    // Leaving needs it saved; linking the open copy to an agent does not.
    expect(await sync.flush(true)).toBe(false);
    expect(await sync.flush()).toBe(true);
  });

  it("another unsaved project does not block Generate now's save, only a leave", async () => {
    const { store, sync } = await studio();
    store.getState().actions.initialize(base());
    await sync.push();
    edit(store);
    const other = base();
    other.project = { ...other.project, id: "another-project" };
    store.getState().actions.commit(other, store.getState().director.bundle);
    await sync.push();
    const guard = await import("../src/director/leave-guard");
    const remove = guard.flushBeforeLeaving(
      (all) => sync.flush(all),
      () => sync.isSynced(),
    );
    try {
      // What template-actions and regenerate call.
      expect(await guard.saveCopies(1000)).toBe(true);
      expect(await guard.saveCopies(1000, { allProjects: true })).toBe(false);
    } finally {
      remove();
    }
  });
});
