import { describe, expect, it } from "vitest";
import { studio } from "./project-copy-harness";
import {
  NAMED_TAKE_IDS,
  namedTakeRecipe,
} from "../src/world-builder/named-takes";
import { defaultRecipe } from "../src/world-builder/recipe";
import { worldTools } from "../mcp/world-tools";

// The recipe hand-off: an agent linked to a project leaves a recipe for the
// person's open World Builder, which reports it applied or refused.
const expectedRevision = "00000000-0000-4000-8000-000000000001:0";

type Linked = { project: { copyId: string } };

async function linked() {
  const harness = await studio();
  const { cookie, fresh, send, upload, push, project } = harness;
  await upload(cookie);
  await push(cookie, null, 1);
  const agent = await fresh();
  const { code } = await send(cookie, `/${project.id}/link`, "POST");
  const { project: copy } = (await send(agent, "/link", "POST", {
    code,
  })) as unknown as Linked;
  const guardedSend: typeof send = (who, path, method = "GET", body) =>
    send(
      who,
      method === "GET" && path.endsWith("/world-recipe")
        ? `${path}?guarded=1`
        : path,
      method,
      method === "POST" && path.includes("/world-recipe")
        ? { expectedRevision, ...(body as object) }
        : body,
    );
  return {
    ...harness,
    send: guardedSend,
    legacySend: send,
    agent,
    copyId: copy.copyId,
  };
}

