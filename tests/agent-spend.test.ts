// The spending guard: an agent's browser signs in with a one-use ticket and
// gets a studio session marked as an agent's; the agent's MCP server and
// browser also mark every request. Each paid route refuses both, and the
// person's own session is not affected.
import { describe, expect, it } from "vitest";
import { PAID_ROUTES } from "../server/agent-routes";
import { input } from "./server-harness";
import { agentStudio, fakeConfig } from "./agent-harness";

async function withAgentBrowser() {
  const studio = await agentStudio({
    config: await fakeConfig({ browser: true, npx: "/usr/bin/true" }),
  });
  const person = await studio.fresh();
  const { body } = await studio.start(person, "ticket hang");
  const [, ticket] = await studio.waitFor(
    person,
    body.id,
    /^ticket (\/api\/agent\/ticket\/[A-Za-z0-9_-]+)$/,
  );
  const opened = await fetch(`${studio.base}${ticket}`, { redirect: "manual" });
  expect(opened.status).toBe(303);
  expect(opened.headers.get("location")).toBe("/");
  const agent = opened.headers.get("set-cookie")!.split(";")[0];
  expect(agent).toMatch(/^camera_session=[0-9a-f-]{36}$/);
  expect(agent).not.toBe(person);
  return { studio, person, agent, ticket, sessionId: body.id as string };
}

const paid = (base: string, route: string, headers: Record<string, string>) =>
  fetch(`${base}${route.replace(":id", crypto.randomUUID())}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
      "Quote-Id": crypto.randomUUID(),
      ...headers,
    },
    body: JSON.stringify(input),
  });

describe("agent sessions cannot spend", () => {
  it("lists the routes that spend", () => {
    expect(PAID_ROUTES).toEqual([
      "/api/jobs",
      "/api/chains/:id/approve",
      "/api/agent/sessions/:id/approvals/:quote/approve",
      "/api/upscale-parts/:id/confirm",
      "/api/upscale-parts/:id/parts/:index/confirm",
    ]);
  });

  it.each(PAID_ROUTES)(
    "%s refuses the agent's ticket session, with a message for the person",
    async (route) => {
      const { studio, agent } = await withAgentBrowser();
      const response = await paid(studio.base, route, { cookie: agent });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error:
          "An agent cannot spend. The person approves paid steps in their own studio.",
        code: "agent_cannot_spend",
      });
      expect(studio.bfl.submissions).toBe(0);
    },
  );

  it.each(PAID_ROUTES)(
    "%s refuses a request marked by the agent's MCP server or browser",
    async (route) => {
      const studio = await agentStudio();
      const cookie = await studio.fresh();
      const response = await paid(studio.base, route, {
        cookie,
        "X-Genobi-Agent-Session": "1",
      });
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe("agent_cannot_spend");
      expect(studio.bfl.submissions).toBe(0);
    },
  );

  it.each(PAID_ROUTES)(
    "%s still serves the person's own session",
    async (route) => {
      const { studio, person } = await withAgentBrowser();
      const response = await paid(studio.base, route, { cookie: person });
      expect((await response.json()).code).not.toBe("agent_cannot_spend");
    },
  );

  it("lets the agent's session read, quote and edit, but not start an agent", async () => {
    const { studio, agent } = await withAgentBrowser();
    expect(
      (
        await fetch(`${studio.base}/api/history`, {
          headers: { cookie: agent },
        })
      ).status,
    ).toBe(200);
    const quote = await fetch(`${studio.base}/api/quotes`, {
      method: "POST",
      headers: { cookie: agent, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    expect((await quote.json()).code).not.toBe("agent_cannot_spend");
    const nested = await studio.call(agent, "/sessions", {
      method: "POST",
      body: { prompt: "Start another", source: "typed" },
    });
    expect(nested).toMatchObject({
      status: 403,
      body: { code: "agent_nested" },
    });
  });

  it("spends a ticket once, and never after its run ends", async () => {
    const { studio, person, ticket, sessionId } = await withAgentBrowser();
    const again = await fetch(`${studio.base}${ticket}`, {
      redirect: "manual",
    });
    expect(again.status).toBe(404);
    expect(again.headers.get("set-cookie")).toBeNull();
    expect((await fetch(`${studio.base}/api/agent/ticket/short`)).status).toBe(
      404,
    );
    // A second ticket from a session that has since stopped is refused.
    await studio.call(person, `/sessions/${sessionId}/stop`, {
      method: "POST",
    });
    await studio.settle(person, sessionId);
    const after = await studio.start(person, "ticket only");
    const [, late] = await studio.waitFor(
      person,
      after.body.id,
      /^ticket (\/api\/agent\/ticket\/[A-Za-z0-9_-]+)$/,
    );
    await studio.settle(person, after.body.id);
    const spent = await fetch(`${studio.base}${late}`, { redirect: "manual" });
    expect(spent.status).toBe(404);
  });

  it("refuses a ticket on a host that is not loopback", async () => {
    const { studio, ticket } = await withAgentBrowser();
    const { request } = await import("node:http");
    const status = await new Promise<number>((resolve, reject) => {
      const url = new URL(`${studio.base}${ticket}`);
      request(
        {
          host: url.hostname,
          port: url.port,
          path: url.pathname,
          headers: { Host: "evil.example" },
        },
        (response) => resolve(response.statusCode ?? 0),
      )
        .on("error", reject)
        .end();
    });
    expect(status).toBe(403);
  });
});
