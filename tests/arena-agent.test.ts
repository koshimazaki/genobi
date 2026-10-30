import path from "node:path";
import { describe, expect, it } from "vitest";
import { setup } from "./server-harness";
import { newArena, type Arena } from "../shared/arena";
import { patchSlot } from "../shared/arena-run";
import { arenaTools } from "../mcp/arena-tools";
import { GenobiApi, studioUrl } from "../mcp/api";

const tool = arenaTools[0];

describe("Arena for agents", () => {
  it("links, adds studio media, edits one approach and asks the person to run", async () => {
    const studio = await setup(path.resolve("public"));
    const headers = {
      cookie: studio.cookie,
      "content-type": "application/json",
    };
    const created = await fetch(`${studio.base}/api/arena`, {
      method: "POST",
      headers,
      body: JSON.stringify(newArena()),
    });
    const { arena } = (await created.json()) as { arena: Arena };
    const route = `${studio.base}/api/arena/${arena.id}`;
    const { code } = await (
      await fetch(`${route}/link`, { method: "POST", headers })
    ).json();

    const api = new GenobiApi(studioUrl(studio.base));
    const run = (input: object) =>
      tool.run(api, input as never) as Promise<{ arena: Arena }>;
    await run({ action: "link", code });

    // A catalogue clip becomes the RGB approach's result.
    const added = await run({
      action: "add",
      id: arena.id,
      sourceId: "library-02",
      slot: "rgb",
    });
    const rgb = added.arena.slots.find((s) => s.id === "rgb")!;
    expect(rgb.status).toBe("ready");
    expect(added.arena.media.find((m) => m.hash === rgb.media)?.kind).toBe(
      "video",
    );
    // A local still uploaded straight into an approach: images are results too.
    const uploaded = await run({
      action: "upload",
      id: arena.id,
      filePath: "tests/fixtures/reference.png",
      slot: "depth",
    });
    const depth = uploaded.arena.slots.find((s) => s.id === "depth")!;
    expect(
      uploaded.arena.media.find((m) => m.hash === depth.media)?.contentType,
    ).toBe("image/png");
    // Another session's or an unknown id is never reachable.
    await expect(
      run({ action: "add", id: arena.id, sourceId: "not-here" }),
    ).rejects.toThrow();

    // One approach changed by voice, without resending the draft.
    const edited = await run({
      action: "set_slot",
      id: arena.id,
      slot: "canny",
      patch: { entry: "flux-3-image", prompt: "Morph into glass" },
    });
    const canny = edited.arena.slots.find((s) => s.id === "canny")!;
    expect(canny.run).toEqual({ entry: "flux-3-image" });
    expect(canny.model).toBe("FLUX 3 · Image");
    expect(canny.prompt).toBe("Morph into glass");

    // Asking is all an agent can do; an approach with no model is refused.
    await expect(
      run({ action: "request_run", id: arena.id, slots: ["rgb"] }),
    ).rejects.toThrow();
    const asked = await run({ action: "request_run", id: arena.id });
    expect(asked.arena.runRequest?.slots).toEqual(["canny"]);
    expect(studio.bfl.submissions).toBe(0);
    const cleared = await (
      await fetch(`${route}/run-request`, { method: "DELETE", headers })
    ).json();
    expect(cleared.arena.runRequest).toBeUndefined();
  }, 20000);

  it("patches one approach and keeps the rest of the draft", () => {
    const draft = newArena();
    const next = patchSlot(draft, "rgb", { entry: "ltx-2-5-fast" });
    expect(next.slots[0].run).toEqual({ entry: "ltx-2-5-fast" });
    expect(next.slots.slice(1)).toEqual(draft.slots.slice(1));
    expect(patchSlot(next, "rgb", { entry: null }).slots[0].run).toBe(
      undefined,
    );
    expect(() => patchSlot(draft, "nope", {})).toThrow("No approach");
    expect(() => patchSlot(draft, "rgb", { entry: "flux-3-edit" })).toThrow(
      "Run entries",
    );
  });
});
