import { describe, expect, it } from "vitest";
import {
  tasteShelfContext,
  tasteShelfSchema,
  tasteSources,
} from "../shared/licensing/taste-shelf";
import { TasteProfiles } from "../server/taste-profiles";
import { AGENT_MARK_HEADER } from "../shared/agent-session-events";
import { memoryHarness } from "./memory-harness";
import { AgentMemory } from "../server/agent-memory";
import type { Running } from "../server/agent-session-types";
import { GenobiApi } from "../mcp/api";
import { studio } from "./project-copy-harness";

describe("curated Taste shelf", () => {
  it("defaults old profiles to every source, preserves an empty selection, and validates custom references", () => {
    expect(tasteShelfContext().references).toEqual(tasteSources);
    expect(
      tasteShelfContext({ excluded: tasteSources.map((r) => r.id), custom: [] })
        .references,
    ).toEqual([]);
    const custom = {
      id: "custom-one",
      name: "Motion study",
      url: "https://example.com/study",
      note: "Slow motion",
    };
    expect(
      tasteShelfSchema.safeParse({ excluded: [], custom: [custom] }).success,
    ).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "http://127.0.0.1/",
      "https://user:secret@example.com/",
    ]) {
      expect(
        tasteShelfSchema.safeParse({
          excluded: [],
          custom: [{ ...custom, url }],
        }).success,
      ).toBe(false);
    }
    expect(
      tasteShelfSchema.safeParse({ excluded: [], custom: [custom, custom] })
        .success,
    ).toBe(false);
    expect(
      tasteShelfSchema.safeParse({
        excluded: [],
        custom: [{ ...custom, id: "three" }],
      }).success,
    ).toBe(false);
  });

  it("reloads shelf overrides from disk and includes them in project and no-project runner briefs", async () => {
    const h = await memoryHarness();
    const shelf = {
      excluded: ["three"],
      custom: [
        {
          id: "custom-one",
          name: "Music reference",
          url: "https://example.com/music",
          note: "Sparse rhythm",
        },
      ],
    };
    await h.profiles.setShelf("owner", 0, shelf);
    const reopened = new TasteProfiles(h.directory, h.projects);
    expect((await reopened.read("owner")).shelf).toEqual(shelf);
    await expect(
      reopened.setShelf("owner", 0, { excluded: [], custom: [] }),
    ).rejects.toThrow("changed");
    const memory = new AgentMemory({
      projects: h.projects,
      profiles: reopened,
    });
    const session = {
      owner: "owner",
      view: {
        id: "test-session",
        runner: "claude",
        prompt: "Review the project",
      },
    } as Running;
    for (const copyId of [undefined, h.copyId]) {
      const context = await memory.begin(session, copyId);
      expect(context?.tasteShelf.references).toContainEqual(shelf.custom[0]);
      expect(context?.tasteShelf.references.map((r) => r.id)).not.toContain(
        "three",
      );
    }
    expect((await reopened.read("other-owner")).shelf).toBeUndefined();
  });

  it("persists owner exclusions and custom references, rejects stale writes, and exposes them only through linked context", async () => {
    const h = await studio();
    await h.upload(h.cookie);
    await h.push(h.cookie, null, 1);
    const copyId = (
      (await h.send(h.cookie, "")).projects as { copyId: string }[]
    )[0].copyId;
    const call = async (
      route: string,
      body?: unknown,
      headers: Record<string, string> = {},
      cookie = h.cookie,
    ) => {
      const r = await fetch(`${h.base}/api/memory/${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          cookie,
          "Content-Type": "application/json",
          "X-Genobi-Owner-Action": "1",
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: await r.json() };
    };
    const shelf = {
      excluded: ["three", "uncommon-web"],
      custom: [
        {
          id: "custom-one",
          name: "My music reference",
          url: "https://example.com/music",
          note: "Sparse rhythmic structure",
        },
      ],
    };
    expect(
      (
        await call(
          "taste/shelf",
          { revision: 0, shelf },
          { [AGENT_MARK_HEADER]: "1" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "taste/shelf",
          { revision: 0, shelf },
          { "Sec-Fetch-Site": "cross-site" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "taste/shelf",
          { revision: 0, shelf },
          { "X-Genobi-Owner-Action": "" },
        )
      ).status,
    ).toBe(403);
    const saved = await call("taste/shelf", { revision: 0, shelf });
    expect(saved.status).toBe(200);
    expect(saved.body.revision).toBe(1);
    expect(saved.body.preferences).toEqual([]);
    expect(
      (
        await call("taste/shelf", {
          revision: 0,
          shelf: { excluded: [], custom: [] },
        })
      ).status,
    ).toBe(409);
    expect((await call("taste")).body.shelf).toEqual(shelf);
    const context = (await call(`projects/${copyId}/context`)).body;
    expect(context.tasteShelf.references).toContainEqual(shelf.custom[0]);
    expect(
      context.tasteShelf.references.map((r: { id: string }) => r.id),
    ).not.toContain("three");
    const api = new GenobiApi(new URL(h.base));
    const { code } = await h.send(h.cookie, `/${h.project.id}/link`, "POST");
    await api.post("/api/projects/link", { code });
    const linked = await api.get<{ tasteShelf: { references: unknown[] } }>(
      `/api/memory/projects/${copyId}/context`,
    );
    expect(linked.tasteShelf.references).toContainEqual(shelf.custom[0]);
    await expect(api.get("/api/memory/taste")).rejects.toThrow();
    const stranger = await h.fresh();
    expect(
      (await call(`projects/${copyId}/context`, undefined, {}, stranger))
        .status,
    ).toBe(404);
    expect(
      (await call("taste", undefined, {}, stranger)).body.shelf,
    ).toBeUndefined();
  });
});
