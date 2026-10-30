import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ActivityStore } from "../server/activity";
import {
  cleanActivity,
  mergeActivity,
  type ActivityEvent,
} from "../shared/activity";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const event = (id = "one"): ActivityEvent => ({
  id,
  at: "2026-10-25T12:00:00.000Z",
  tool: "genobi_scene",
  phase: "started",
  source: "mcp",
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "genobi-activity-"));
  roots.push(root);
  return { root, store: new ActivityStore(root) };
}
it("is off by default and stays off after restart", async () => {
  const { root, store } = await fixture();
  await store.append("owner", event());
  expect(await store.read("owner")).toMatchObject({
    enabled: false,
    events: [],
  });
  expect(await new ActivityStore(root).read("owner")).toMatchObject({
    enabled: false,
    events: [],
  });
});
it("persists enabled history per owner and clears it on opt-out", async () => {
  const { root, store } = await fixture();
  await store.configure("owner", true);
  await store.append("owner", event());
  expect((await new ActivityStore(root).read("owner")).events).toHaveLength(1);
  expect((await store.read("other")).events).toEqual([]);
  await store.configure("owner", false);
  await store.append("owner", { ...event(), phase: "succeeded" });
  expect(await new ActivityStore(root).read("owner")).toMatchObject({
    enabled: false,
    events: [],
  });
});
it("keeps concurrent writes, deduplicates retries, and strips arbitrary private fields", async () => {
  const { root, store } = await fixture();
  await store.configure("owner", true);
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      store.append("owner", {
        ...event(String(i)),
        prompt: "secret prompt",
        key: "secret key",
      } as ActivityEvent),
    ),
  );
  await store.append("owner", { ...event("0"), phase: "succeeded" });
  const history = await store.read("owner");
  expect(history.events).toHaveLength(10);
  const [file] = await readdir(path.join(root, "activity"));
  const disk = await readFile(path.join(root, "activity", file), "utf8");
  expect(disk).not.toMatch(/secret|prompt|key/);
});
it("never lets delayed starts replace finished results; bounds history", () => {
  const done = { ...event(), phase: "succeeded" as const };
  expect(mergeActivity([done], event())).toEqual([done]);
  let events: ActivityEvent[] = [];
  for (let i = 0; i < 230; i++)
    events = mergeActivity(events, event(String(i)));
  expect(events).toHaveLength(200);
});
it("rejects unbounded or malformed metadata", () => {
  expect(() => cleanActivity({ ...event(), id: undefined })).toThrow();
  expect(() => cleanActivity({ ...event(), tool: undefined })).toThrow();
  expect(() => cleanActivity({ ...event(), tool: "prompt\nsecret" })).toThrow();
  expect(() =>
    cleanActivity({ ...event(), backend: "https://provider?key=secret" }),
  ).toThrow();
});
