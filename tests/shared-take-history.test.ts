import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { historyOf, jobForReader } from "../server/shared-takes";
import { Store, type StoredJob } from "../server/store";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

const job = (
  id: string,
  sessionId: string,
  extra: Partial<StoredJob> = {},
): StoredJob =>
  ({
    id,
    sessionId,
    status: "Ready",
    mediaAvailable: true,
    ...extra,
  }) as StoredJob;

async function storeWith(jobs: StoredJob[]) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "genobi-shared-history-"),
  );
  directories.push(directory);
  const store = new Store(directory);
  await store.load();
  store.data.jobs = jobs;
  return store;
}

describe("shared take history limits", () => {
  it("marks a direct read outside the history window without exposing private job fields", async () => {
    const older = job("older", "terminal", {
      origin: "terminal",
      providerId: "private-provider",
      idempotencyKey: "private-request",
    });
    const store = await storeWith([
      older,
      ...Array.from({ length: 50 }, (_, i) =>
        job(`newer-${i}`, "terminal", { origin: "terminal" }),
      ),
    ]);
    expect(
      (await historyOf(store, store.directory, "studio", true)).jobs.some(
        (item) => item.id === older.id,
      ),
    ).toBe(false);
    const direct = jobForReader(older, "studio");
    expect(direct).toMatchObject({
      id: "older",
      origin: "terminal",
      shared: true,
    });
    for (const field of ["sessionId", "providerId", "idempotencyKey"])
      expect(direct).not.toHaveProperty(field);
    expect(jobForReader(older, "terminal")).not.toHaveProperty("shared");
    expect(older).not.toHaveProperty("shared");
  });

  it("keeps the studio's own history and unfinished jobs when terminal results fill the shared list", async () => {
    const own = Array.from({ length: 50 }, (_, i) => job(`own-${i}`, "studio"));
    own[0].status = "Generating";
    const terminal = Array.from({ length: 60 }, (_, i) =>
      job(`terminal-${i}`, "terminal", { origin: "terminal" }),
    );
    const store = await storeWith([...own, ...terminal]);
    const result = await historyOf(store, store.directory, "studio", true);
    expect(
      result.jobs.filter((item) => !item.shared).map((item) => item.id),
    ).toEqual(own.map((item) => item.id).reverse());
    expect(
      result.jobs.filter((item) => item.shared).map((item) => item.id),
    ).toEqual(
      terminal
        .slice(-50)
        .map((item) => item.id)
        .reverse(),
    );
    const cli = await historyOf(store, store.directory, "terminal", false);
    expect(cli.jobs).toHaveLength(50);
    expect(cli.jobs.every((item) => !item.shared)).toBe(true);
  });

  it("excludes unfinished, unavailable and private takes while keeping mixed results newest first", async () => {
    const store = await storeWith([
      job("shared-old", "terminal", { origin: "terminal" }),
      job("own", "studio"),
      job("shared-new", "mcp", { origin: "agent" }),
      job("pending", "terminal", { origin: "terminal", status: "Generating" }),
      job("gone", "terminal", { origin: "terminal", mediaAvailable: false }),
      job("private", "another-studio"),
    ]);
    expect(
      (await historyOf(store, store.directory, "studio", true)).jobs.map(
        (item) => item.id,
      ),
    ).toEqual(["shared-new", "own", "shared-old"]);
  });
});
