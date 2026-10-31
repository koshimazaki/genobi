import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { setup } from "./server-harness";
import { newArena } from "../shared/arena";
import { arenaRunEntries, arenaRunInput } from "../shared/arena-run";
import { validateInput } from "../server/validation";

describe("Arena run requests", () => {
  it("builds a request every offered entry accepts, fitted to its controls", async () => {
    const entries = arenaRunEntries().map((e) => e.id);
    expect(entries).toEqual(
      expect.arrayContaining([
        "ltx-2-5-fast",
        "ltx-2-5-akuspace",
        "flux-3-video",
      ]),
    );
    // A prompt cannot supply a guide video or a start image.
    for (const id of [
      "minimax-h3",
      "minimax-h3-canny",
      "minimax-h3-depth",
      "minimax-h3-combined",
      "minimax-h3-router",
      "flux-3-i2v",
      "ltx-deploy-layout-to-video",
      "ltx-deploy-akuspace",
    ])
      expect(entries).not.toContain(id);
    for (const id of entries) {
      const input = arenaRunInput(id, "  A lighthouse at dusk. ", {
        duration: 7.4,
      });
      expect(validateInput(input)).toMatchObject({
        model: input.model,
        duration: input.duration,
        description: "A lighthouse at dusk.",
      });
    }
    // Stills carry references wherever the entry's controls take them; a
    // video entry takes none of the comparison's stills.
    const ref = `data:image/png;base64,${(
      await readFile("tests/fixtures/reference.png")
    ).toString("base64")}`;
    expect(
      arenaRunInput("flux-3-image", "Morph it", {}, [ref]).imageReferences,
    ).toHaveLength(1);
    expect(
      arenaRunInput("flux-3-klein", "Morph it", {}, [ref]).imageReferences,
    ).toHaveLength(1);
    expect(
      arenaRunInput("ltx-2-5-fast", "Morph it", {}, [ref]).imageReferences ??
        [],
    ).toEqual([]);
    // LTX offers whole Router durations: 7 seconds becomes 6.
    expect(arenaRunInput("ltx-2-5-fast", "x", { duration: 7 }).duration).toBe(
      6,
    );
    expect(arenaRunInput("ltx-2-5-akuspace", "x").acoustic).toBeTruthy();
    expect(arenaRunInput("flux-3-video", "x").acoustic).toBeUndefined();
  });

  it("refuses edits, unknown entries and an empty prompt", () => {
    expect(() => arenaRunInput("flux-3-edit", "x")).toThrow("video or image");
    expect(() => arenaRunInput("nope", "x")).toThrow("video or image");
    expect(() => arenaRunInput("ltx-deploy-akuspace", "x")).toThrow(
      "video or image",
    );
    expect(() => arenaRunInput("ltx-2-5-fast", "  ")).toThrow("prompt");
  });
});

describe("attaching a finished run to an approach", () => {
  it("copies an owned Ready run into the slot waiting for it, and only that one", async () => {
    const studio = await setup();
    studio.bfl.media = new Uint8Array(
      await readFile("tests/fixtures/metadata.mp4"),
    );
    studio.bfl.ready = true;
    const headers = {
      cookie: studio.cookie,
      "content-type": "application/json",
    };
    const submitted = await studio.post(crypto.randomUUID());
    const { job } = await submitted.json();
    let status = job.status;
    for (let i = 0; i < 20 && status !== "Ready"; i++)
      status = (
        await (
          await fetch(`${studio.base}/api/jobs/${job.id}`, { headers })
        ).json()
      ).job.status;
    expect(status).toBe("Ready");

    const draft = newArena();
    const created = await fetch(`${studio.base}/api/arena`, {
      method: "POST",
      headers,
      body: JSON.stringify(draft),
    });
    let { arena } = await created.json();
    const route = `${studio.base}/api/arena/${arena.id}`;
    const attach = (slot: string, body: object, cookie = studio.cookie) =>
      fetch(`${route}/slots/${slot}/result`, {
        method: "POST",
        headers: { ...headers, cookie },
        body: JSON.stringify(body),
      });

    // Not waiting for this run yet.
    expect((await attach("rgb", { jobId: job.id })).status).toBe(409);
    const updated = await fetch(route, {
      method: "POST",
      headers,
      body: JSON.stringify({
        revision: arena.revision,
        draft: {
          ...draft,
          slots: draft.slots.map((s) =>
            s.id === "rgb"
              ? {
                  ...s,
                  status: "running",
                  run: {
                    entry: "flux-3-video",
                    key: crypto.randomUUID(),
                    jobId: job.id,
                  },
                }
              : s,
          ),
        },
      }),
    });
    expect(updated.status).toBe(200);
    // Another session cannot attach a run it does not own.
    expect(
      (
        await attach(
          "rgb",
          { jobId: job.id },
          `camera_session=${crypto.randomUUID()}`,
        )
      ).status,
    ).toBe(404);
    expect((await attach("rgb", { jobId: "not-a-job" })).status).toBe(400);

    const attached = await attach("rgb", { jobId: job.id });
    expect(attached.status).toBe(200);
    ({ arena } = await attached.json());
    const slot = arena.slots.find((s: { id: string }) => s.id === "rgb");
    expect(slot.status).toBe("ready");
    expect(arena.media).toHaveLength(1);
    expect(slot.media).toBe(arena.media[0].hash);
    const media = await fetch(`${route}/files/${slot.media}`, { headers });
    // Native byte equality keeps a large assertion from blocking HTTP timers.
    expect(
      Buffer.from(await media.arrayBuffer()).equals(studio.bfl.media),
    ).toBe(true);
    // Attaching again finds the same bytes rather than storing a copy.
    const again = await (await attach("rgb", { jobId: job.id })).json();
    expect(again.arena.media).toHaveLength(1);
    expect(studio.bfl.submissions).toBe(1);
  }, 15000);
});

describe("Arena media writes", () => {
  it("removes a stored file again when its index write fails", async () => {
    const { mkdtemp, mkdir, readdir } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const { ArenaStore } = await import("../server/arena-store");
    const root = await mkdtemp(path.join(os.tmpdir(), "arena-orphan-"));
    const store = new ArenaStore(root);
    await store.load();
    const owner = crypto.randomUUID();
    const arena = await store.create(owner, newArena());
    // A directory where the temporary index goes makes the index write fail.
    await mkdir(path.join(store.directory, "index.json.tmp"));
    await expect(
      store.upload(arena.id, owner, Buffer.from("not really a video"), {
        kind: "video",
        contentType: "video/mp4",
        label: "x",
        width: 16,
        height: 16,
        duration: 1,
      }),
    ).rejects.toThrow();
    expect(await readdir(path.join(store.directory, arena.id))).toEqual([]);
    expect(store.get(arena.id, owner).media).toEqual([]);
  });
});
