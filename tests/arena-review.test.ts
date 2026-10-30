import { expect, it, vi } from "vitest";
import { readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { setup } from "./server-harness";
import { ArenaStore } from "../server/arena-store";
import { newArena } from "../shared/arena";
import { inspectArenaUpload, ARENA_MAX_BYTES } from "../shared/arena-upload";
import { arenaTools } from "../mcp/arena-tools";
import type { GenobiApi } from "../mcp/api";
import { validateArenaFile } from "../src/arena/upload-validation";
import { arenaList } from "../src/arena/client";
import type { Arena } from "../shared/arena";

it("keeps many video ranges out of the shared history allowance", async () => {
  const studio = await setup();
  const headers = { cookie: studio.cookie };
  const created = await fetch(`${studio.base}/api/arena`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(newArena()),
  });
  const { arena } = await created.json();
  const uploaded = await fetch(`${studio.base}/api/arena/${arena.id}/files`, {
    method: "POST",
    headers: { ...headers, "content-type": "video/mp4" },
    body: await readFile("tests/fixtures/metadata.mp4"),
  });
  const { media } = await uploaded.json();
  for (let i = 0; i < 70; i++) {
    const response = await fetch(
      `${studio.base}/api/arena/${arena.id}/files/${media.hash}`,
      { headers: { ...headers, range: "bytes=0-15" } },
    );
    expect(response.status).toBe(206);
    await response.arrayBuffer();
  }
  expect((await fetch(`${studio.base}/api/history`, { headers })).status).toBe(
    200,
  );
  expect((await fetch(`${studio.base}/api/arena`, { headers })).status).toBe(
    200,
  );
  const route = `${studio.base}/api/arena/${arena.id}`;
  expect(
    (
      await fetch(route, {
        method: "DELETE",
        headers: { cookie: `camera_session=${crypto.randomUUID()}` },
      })
    ).status,
  ).toBe(404);
  expect((await fetch(route, { method: "DELETE", headers })).status).toBe(200);
  expect(
    (await fetch(`${route}/files/${media.hash}`, { headers })).status,
  ).toBe(404);
}, 15000);

it("accepts a 25-second guide above the old upscale byte ceiling and bounds Arena inputs", async () => {
  const bytes = await readFile("tests/fixtures/metadata.mp4");
  const mvhd = bytes.indexOf("mvhd");
  expect(bytes[mvhd + 4]).toBe(0);
  bytes.writeUInt32BE(bytes.readUInt32BE(mvhd + 16) * 25, mvhd + 20);
  const read = async (at: number, length: number) =>
    new Uint8Array(bytes.subarray(at, at + length)).buffer;
  // Padding only affects declared size; metadata scanning must stay bounded.
  const metadata = await inspectArenaUpload(
    { kind: "video", contentType: "video/mp4" },
    60_000_000,
    read,
  );
  expect(metadata.duration).toBe(25);
  await expect(
    inspectArenaUpload(
      { kind: "video", contentType: "video/mp4" },
      ARENA_MAX_BYTES + 1,
      read,
    ),
  ).rejects.toThrow("64 MiB");
  bytes.writeUInt32BE(bytes.readUInt32BE(mvhd + 16) * 121, mvhd + 20);
  await expect(
    inspectArenaUpload(
      { kind: "video", contentType: "video/mp4" },
      bytes.length,
      read,
    ),
  ).rejects.toThrow("120 seconds");
  // Stills are results too now (image runs); other types stop in the browser.
  expect(() =>
    validateArenaFile({ size: 100, type: "image/png" }),
  ).not.toThrow();
  expect(() =>
    validateArenaFile({ size: 100, type: "video/quicktime" }),
  ).toThrow("MP4 video or a PNG");
  expect(() =>
    validateArenaFile({ size: ARENA_MAX_BYTES + 1, type: "video/mp4" }),
  ).toThrow("64 MiB");
});

it.each(["{truncated", "{}", '[{"owner":"bad","arena":{}}]'])(
  "isolates corrupt Arena storage without overwriting it: %s",
  async (bad) => {
    const first = await setup();
    const index = path.join(first.directory, "arena/index.json");
    await writeFile(index, bad);
    const reopened = await setup(
      undefined,
      undefined,
      undefined,
      undefined,
      first.directory,
    );
    expect((await fetch(`${reopened.base}/api/health`)).status).toBe(200);
    const headers = {
      cookie: first.cookie,
      "content-type": "application/json",
    };
    expect(
      (await fetch(`${reopened.base}/api/arena`, { headers })).status,
    ).toBe(503);
    expect(
      (
        await fetch(`${reopened.base}/api/arena`, {
          method: "POST",
          headers,
          body: JSON.stringify(newArena()),
        })
      ).status,
    ).toBe(503);
    expect(await readFile(index, "utf8")).toBe(bad);
  },
  15000,
);

