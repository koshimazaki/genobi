import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app";
import { defaultLayout, movePanel } from "../src/studio/ninja-layout";
import { MAX_SAVED_LAYOUTS } from "../shared/saved-layouts";
import { LocalLayouts } from "../server/layouts";

// Saved layouts on the local server: one machine-wide file, so a restart and
// every browser (every session) read the same list.
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function folder() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "genobi-layouts-"));
  cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  return path.join(temporary, ".local");
}

async function studio(directory: string) {
  const { app } = await createApp({ directory, publicDirectory: directory });
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return (route: string, init: RequestInit = {}) =>
    fetch(`${base}/api/layouts${route}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
}

const arranged = movePanel(defaultLayout(), "stage", "tools");
const put = (id: string, body: unknown) => ({
  method: "PUT",
  body: JSON.stringify(body),
});

describe("/api/layouts on the local server", () => {
  it("saves, survives a restart for another browser, renames and deletes", async () => {
    const directory = await folder();
    const first = await studio(directory);
    expect(await (await first("")).json()).toEqual({ layouts: [] });
    const saved = await first(
      "/edit-day",
      put("edit-day", {
        name: "Edit day",
        layout: arranged,
        rails: { editor: true },
      }),
    );
    expect(saved.status).toBe(200);
    const file = path.join(directory, "layouts.json");
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readFile(file, "utf8")).not.toMatch(/session/i);

    // A second process, and a request with no session cookie of its own.
    const second = await studio(directory);
    const { layouts } = await (await second("")).json();
    expect(layouts).toHaveLength(1);
    expect(layouts[0]).toMatchObject({
      id: "edit-day",
      name: "Edit day",
      layout: arranged,
      rails: { editor: true },
    });
    // Rename keeps the arrangement.
    const renamed = await second(
      "/edit-day",
      put("edit-day", { name: "Cutting", layout: layouts[0].layout }),
    );
    expect((await renamed.json()).layouts[0]).toMatchObject({
      name: "Cutting",
      layout: arranged,
    });
    const removed = await second("/edit-day", { method: "DELETE" });
    expect(await removed.json()).toEqual({ layouts: [] });
    expect((await second("/edit-day", { method: "DELETE" })).status).toBe(404);
  });

  it("refuses invalid input, a taken name and a full list", async () => {
    const call = await studio(await folder());
    for (const [id, body] of [
      ["Bad Id", { name: "A", layout: arranged }],
      ["ok", { name: "", layout: arranged }],
      ["ok", { name: "A", layout: { format: "x" } }],
      ["ok", { name: "A", layout: arranged, project: { id: 1 } }],
      ["ok", { name: "A", layout: arranged, rails: { ninja: true } }],
    ] as const) {
      const answer = await call(`/${encodeURIComponent(id)}`, put(id, body));
      expect(answer.status).toBe(400);
      expect((await answer.json()).code).toBe("invalid");
    }
    const huge = await call("/big", put("big", { name: "x".repeat(20_000) }));
    expect(huge.status).toBe(413);
    for (let i = 0; i < MAX_SAVED_LAYOUTS; i++)
      expect(
        (
          await call(
            `/l${i}`,
            put(`l${i}`, { name: `L${i}`, layout: arranged }),
          )
        ).status,
      ).toBe(200);
    const taken = await call(
      "/again",
      put("again", { name: "l3", layout: arranged }),
    );
    expect(taken.status).toBe(409);
    expect((await taken.json()).code).toBe("name_taken");
    const full = await call(
      "/more",
      put("more", { name: "More", layout: arranged }),
    );
    expect((await full.json()).code).toBe("full");
  });

  it("reads a corrupt file as no layouts and an old entry migrated", async () => {
    const directory = await folder();
    await studio(directory); // creates the folder
    const file = path.join(directory, "layouts.json");
    await writeFile(file, "{ not json");
    expect(await (await (await studio(directory))("")).json()).toEqual({
      layouts: [],
    });
    await writeFile(
      file,
      JSON.stringify({
        format: "genobi.layouts",
        version: 1,
        layouts: [
          {
            id: "old",
            name: "Old",
            layout: {
              format: "genobi.ninja-layout",
              version: 1,
              panels: [{ id: "inputs", width: "half" }],
            },
            rails: {},
            updatedAt: "2026-10-01T00:00:00.000Z",
          },
          { id: "broken", name: 4 },
        ],
      }),
    );
    const { layouts } = await (await (await studio(directory))("")).json();
    expect(layouts).toHaveLength(1);
    expect(layouts[0].layout.panels).toEqual([{ id: "prompt", width: "half" }]);
  });

  it("keeps every overlapping save and delete, on the server and in the file", async () => {
    const directory = await folder();
    const call = await studio(directory);
    const body = (name: string) => ({ name, layout: arranged });
    // Saves in flight together, the first before the list was ever read.
    const names = ["one", "two", "three", "four", "five", "six"];
    const answers = await Promise.all(
      names.map((id) => call(`/${id}`, put(id, body(id.toUpperCase())))),
    );
    expect(answers.map((a) => a.status)).toEqual(names.map(() => 200));
    // Saves and deletes in flight together.
    await Promise.all([
      call("/seven", put("seven", body("Seven"))),
      call("/one", { method: "DELETE" }),
      call("/eight", put("eight", body("Eight"))),
      call("/two", { method: "DELETE" }),
    ]);
    const kept = ["eight", "five", "four", "seven", "six", "three"];
    const ids = (list: { id: string }[]) => list.map((l) => l.id).sort();
    expect(ids((await (await call("")).json()).layouts)).toEqual(kept);
    const file = JSON.parse(
      await readFile(path.join(directory, "layouts.json"), "utf8"),
    );
    expect(ids(file.layouts)).toEqual(kept);
  });

  it("serialises changes on a list already read, and a refusal does not stop the queue", async () => {
    const directory = await folder();
    await studio(directory); // creates the folder
    const layouts = new LocalLayouts(directory);
    await layouts.list();
    const body = (name: string) => ({ name, layout: arranged });
    const results = await Promise.allSettled([
      layouts.save("a", body("A")),
      layouts.save("b", body("B")),
      layouts.save("c", body("a")), // a taken name: refused
      layouts.remove("a"),
      layouts.save("d", body("D")),
    ]);
    expect(results.map((r) => r.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "rejected",
      "fulfilled",
      "fulfilled",
    ]);
    const reread = new LocalLayouts(directory);
    expect((await reread.list()).map((l) => l.id)).toEqual(["b", "d"]);
  });
});
