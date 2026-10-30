import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createApp } from "../server/app";
import { BflClient, type ProviderSubmission } from "../server/bfl";
import { GenobiApi, studioUrl } from "../mcp/api";
import { createServer } from "../mcp/server";
import type { SubmitOptions } from "../shared/provider";

// Klein through the agent tools: the MCP schema accepts both Klein runs and
// the 1.5K tier, and the real local server prices and submits what it sent.
class FakeBfl extends BflClient {
  sent: { body: Record<string, unknown>; options?: SubmitOptions }[] = [];
  override async credits() {
    return 1250;
  }
  override async submit(
    _generator: unknown,
    body: object,
    _key: string,
    options?: SubmitOptions,
  ): Promise<ProviderSubmission> {
    this.sent.push({ body: body as Record<string, unknown>, options });
    return {
      id: "provider-1",
      polling_url: "https://api.bfl.ai/v1/get_result?id=provider-1",
    };
  }
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function agent() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "genobi-mcp-klein-"));
  cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  const bfl = new FakeBfl();
  const directory = path.join(temporary, ".local");
  // A BFL server key: Klein's API run is the one it can price and send.
  const { app } = await createApp({
    directory,
    publicDirectory: directory,
    serverKey: "test-server-key",
    providers: { bfl },
  });
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  cleanups.push(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const api = new GenobiApi(studioUrl(`http://127.0.0.1:${address.port}`));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(api).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  cleanups.push(() => client.close());
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { type: string; text: string }[])[0].text;
    return { error: result.isError === true, text };
  };
  return { bfl, call };
}

const klein = {
  generator: "image",
  model: "flux-3-klein-api",
  description: "A kite festival on a windy beach.",
  imageResolution: "1.5k",
  imageAspectRatio: "16:9",
};

describe("Klein through the MCP tools", () => {
  it("quotes and submits Klein's API run at 1.5K, once, as the studio would", async () => {
    const { bfl, call } = await agent();
    const quoted = await call("genobi_quote", klein);
    expect(quoted.error, quoted.text).toBe(false);
    const quote = JSON.parse(quoted.text);
    expect(quote).toMatchObject({
      estimateUsd: 0.011,
      recipe: { id: "flux-3-klein-api", route: "bfl" },
    });
    const submitted = await call("genobi_submit", {
      ...klein,
      quoteId: quote.quoteId,
      idempotencyKey: "klein-agent-0001",
    });
    expect(submitted.error, submitted.text).toBe(false);
    expect(bfl.sent).toHaveLength(1);
    expect(bfl.sent[0].options?.model).toBe("flux-3-klein-api");
    expect(bfl.sent[0].body).toEqual({
      prompt: klein.description,
      aspect_ratio: "16:9",
      resolution: "1.5k",
      safety_tolerance: 2,
    });
  });

  it("accepts the open run in its schema; the server says which key it needs", async () => {
    const { bfl, call } = await agent();
    const open = await call("genobi_quote", {
      ...klein,
      model: "flux-3-klein",
    });
    expect(open.error).toBe(true);
    expect(open.text).toMatch(/Connect a Comfy key/);
    // FLUX 3 Image has no 1.5K tier; the server, not the schema, says so.
    const flux = await call("genobi_quote", { ...klein, model: "flux-3" });
    expect(flux.error).toBe(true);
    expect(flux.text).toMatch(/supported image settings/);
    expect(bfl.sent).toHaveLength(0);
  });
});
