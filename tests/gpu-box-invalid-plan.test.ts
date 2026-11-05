import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { Store } from "../server/store";
import { WorkflowSettings } from "../server/workflow-settings";
import { entryFor } from "../shared/registry";
import type { TakeRecipe } from "../shared/take";

// A saved GPU box can stop reading as valid after a restart (its port is now
// reserved). Pricing or sending a run must refuse it, but reading a paused
// chain or part set goes through `fits`, which must still answer: false, so
// the stage re-quotes and reports why, rather than failing the whole read.

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

it("refuses an invalid saved box only where a run is priced, not where a quote is read", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gpu-box-invalid-"));
  directories.push(dir);
  const store = new Store(dir);
  await store.load();
  const port = 9555;
  const before = new WorkflowSettings(store);
  await before.setLocation("s1", "box", undefined, { name: "lab", port });
  const entry = entryFor("image", "flux-3-klein");
  const recipe: TakeRecipe = {
    id: entry.id,
    version: entry.recipeVersion,
    route: "workflow",
    ...before.plan("s1", entry),
  };
  expect(recipe.box?.url).toBeTruthy();

  const after = new WorkflowSettings(store, { reservedPorts: [port] });
  expect(() => after.plan("s1", entry)).not.toThrow();
  expect(after.fits("s1", recipe)).toBe(false);
  expect(() => after.planFor("s1", "image", "flux-3-klein")).toThrow(
    expect.objectContaining({ code: "invalid_destination" }),
  );
});
