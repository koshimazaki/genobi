// `GET /api/voice/setup/found` starts a home-folder search and hashing, so
// only the studio itself may ask: the same-origin header is required, and an
// agent's session is refused. A plain cross-site GET (an image tag) is not.
import type { Server } from "node:http";
import express from "express";
import { afterEach, expect, it } from "vitest";
import { jsonErrors } from "../server/error-handler";
import { voiceRouter } from "../server/voice-routes";
import { AGENT_REQUEST_HEADER } from "../shared/agent-session-events";
import { cleanInstallRoots, installFixture } from "./voice-install-harness";

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanInstallRoots();
});

it("answers the studio only, never another site or an agent", async () => {
  const { installer, voice, deps } = await installFixture();
  const app = express();
  const who = { agent: false };
  app.use((_request, response, next) => {
    response.locals.sessionId = "person";
    response.locals.agent = who.agent;
    next();
  });
  app.use(
    "/api/voice",
    voiceRouter(voice, () => {}, installer),
  );
  app.use(jsonErrors);
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  const url = `http://127.0.0.1:${address.port}/api/voice/setup/found`;

  // No header (an <img> or no-cors fetch from any page): refused, no search.
  expect((await fetch(url)).status).toBe(403);
  // The header from another origin: refused too.
  const crossSite = await fetch(url, {
    headers: { [AGENT_REQUEST_HEADER]: "1", Origin: "https://example.com" },
  });
  expect(crossSite.status).toBe(403);
  expect(deps.discover).not.toHaveBeenCalled();

  const studio = { headers: { [AGENT_REQUEST_HEADER]: "1" } };
  const answer = await fetch(url, studio);
  expect(answer.status).toBe(200);
  expect(answer.headers.get("cache-control")).toBe("no-store");
  expect(await answer.json()).toEqual({ models: [] });
  expect(deps.discover).toHaveBeenCalledTimes(1);

  who.agent = true;
  expect((await fetch(url, studio)).status).toBe(403);
  expect(deps.discover).toHaveBeenCalledTimes(1);
});
