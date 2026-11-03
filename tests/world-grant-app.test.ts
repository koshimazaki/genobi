// The World grant through the real server (docs/world-live.md, "Spoken
// control"): the agent's run is resolved by the app's own `agents.scope`
// from its grant header, never substituted. Fake runner only.
import { expect, it } from "vitest";
import { agentStudio } from "./agent-harness";

it("reaches the granted tab only as the person's running session, resolved by the server", async () => {
  const studio = await agentStudio();
  const person = await studio.fresh();
  const world = (cookie: string, route: string, init: RequestInit = {}) =>
    fetch(`${studio.base}/api/world${route}`, {
      ...init,
      headers: {
        cookie,
        "Content-Type": "application/json",
        ...(init.headers as object),
      },
    });
  const { id } = await (
    await world(person, "/connect", { method: "POST", body: "{}" })
  ).json();
  const started = await studio.start(person, "grant hang");
  const [, grant] = await studio.waitFor(
    person,
    started.body.id,
    /^grant ([0-9a-f]{24})$/,
  );
  // The session's Genobi MCP server: the agent mark and its run grant.
  const marks = { "X-Genobi-Agent-Session": "1", "X-Genobi-Agent-Run": grant };
  const health = await fetch(`${studio.base}/api/health`, { headers: marks });
  const mcp = health.headers.get("set-cookie")!.split(";")[0];
  const agent = (route: string, init: RequestInit = {}) =>
    world(mcp, route, { ...init, headers: marks });
  // Before the grant nothing reaches the tab, and the agent cannot grant itself.
  expect((await agent("/granted")).status).toBe(404);
  expect(
    (
      await agent(`/${id}/grant`, {
        method: "POST",
        body: JSON.stringify({ run: started.body.id }),
      })
    ).status,
  ).toBe(404);
  // The person's tab grants the run; the agent then finds and lists it.
  const granted = await world(person, `/${id}/grant`, {
    method: "POST",
    body: JSON.stringify({ run: started.body.id }),
  });
  expect(granted.status).toBe(200);
  expect(await (await agent("/granted")).json()).toEqual({ id });
  expect((await agent(`/${id}/files`)).status).toBe(200);
  // Uploads stay the tab's own.
  expect(
    (await agent(`/${id}/files/clip.webm`, { method: "POST", body: "{}" }))
      .status,
  ).toBe(404);
  // A mark with a wrong run grant resolves to no scope: refused.
  const forged = { ...marks, "X-Genobi-Agent-Run": "0".repeat(24) };
  expect((await world(mcp, `/${id}/files`, { headers: forged })).status).toBe(
    404,
  );
  // Stopped, the run's scope is gone and so is the grant.
  await studio.call(person, `/sessions/${started.body.id}/stop`, {
    method: "POST",
  });
  await studio.settle(person, started.body.id);
  expect((await agent(`/${id}/files`)).status).toBe(404);
  expect((await agent("/granted")).status).toBe(404);
});
