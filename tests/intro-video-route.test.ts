// `GET /api/settings/intro-video`: the address setup's video card plays,
// from GENOBI_INTRO_VIDEO_URL. Null until one is configured; an address that
// is not https or a studio path reads as none; the studio's header required.
import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentRunnerSetting } from "../server/agent-runner-setting";
import { jsonErrors } from "../server/error-handler";
import { setupRouter } from "../server/setup-routes";

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function serve(introVideo?: string | null) {
  const app = express();
  app.use((_request, response, next) => {
    response.locals.sessionId = "person";
    next();
  });
  app.use(
    "/api",
    setupRouter({} as AgentRunnerSetting, () => {}, undefined, { introVideo }),
  );
  app.use(jsonErrors);
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  return (headers: Record<string, string> = { "X-Genobi-Agent": "1" }) =>
    fetch(`http://127.0.0.1:${address.port}/api/settings/intro-video`, {
      headers,
    });
}

describe("the intro video setting", () => {
  it("answers null when no address is configured", async () => {
    const read = await serve(null);
    const response = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ video: null });
  });

  it("answers the configured address", async () => {
    const read = await serve("https://example.com/genobi-intro.mp4");
    expect(await (await read()).json()).toEqual({
      video: "https://example.com/genobi-intro.mp4",
    });
  });

  it("reads an address that is not https or a studio path as none", async () => {
    const read = await serve("javascript:alert(1)");
    expect(await (await read()).json()).toEqual({ video: null });
  });

  it("needs the studio's own header", async () => {
    const read = await serve("https://example.com/genobi-intro.mp4");
    expect((await read({})).status).toBe(403);
  });
});
