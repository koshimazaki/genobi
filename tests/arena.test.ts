import { startAgentSession } from "../src/agent/api";
import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { setup } from "./server-harness";
import { arenaDraft, draftOf, newArena, type Arena } from "../shared/arena";
import {
  arenaAgentPrompt,
  registerArenaContext,
} from "../src/arena/agent-context";

it("bounds approaches and refuses duplicate ids, foreign URLs and invalid preferences", () => {
  const draft = newArena();
  expect(
    arenaDraft.safeParse({ ...draft, slots: [draft.slots[0], draft.slots[0]] })
      .success,
  ).toBe(false);
  expect(
    arenaDraft.safeParse({ ...draft, slots: [...draft.slots, ...draft.slots] })
      .success,
  ).toBe(false);
  expect(arenaDraft.safeParse({ ...draft, preferred: "missing" }).success).toBe(
    false,
  );
  expect(
    arenaDraft.safeParse({
      ...draft,
      slots: draft.slots.map((s) => ({
        ...s,
        media: "https://other.test/video.mp4",
      })),
    }).success,
  ).toBe(false);
});

it("adds context only for the active Arena and leaves the prompt intact on removal", async () => {
  const stop = registerArenaContext(async () => ({
    id: "comparison-id",
    code: "one-use-code",
  }));
  try {
    expect(await arenaAgentPrompt("Compare these")).toContain(
      "genobi_arena action=link",
    );
  } finally {
    stop();
  }
  expect(await arenaAgentPrompt("Compare these")).toBe("Compare these");
});

describe("Arena ownership, persistence and concurrent edits", () => {
  it("pairs once, scopes media, rejects stale edits and survives restart", async () => {
    const studio = await setup();
    const owner = studio.cookie,
      agent = `camera_session=${crypto.randomUUID()}`,
      stranger = `camera_session=${crypto.randomUUID()}`;
    const send = (route: string, cookie: string, body?: unknown) =>
      fetch(studio.base + "/api/arena" + route, {
        method: body === undefined ? "GET" : "POST",
        headers: { cookie, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const created = await send("", owner, newArena());
    expect(created.status).toBe(201);
    let arena = (await created.json()).arena as Arena;
    expect((await send(`/${arena.id}`, stranger)).status).toBe(404);
    const { code } = await (await send(`/${arena.id}/link`, owner, {})).json();
    expect((await send("/link", agent, { code })).status).toBe(200);
    expect((await send("/link", stranger, { code })).status).toBe(404);
    expect((await send(`/${arena.id}/link`, agent, {})).status).toBe(404);
    const changed = { ...draftOf(arena), title: "Camera comparison" };
    const outcomes = await Promise.all([
      send(`/${arena.id}`, owner, { revision: 0, draft: changed }),
      send(`/${arena.id}`, agent, { revision: 0, draft: changed }),
    ]);
    expect(outcomes.map((r) => r.status).sort()).toEqual([200, 409]);
    arena = (await (await send(`/${arena.id}`, owner)).json()).arena;
    const bytes = await readFile("public/media/library-01.mp4");
    const uploaded = await fetch(
      `${studio.base}/api/arena/${arena.id}/files?name=result.mp4`,
      {
        method: "POST",
        headers: { cookie: agent, "content-type": "video/mp4" },
        body: bytes,
      },
    );
    expect(uploaded.status).toBe(201);
    const result = await uploaded.json();
    arena = result.arena;
    const route = `/${arena.id}/files/${result.media.hash}`;
    expect((await send(route, stranger)).status).toBe(404);
    const delivered = await send(route, owner);
    expect(delivered.status).toBe(200);
    expect(delivered.headers.get("content-type")).toContain("video/mp4");
    expect(Buffer.from(await delivered.arrayBuffer())).toEqual(bytes);
    const partial = await fetch(studio.base + "/api/arena" + route, {
      headers: { cookie: owner, range: "bytes=0-15" },
    });
    expect(partial.status).toBe(206);
    expect(Buffer.from(await partial.arrayBuffer())).toEqual(
      bytes.subarray(0, 16),
    );
    const invalid = await fetch(`${studio.base}/api/arena/${arena.id}/files`, {
      method: "POST",
      headers: { cookie: owner, "content-type": "video/mp4" },
      body: "not a video",
    });
    expect(invalid.status).toBe(400);
    const draft = draftOf(arena);
    draft.slots[0] = {
      ...draft.slots[0],
      media: result.media.hash,
      status: "ready",
    };
    expect(
      (await send(`/${arena.id}`, agent, { revision: arena.revision, draft }))
        .status,
    ).toBe(200);
    const reopened = await setup(
      undefined,
      undefined,
      undefined,
      undefined,
      studio.directory,
    );
    const own = await fetch(`${reopened.base}/api/arena/${arena.id}`, {
      headers: { cookie: owner },
    });
    expect((await own.json()).arena.slots[0].media).toBe(result.media.hash);
    expect(
      (
        await fetch(`${reopened.base}/api/arena/${arena.id}`, {
          headers: { cookie: agent },
        })
      ).status,
    ).toBe(404);
    expect(studio.bfl.submissions).toBe(0);
  }, 15_000);
});

it("does not mint Arena context during setup, voice or same-id pairing retries", async () => {
  const prepare = vi.fn(async () => ({ id: "arena", code: "code" }));
  const stop = registerArenaContext(prepare);
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ id: "session" })),
  );
  vi.stubGlobal("fetch", fetcher);
  try {
    for (const source of ["typed", "voice"] as const) {
      await startAgentSession(
        { prompt: "Pairing probe", source },
        "stable-start",
      );
      await startAgentSession(
        { prompt: "Pairing probe", source },
        "stable-start",
      );
    }
    expect(prepare).not.toHaveBeenCalled();
    expect(
      fetcher.mock.calls.every(
        (args) =>
          JSON.parse(String((args as unknown as [string, RequestInit])[1].body))
            .prompt === "Pairing probe",
      ),
    ).toBe(true);
    expect(await arenaAgentPrompt("Compare")).toContain("Active Arena");
    expect(prepare).toHaveBeenCalledTimes(1);
  } finally {
    stop();
    vi.unstubAllGlobals();
  }
});
