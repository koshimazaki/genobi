import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import GenerateButton from "../src/components/GenerateButton";
import {
  RESTORE_FAILED,
  RunRestorer,
  type RestoreIo,
} from "../src/run-restore";
import { isRestoring, restoreRun } from "../src/useRecreate";
import type { SettingsHold } from "../src/settings-store";
import type { Job } from "../shared/types";

// Recreate's restore of a run's template and run location: Generate waits for
// it, restores are serialised newest-first, and an unreadable take is said.
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { promise, resolve };
};
const job = (id: string, model = "ltx-2.5-akuspace") =>
  ({ id, generator: "video", model }) as Job;
const takeOf = (workflow: string, location: string) =>
  Response.json({
    take: {
      recipe: { id: "ltx-2-5-akuspace", route: "workflow", workflow, location },
    },
  });
function io(read: (id: string) => Promise<Response>) {
  const writes: string[] = [];
  const io: RestoreIo = {
    readTake: read,
    selectWorkflow: async (_entry, template) => void writes.push(template),
    saveRunLocation: async (location) => void writes.push(location),
  };
  return { io, writes };
}

afterEach(() => vi.unstubAllGlobals());

describe("RunRestorer", () => {
  it("is pending until the restore has written, and then idle", async () => {
    const read = deferred<Response>();
    const { io: fake, writes } = io(() => read.promise);
    const states: boolean[] = [];
    const restorer = new RunRestorer((p) => states.push(p), fake);
    const restoring = restorer.restore(job("a"), () => {});
    expect(restorer.pending).toBe(true);
    read.resolve(takeOf("ltx-2-5-t2v", "local"));
    await restoring;
    expect(writes).toEqual(["ltx-2-5-t2v", "local"]);
    expect(restorer.pending).toBe(false);
    expect(states).toEqual([true, false]);
  });

  it("drops a superseded restore before it writes, when its read finishes last", async () => {
    const first = deferred<Response>();
    const { io: fake, writes } = io((id) =>
      id === "a"
        ? first.promise
        : Promise.resolve(takeOf("ltx-2-5-akuspace-t2v", "cloud")),
    );
    const restorer = new RunRestorer(undefined, fake);
    const onError = vi.fn();
    const one = restorer.restore(job("a"), onError);
    const two = restorer.restore(job("b"), onError);
    await two;
    expect(restorer.pending).toBe(true);
    first.resolve(takeOf("ltx-2-5-t2v", "local"));
    await one;
    expect(writes).toEqual(["ltx-2-5-akuspace-t2v", "cloud"]);
    expect(onError).not.toHaveBeenCalled();
    expect(restorer.pending).toBe(false);
  });

  it("lets a Recreate of a run with no template supersede a pending restore", async () => {
    const first = deferred<Response>();
    const { io: fake, writes } = io(() => first.promise);
    const restorer = new RunRestorer(undefined, fake);
    const onError = vi.fn();
    const pending = restorer.restore(job("a"), onError);
    // A Router run: nothing to restore, but it is now the run being recreated.
    await restorer.restore(job("b", "ltx-2.5"), onError);
    first.resolve(takeOf("ltx-2-5-t2v", "local"));
    await pending;
    expect(writes).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("waits for the previous restore's writes before writing", async () => {
    const order: string[] = [];
    const slow = deferred<void>();
    const fake: RestoreIo = {
      readTake: async (id) =>
        takeOf(id === "a" ? "ltx-2-5-t2v" : "ltx-2-5-akuspace-t2v", "cloud"),
      selectWorkflow: async (_e, template) => {
        order.push(`start ${template}`);
        if (template === "ltx-2-5-t2v") await slow.promise;
        order.push(`end ${template}`);
      },
      saveRunLocation: async () => {},
    };
    const restorer = new RunRestorer(undefined, fake);
    const one = restorer.restore(job("a"), () => {});
    await new Promise((r) => setTimeout(r, 0));
    const two = restorer.restore(job("b"), () => {});
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["start ltx-2-5-t2v"]);
    slow.resolve();
    await Promise.all([one, two]);
    expect(order).toEqual([
      "start ltx-2-5-t2v",
      "end ltx-2-5-t2v",
      "start ltx-2-5-akuspace-t2v",
      "end ltx-2-5-akuspace-t2v",
    ]);
  });

  it("says a take that cannot be read, and stays quiet when nothing was recorded", async () => {
    const cases: [string, () => Promise<Response>, boolean][] = [
      ["network", () => Promise.reject(new TypeError("down")), true],
      ["unreadable", async () => new Response("{trunc", { status: 200 }), true],
      [
        "server error",
        async () => Response.json({ error: "x" }, { status: 500 }),
        true,
      ],
      [
        "not ready",
        async () => Response.json({ code: "take_not_ready" }, { status: 409 }),
        true,
      ],
      [
        "before takes",
        async () => Response.json({ code: "take_missing" }, { status: 404 }),
        false,
      ],
      [
        "before templates",
        async () =>
          Response.json({
            take: { recipe: { id: "ltx-2-5-akuspace", route: "workflow" } },
          }),
        false,
      ],
    ];
    for (const [name, read, says] of cases) {
      const { io: fake, writes } = io(read);
      const onError = vi.fn();
      await new RunRestorer(undefined, fake).restore(job("a"), onError);
      expect(onError.mock.calls, name).toEqual(says ? [[RESTORE_FAILED]] : []);
      expect(writes, name).toEqual([]);
    }
  });

  it("says a failed write, and reads nothing for a run with no template", async () => {
    const onError = vi.fn();
    await new RunRestorer(undefined, {
      readTake: async () => takeOf("ltx-2-5-t2v", "local"),
      selectWorkflow: () => Promise.reject(new Error("refused")),
      saveRunLocation: async () => {},
    }).restore(job("a"), onError);
    expect(onError).toHaveBeenCalledWith(RESTORE_FAILED);
    const readTake = vi.fn();
    await new RunRestorer(undefined, {
      readTake,
      selectWorkflow: async () => {},
      saveRunLocation: async () => {},
    }).restore(job("b", "ltx-2.5"), onError);
    expect(readTake).not.toHaveBeenCalled();
  });
});

describe("Generate while a restore is in flight", () => {
  const button = (hold: SettingsHold) =>
    renderToStaticMarkup(
      <GenerateButton
        generator="video"
        hasKey
        submitting={false}
        disabled={false}
        hold={hold}
        onSubmit={() => {}}
        onResume={() => {}}
      />,
    );

  it("is disabled and says Restoring until the restore ends", () => {
    expect(button("restoring")).toMatch(/disabled=""/);
    expect(button("restoring")).toContain("Restoring…");
    expect(button("saving")).toMatch(/disabled=""/);
    expect(button("saving")).toContain("Saving settings…");
    expect(button(null)).not.toMatch(/disabled=""/);
    expect(button(null)).toContain("Generate");
  });

  it("is held by the studio's restorer from Recreate until its answer", async () => {
    const read = deferred<Response>();
    const posts: string[] = [];
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/takes/")) return read.promise;
      // Writes only: an unreadable answer is followed by the lane's own read.
      if (init?.method === "POST") posts.push(url);
      return Promise.resolve(Response.json({}));
    });
    const recreating = restoreRun(job("c"), () => {});
    expect(isRestoring()).toBe(true);
    // Nothing is sent while the take is being read.
    expect(posts).toEqual([]);
    read.resolve(takeOf("ltx-2-5-t2v", "local"));
    await recreating;
    expect(isRestoring()).toBe(false);
    expect(posts).toEqual([
      "/api/settings/workflows/selection",
      "/api/settings/run-location",
    ]);
  });
});
