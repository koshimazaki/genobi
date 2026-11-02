import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createStudioStore } from "../src/studio/store";
import { pushCopy, readManifest } from "../src/director/project-copy";
import type { CopyConflict } from "../src/director/copy-conflict";
import { CopySync } from "../src/director/project-copy-sync";
import type { Bundle } from "../src/director/bundle";
import { base } from "./house-template-fixtures";
import { setup } from "./server-harness";

// The studio's copy rules against the real local server: a copy restored
// after a first-push conflict opens its stream, and a reload that finishes
// after the person opened another project leaves that project alone.
async function studio() {
  const harness = await setup();
  let gate: Promise<void> | undefined;
  let held = /^\/api\/projects\/[a-z-]+$/;
  /** Every answer, as `METHOD path status`. */
  const answers: string[] = [];
  const fetcher = (async (input: string, init: RequestInit = {}) => {
    // A read of the copy can be held back to stand for a slow answer.
    if (gate && !init.method && held.test(input)) await gate;
    const response = await fetch(`${harness.base}${input}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        cookie: harness.cookie,
      },
    });
    answers.push(`${init.method ?? "GET"} ${input} ${response.status}`);
    return response;
  }) as typeof fetch;
  const store = createStudioStore();
  const notices: string[] = [];
  const live: string[] = [];
  const sync = new CopySync({
    store,
    fetcher,
    debounce: 10,
    notice: (text) => notices.push(text),
    live: (id) => live.push(id),
  });
  /** Holds reads of the copy's manifest, or of whatever `pattern` names. */
  const hold = (pattern = /^\/api\/projects\/[a-z-]+$/) => {
    held = pattern;
    let release = () => {};
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      gate = undefined;
      release();
    };
  };
  return { ...harness, fetcher, store, sync, notices, live, hold, answers };
}
const renamed = (bundle: Bundle, id: string): Bundle => ({
  ...bundle,
  project: { ...bundle.project, id },
});

describe("the studio's copy rules", () => {
  // Box 1.7: the owner's "GET /api/projects/character-intro 409". No read
  // answers 409; the Conflict was this page's first push after a reload,
  // which pushed the freshly loaded template over the saved copy.
  it("opens the copy an earlier page left, live, without pushing over it", async () => {
    const { fetcher, store, sync, notices, live, answers } = await studio();
    // An earlier page left revision 3 on disk.
    const earlier = base();
    earlier.project = { ...earlier.project, revision: 3 };
    await pushCopy(earlier, null, new Set(), fetcher);
    answers.length = 0;
    store.getState().actions.initialize(base());
    await sync.push();
    expect(live).toEqual([earlier.project.id]);
    expect(sync.serverRevision(earlier.project.id)).toBe(3);
    expect(store.getState().director.bundle!.project.revision).toBe(3);
    expect(notices).toEqual(["Opened this project's saved copy (revision 3)."]);
    expect(answers.filter((line) => / 409$/.test(line))).toEqual([]);
    expect(answers.some((line) => line.startsWith("PUT"))).toBe(false);
    // Nothing of the person's was replaced: leaving needs no warning.
    expect(await sync.flush()).toBe(true);
  });

  it("offers an explicit saved-copy decision with a one-click draft restore", async () => {
    const { fetcher, store, notices } = await studio();
    const saved = base();
    saved.project = { ...saved.project, name: "Server copy", revision: 3 };
    await pushCopy(saved, null, new Set(), fetcher);
    const decisions: CopyConflict[] = [];
    const sync = new CopySync({
      store,
      fetcher,
      debounce: 0,
      notice: (text) => notices.push(text),
      live: () => {},
      conflict: (decision) => decisions.push(decision),
    });
    store.getState().actions.initialize(base());
    const first = store.getState().director.bundle!;
    store.getState().actions.commit({
      ...first,
      project: { ...first.project, name: "My unsaved draft" },
    });
    await sync.push();
    expect(store.getState().director.bundle!.project.name).toBe("Server copy");
    expect(decisions).toEqual([
      expect.objectContaining({
        kind: "saved-copy",
        projectId: saved.project.id,
        revision: 3,
      }),
    ]);
    expect(notices).toEqual([]);
    // A recovered draft is not silently considered saved or discarded.
    expect(await sync.flush()).toBe(false);
    decisions[0].keepMine();
    expect(store.getState().director.bundle!.project.name).toBe(
      "My unsaved draft",
    );
    expect(await sync.flush()).toBe(true);
    expect((await readManifest(saved.project.id, fetcher))!.project.name).toBe(
      "My unsaved draft",
    );
    sync.stop();
  });

  it("acknowledges keeping the saved copy without retrying or overwriting it", async () => {
    const { fetcher, store } = await studio();
    const saved = base();
    saved.project = { ...saved.project, name: "Server copy", revision: 3 };
    await pushCopy(saved, null, new Set(), fetcher);
    const decisions: CopyConflict[] = [];
    const sync = new CopySync({
      store,
      fetcher,
      notice: () => {},
      live: () => {},
      conflict: (decision) => decisions.push(decision),
    });
    store.getState().actions.initialize(base());
    const first = store.getState().director.bundle!;
    store.getState().actions.commit({
      ...first,
      project: { ...first.project, name: "Temporary draft" },
    });
    await sync.push();
    expect(await sync.flush()).toBe(false);
    decisions[0].keepTheirs?.();
    expect(await sync.flush()).toBe(true);
    expect((await readManifest(saved.project.id, fetcher))!.project.name).toBe(
      "Server copy",
    );
    sync.stop();
  });

  it("says Undo brings back edits made before the first save", async () => {
    const { fetcher, store, sync, notices, answers } = await studio();
    const earlier = base();
    earlier.project = { ...earlier.project, revision: 3 };
    await pushCopy(earlier, null, new Set(), fetcher);
    answers.length = 0;
    store.getState().actions.initialize(base());
    const now = store.getState().director.bundle!;
    store
      .getState()
      .actions.commit({ ...now, project: { ...now.project, name: "Mine" } });
    await sync.push();
    expect(notices).toEqual([
      expect.stringMatching(
        /^This project already had a saved copy; reloaded revision 3 from the project copy\. Undo brings back your version\.$/,
      ),
    ]);
    expect(answers.filter((line) => / 409$/.test(line))).toEqual([]);
    // Their version lives in undo history only, so leaving still asks.
    expect(await sync.flush()).toBe(false);
    store.getState().actions.undo();
    expect(store.getState().director.bundle!.project.name).toBe("Mine");
  });

  it("counts an edit made while the copy is read as replaced, not opened", async () => {
    const { fetcher, store, sync, notices, hold, answers } = await studio();
    // The earlier copy's track differs from the page's, so opening it
    // downloads media, which is held: the person edits meanwhile.
    const earlier = base();
    const track = earlier.project.assets.audio.file;
    const bytes = new Uint8Array([...earlier.files.get(track.path)!, 0]);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    earlier.files.set(track.path, bytes);
    earlier.project = {
      ...earlier.project,
      revision: 3,
      assets: {
        ...earlier.project.assets,
        audio: {
          ...earlier.project.assets.audio,
          file: { ...track, sha256 },
        },
      },
    };
    await pushCopy(earlier, null, new Set(), fetcher);
    store.getState().actions.initialize(base());
    const release = hold(new RegExp(`/files/${sha256}$`));
    const pushed = sync.push();
    await vi.waitFor(() =>
      expect(
        answers.some((line) => /^GET \/api\/projects\/[a-z-]+ 200$/.test(line)),
      ).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const now = store.getState().director.bundle!;
    store
      .getState()
      .actions.commit({ ...now, project: { ...now.project, name: "Mine" } });
    release();
    await pushed;
    expect(sync.serverRevision(earlier.project.id)).toBe(3);
    expect(notices).toEqual([
      expect.stringMatching(
        /^This project already had a saved copy; reloaded revision 3 from the project copy\. Undo brings back your version\.$/,
      ),
    ]);
    // Their edit is in undo history only: the wordmark must not let them go.
    expect(await sync.flush()).toBe(false);
    store.getState().actions.undo();
    expect(store.getState().director.bundle!.project.name).toBe("Mine");
  });

  it("does not call a template committed before the Director loaded 'opened'", async () => {
    // Generate now from the gallery: nothing was open yet, so the commit
    // leaves an empty history, but the bundle is the person's references,
    // not the page's own load. Replacing it must keep the save unconfirmed
    // (saveCopies answers false and nothing starts).
    const { fetcher, store, sync, notices } = await studio();
    const earlier = base();
    earlier.project = { ...earlier.project, revision: 3 };
    await pushCopy(earlier, null, new Set(), fetcher);
    const picks = base();
    picks.project = { ...picks.project, name: "With my references" };
    store.getState().actions.commit(picks);
    expect(store.getState().director.history).toEqual([]);
    // The Director's own load arrives after and keeps the picks.
    store.getState().actions.initialize(base());
    await sync.push();
    expect(notices).toEqual([
      expect.stringMatching(/^This project already had a saved copy;/),
    ]);
    expect(await sync.flush()).toBe(false);
  });

  it("pushes a project with no copy yet as a new one", async () => {
    const { store, sync, notices, answers } = await studio();
    store.getState().actions.initialize(base());
    await sync.push();
    const id = base().project.id;
    expect(answers).toContain(`GET /api/projects/${id} 404`);
    expect(answers).toContain(`PUT /api/projects/${id} 200`);
    expect(sync.serverRevision(id)).toBe(base().project.revision);
    expect(notices).toEqual([]);
  });

  it("drops a reload that ends after the person opened another project", async () => {
    const { fetcher, store, sync, notices, live, hold } = await studio();
    const first = base();
    await pushCopy(first, null, new Set(), fetcher);
    store.getState().actions.initialize(first);
    const release = hold();
    const reload = sync.reload(
      first.project.id,
      "An agent changed this project",
    );
    // Meanwhile the person opens another project.
    store.getState().actions.commit(renamed(base(), "other-project"));
    release();
    await reload;
    expect(store.getState().director.bundle!.project.id).toBe("other-project");
    expect(live).toEqual([]);
    expect(notices).toEqual([]);
    expect(sync.serverRevision(first.project.id)).toBeUndefined();
  });

  it("waits when a render starts while the copy is read, then reloads", async () => {
    const { fetcher, store, sync, notices, hold } = await studio();
    const first = base();
    await pushCopy(first, null, new Set(), fetcher);
    store.getState().actions.initialize(first);
    const later: Promise<void>[] = [];
    store.subscribe((now, before) => {
      const run = sync.storeChanged(now, before);
      if (run) later.push(run);
    });
    // The stored copy is ahead: an agent's prompt.
    const response = await fetcher(
      `/api/projects/${first.project.id}/commands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: 1,
          command: { op: "set-prompt", text: "After the render" },
        }),
      },
    );
    expect(response.status).toBe(200);
    const release = hold();
    const reload = sync.reload(
      first.project.id,
      "An agent changed this project",
    );
    store.getState().actions.operations({ rendering: true });
    release();
    await reload;
    // Nothing was committed while the render ran.
    expect(store.getState().director.bundle!.project.revision).toBe(1);
    expect(notices).toEqual([]);
    store.getState().actions.operations({ rendering: false });
    await Promise.all(later);
    expect(store.getState().director.bundle!.project.revision).toBe(2);
    expect(notices).toEqual([expect.stringMatching(/while it was busy/)]);
  });

  it("pushes a project opened during a reload once the reload is dropped", async () => {
    const { fetcher, store, sync, live, hold } = await studio();
    const first = base();
    await pushCopy(first, null, new Set(), fetcher);
    store.getState().actions.initialize(first);
    const release = hold();
    const reload = sync.reload(first.project.id, "");
    // The person opens another project; its push comes due during the read.
    store.getState().actions.commit(renamed(base(), "other-project"));
    await sync.push();
    release();
    await reload;
    // The dropped reload leaves the new project's push scheduled.
    for (let i = 0; i < 300 && !live.includes("other-project"); i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(live).toContain("other-project");
    const listed = await fetcher("/api/projects").then(
      (r) => r.json() as Promise<{ projects: { id: string }[] }>,
    );
    expect(listed.projects.map((p) => p.id)).toContain("other-project");
    sync.stop();
  });
});