describe("World Builder recipe hand-off", () => {
  it("carries a named take from a linked agent to the owner's tab and back", async () => {
    const { cookie, agent, send, project, copyId } = await linked();
    expect(await send(cookie, `/${project.id}/world-recipe`)).toMatchObject({
      status: 200,
      sequence: 0,
      state: "none",
      recipe: null,
    });
    const sent = await send(agent, `/${copyId}/world-recipe`, "POST", {
      take: "falling-room",
    });
    expect(sent).toMatchObject({
      status: 202,
      sequence: 1,
      state: "waiting",
      take: "falling-room",
      // A session linked to the project is not the person who owns it.
      from: "agent",
    });
    expect(sent.recipe).toBeUndefined();
    // The owner's tab reads it by project id, the recipe the take names.
    const waiting = await send(cookie, `/${project.id}/world-recipe`);
    expect(waiting.recipe).toEqual(namedTakeRecipe("falling-room"));
    // Only the owner reports what the tab did.
    expect(
      await send(agent, `/${copyId}/world-recipe/applied`, "POST", {
        sequence: 1,
        ok: true,
      }),
    ).toMatchObject({ status: 403, code: "not_owner" });
    expect(
      await send(cookie, `/${project.id}/world-recipe/applied`, "POST", {
        sequence: 1,
        ok: true,
      }),
    ).toMatchObject({ status: 200, state: "applied" });
    expect(await send(agent, `/${copyId}/world-recipe`)).toMatchObject({
      state: "applied",
      sequence: 1,
    });
    // A second report of the same recipe is stale.
    expect(
      await send(cookie, `/${project.id}/world-recipe/applied`, "POST", {
        sequence: 1,
        ok: false,
      }),
    ).toMatchObject({ status: 409, code: "recipe_stale" });
  });

  it("refuses unguarded sends, deliveries and acknowledgements from older clients", async () => {
    const { agent, cookie, send, legacySend, copyId, project } = await linked();
    const route = `/${copyId}/world-recipe`;
    expect(
      await legacySend(agent, route, "POST", { take: "falling-room" }),
    ).toMatchObject({ status: 428, code: "recipe_revision_required" });
    expect(await send(agent, route)).toMatchObject({ state: "none" });
    await send(agent, route, "POST", { take: "falling-room" });
    const oldRead = await legacySend(cookie, `/${project.id}/world-recipe`);
    expect(oldRead).toMatchObject({
      status: 428,
      code: "recipe_client_update_required",
    });
    expect(oldRead.recipe).toBeUndefined();
    expect(
      await legacySend(cookie, `/${project.id}/world-recipe/applied`, "POST", {
        sequence: 1,
        ok: true,
      }),
    ).toMatchObject({ status: 428, code: "recipe_client_update_required" });
    expect(await send(agent, route)).toMatchObject({
      state: "waiting",
      expectedRevision,
    });
    expect(
      await send(cookie, `/${project.id}/world-recipe/applied`, "POST", {
        sequence: 1,
        expectedRevision: expectedRevision.replace(":0", ":1"),
        ok: true,
      }),
    ).toMatchObject({ status: 428 });
  });

  it("validates a recipe with the World Builder's own rules", async () => {
    const { agent, send, copyId, cookie, project } = await linked();
    expect(
      await send(agent, `/${copyId}/world-recipe`, "POST", {
        recipe: { ...defaultRecipe, frames: 100 },
      }),
    ).toMatchObject({
      status: 400,
      error: "Use 8k + 1 frames (9, 17, …, 241).",
    });
    expect(
      await send(agent, `/${copyId}/world-recipe`, "POST", { take: "nope" }),
    ).toMatchObject({ status: 400, code: "invalid_recipe" });
    expect(
      await send(agent, `/${copyId}/world-recipe`, "POST", {
        take: "falling-room",
        recipe: defaultRecipe,
      }),
    ).toMatchObject({ status: 400 });
    const ok = await send(agent, `/${copyId}/world-recipe`, "POST", {
      recipe: { ...defaultRecipe, orbit: 360, seconds: 10 },
    });
    expect(ok).toMatchObject({ status: 202, take: null });
    const read = await send(cookie, `/${project.id}/world-recipe`);
    expect((read.recipe as { frames: number }).frames).toBe(241);
    // The tab's refusal travels back in its words, control characters out.
    expect(
      await send(cookie, `/${project.id}/world-recipe/applied`, "POST", {
        sequence: ok.sequence,
        ok: false,
        error: "Stop preview\u0007 first.",
      }),
    ).toMatchObject({ state: "refused", error: "Stop preview  first." });
  });

  it("says who sent it: the person, the CLI or an agent session", async () => {
    const { cookie, agent, base, send, project, copyId } = await linked();
    const post = (who: string, headers: Record<string, string> = {}) =>
      fetch(`${base}/api/projects/${copyId}/world-recipe`, {
        method: "POST",
        headers: {
          cookie: who,
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ take: "falling-room", expectedRevision }),
      }).then((r) => r.json() as Promise<{ from: string }>);
    expect(
      (
        await send(cookie, `/${project.id}/world-recipe`, "POST", {
          take: "falling-room",
        })
      ).from,
    ).toBe("person");
    expect((await post(agent, { "X-Genobi-Client": "cli" })).from).toBe("cli");
    expect((await post(agent)).from).toBe("agent");
    // A studio-started agent session is an agent, whatever client it uses.
    expect(
      (
        await post(agent, {
          "X-Genobi-Client": "cli",
          "X-Genobi-Agent-Session": "1",
        })
      ).from,
    ).toBe("agent");
    expect(await send(agent, `/${copyId}/world-recipe`)).toMatchObject({
      from: "agent",
    });
  });

  it("is refused to a session the project is not linked to", async () => {
    const { fresh, send, copyId, project } = await linked();
    const stranger = await fresh();
    expect(await send(stranger, `/${copyId}/world-recipe`)).toMatchObject({
      status: 404,
    });
    expect(
      await send(stranger, `/${project.id}/world-recipe`, "POST", {
        take: "falling-room",
      }),
    ).toMatchObject({ status: 404 });
  });

  it("is an MCP tool that sends a take or a recipe and reads its state", async () => {
    const tool = worldTools.find((t) => t.name === "genobi_world_recipe")!;
    expect(tool.paid).toBeUndefined();
    const calls: [string, string, unknown?][] = [];
    const api = {
      get: async (path: string) => {
        calls.push(["GET", path]);
        return { state: "waiting", recipe: { frames: 145 } };
      },
      post: async (path: string, body: unknown) => {
        calls.push(["POST", path, body]);
        return { state: "waiting" };
      },
    } as never;
    const copyId = "falling-room.k7qm2xrpab";
    await tool.run(api, {
      action: "send",
      copyId,
      take: NAMED_TAKE_IDS[0],
      expectedRevision,
    });
    expect(await tool.run(api, { action: "status", copyId })).toEqual({
      state: "waiting",
      recipe: "held",
    });
    await expect(tool.run(api, { action: "send", copyId })).rejects.toThrow(
      "not both",
    );
    expect(calls).toEqual([
      [
        "POST",
        `/api/projects/${copyId}/world-recipe`,
        { take: "falling-room", expectedRevision },
      ],
      ["GET", `/api/projects/${copyId}/world-recipe?guarded=1`],
    ]);
  });
});