it("deletes only owned comparisons, revokes links, removes media and releases the cap", async () => {
  const studio = await setup();
  const store = new ArenaStore(path.join(studio.directory, "delete-test"));
  await store.load();
  const owner = crypto.randomUUID(),
    linked = crypto.randomUUID();
  const a = await store.create(owner, newArena());
  store.link(store.code(a.id, owner), linked);
  await expect(store.remove(a.id, linked)).rejects.toMatchObject({
    status: 404,
  });
  const upload = await store.upload(a.id, owner, Buffer.from("fixture"), {
    kind: "image",
    label: "ref",
    contentType: "image/png",
    width: 1,
    height: 1,
    duration: 0,
  });
  for (let i = 1; i < 20; i++) await store.create(owner, newArena());
  await expect(store.create(owner, newArena())).rejects.toMatchObject({
    status: 507,
  });
  await store.remove(a.id, owner);
  await expect(
    access(path.join(store.directory, a.id, upload.media.hash)),
  ).rejects.toThrow();
  expect(() => store.get(a.id, linked)).toThrow();
  await expect(store.create(owner, newArena())).resolves.toBeDefined();
  const reopened = new ArenaStore(path.join(studio.directory, "delete-test"));
  await reopened.load();
  expect(reopened.list(owner)).toHaveLength(20);
});

it.each([
  { action: "link" },
  { action: "update", id: crypto.randomUUID(), draft: newArena() },
  { action: "upload", id: crypto.randomUUID() },
  { action: "create" },
])("refuses incomplete MCP actions before any request: %j", async (input) => {
  const api = { get: vi.fn(), post: vi.fn(), postBytes: vi.fn() };
  await expect(
    arenaTools[0].run(api as unknown as GenobiApi, input),
  ).rejects.toMatchObject({ name: "ZodError" });
  expect(api.post).not.toHaveBeenCalled();
  expect(api.get).not.toHaveBeenCalled();
  expect(api.postBytes).not.toHaveBeenCalled();
});

it("disables Arena on an answer without its list instead of blanking the studio", () => {
  // The list is rendered as an array, so a body without one must refuse:
  // writing `undefined` into that state took down every section at once.
  expect(arenaList({ arenas: [] })).toEqual([]);
  for (const body of [
    { jobs: [], sources: [] },
    {},
    null,
    undefined,
    { arenas: "no" },
  ])
    expect(() => arenaList(body)).toThrow(
      "Arena is disabled: its comparison list could not be read.",
    );
});

/** A whole comparison as the server returns one: the draft plus its metadata. */
const fullArena = (): Arena => ({
  ...newArena(),
  id: crypto.randomUUID(),
  revision: 3,
  updatedAt: new Date().toISOString(),
  media: [],
});

it("keeps renderable comparisons and drops rows the UI cannot render", () => {
  // Arena.tsx reads `draft.slots.map` and `arena.media.filter` the moment it
  // adopts a row, so a row that only carried {id, revision} passed the old
  // predicate and then blanked the studio with `undefined.map`. Every row is
  // now checked against the shared whole-record schema, nested data included.
  const hash = "a".repeat(64);
  const media = {
    hash,
    kind: "video" as const,
    label: "rgb.mp4",
    contentType: "video/mp4" as const,
    width: 1344,
    height: 768,
    duration: 5.167,
    bytes: 1_000,
  };
  const rich = (): Arena => {
    const base = fullArena();
    return {
      ...base,
      media: [media],
      slots: base.slots.map((slot, index) =>
        index === 0 ? { ...slot, media: hash, status: "ready" as const } : slot,
      ),
      runRequest: {
        slots: [base.slots[0].id],
        requestedAt: new Date().toISOString(),
      },
    };
  };
  const ready = fullArena();
  const withMedia = rich();
  const malformed = [
    null, // crashed on `a.id`
    7,
    "row",
    { id: "usable-row", revision: 3 }, // the observed accepted-incomplete row
    { ...fullArena(), slots: undefined }, // crashed on `draft.slots.map`
    { ...fullArena(), media: undefined }, // crashed on `arena.media.filter`
    { ...fullArena(), id: "not-a-uuid" },
    // A slot naming media the comparison does not hold (nested superRefine).
    {
      ...fullArena(),
      slots: fullArena().slots.map((slot, index) =>
        index === 0 ? { ...slot, media: hash } : slot,
      ),
    },
    // A run entry the registry contract would never accept.
    {
      ...fullArena(),
      slots: fullArena().slots.map((slot, index) =>
        index === 0 ? { ...slot, run: { entry: "Not An Entry" } } : slot,
      ),
    },
    // A run request with no approaches and a non-timestamp.
    { ...fullArena(), runRequest: { slots: [], requestedAt: "soon" } },
  ];
  expect(arenaList({ arenas: [ready, ...malformed, withMedia] })).toEqual([
    ready,
    withMedia,
  ]);
});
