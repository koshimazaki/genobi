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
import { budgetVerdict } from "../mcp/budget-tools";
import { createServer } from "../mcp/server";
import { ServerKeys } from "../server/keys";
import { FakeKeychain } from "./keys-harness";

// The studio's budget as an agent sees it: the MCP server carries no key, so
// its runs use a key the studio holds. The demo key is held to three per
// session per day and $5 a day; a key the owner saved is uncapped. A recipe
// that does not fit is refused before its first quote.
class FakeBfl extends BflClient {
  sent = 0;
  override async credits() {
    return 1250;
  }
  override async submit(): Promise<ProviderSubmission> {
    this.sent++;
    return {
      id: `provider-${this.sent}`,
      polling_url: `https://api.bfl.ai/v1/get_result?id=provider-${this.sent}`,
    };
  }
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function agent(serverKey?: string, keys?: ServerKeys) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "genobi-budget-"));
  cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  const bfl = new FakeBfl();
  const directory = path.join(temporary, ".local");
  const { app } = await createApp({
    directory,
    publicDirectory: directory,
    serverKey,
    keys,
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
    const text = (result.content as { text: string }[])[0].text;
    return { error: result.isError === true, text };
  };
  return { bfl, call };
}

const still = {
  generator: "image",
  model: "flux-3-klein-api",
  description: "A kite festival on a windy beach.",
  imageResolution: "1k",
  imageAspectRatio: "16:9",
};

describe("genobi_budget", () => {
  it("refuses a four-run recipe before any quote, once three runs are all that is left", async () => {
    const { bfl, call } = await agent("test-server-key");
    const fresh = JSON.parse((await call("genobi_budget", {})).text);
    expect(fresh).toEqual({
      hasServerKey: true,
      payer: "server",
      uncapped: false,
      countsLocalRuns: false,
      sessionLimit: 3,
      budgetUsd: 5,
      runsLeft: 3,
      usdLeft: 5,
    });
    const four = JSON.parse(
      (await call("genobi_budget", { runs: 4, usd: 1.43 })).text,
    );
    expect(four.fits).toBe(false);
    expect(four.next).toMatch(/needs 4 runs and this session has 3 left/);
    expect(four.next).toMatch(/Do not quote or submit/);
    const three = JSON.parse(
      (await call("genobi_budget", { runs: 3, usd: 1.42 })).text,
    );
    expect(three.fits).toBe(true);
    expect(bfl.sent).toBe(0);
  });

  it("counts what the session spent, with the same rule submission enforces", async () => {
    const { bfl, call } = await agent("test-server-key");
    for (let i = 0; i < 3; i++) {
      const quote = JSON.parse((await call("genobi_quote", still)).text);
      const submitted = await call("genobi_submit", {
        ...still,
        quoteId: quote.quoteId,
        idempotencyKey: `budget-run-000${i}`,
      });
      expect(submitted.error, submitted.text).toBe(false);
    }
    expect(bfl.sent).toBe(3);
    const left = JSON.parse(
      (await call("genobi_budget", { runs: 1, usd: 0.009 })).text,
    );
    expect(left).toMatchObject({ runsLeft: 0, fits: false });
    expect(left.usdLeft).toBeCloseTo(5 - 3 * 0.009);
    // The studio refuses the fourth too: the check and the rule agree.
    const fourth = await call("genobi_quote", still);
    expect(fourth.error).toBe(true);
    expect(fourth.text).toMatch(/budget/);
  });

  it("fits a recipe by its price alone when the owner's saved key pays", async () => {
    const keychain = new FakeKeychain();
    keychain.items.set("comfy", "comfyui-0123456789abcdef");
    const { bfl, call } = await agent(undefined, new ServerKeys({}, keychain));
    const verdict = JSON.parse(
      (await call("genobi_budget", { runs: 4, usd: 8 })).text,
    );
    expect(verdict).toMatchObject({
      payer: "owner",
      uncapped: true,
      fits: true,
    });
    expect(verdict.next).toMatch(/owner's own key pays.*\$8\.00/);
    expect(verdict.next).toMatch(/ask the person before any submit/);
    expect(bfl.sent).toBe(0);
  });

  it("holds a studio with any environment key to the demo budget", async () => {
    const keychain = new FakeKeychain();
    keychain.items.set("bfl", "bfl-0123456789abcdef");
    const keys = ServerKeys.fromEnvironment(
      { COMFY_API_KEY: "comfyui-0123456789abcdef" },
      keychain,
    );
    const { call } = await agent(undefined, keys);
    const verdict = JSON.parse(
      (await call("genobi_budget", { runs: 4, usd: 1 })).text,
    );
    expect(verdict).toMatchObject({ payer: "server", fits: false });
  });

  it("leaves a recipe's local runs out of the run count", () => {
    const budget = {
      hasServerKey: true,
      countsLocalRuns: false as const,
      sessionLimit: 3,
      budgetUsd: 5,
      runsLeft: 1,
      usdLeft: 5,
    };
    expect(budgetVerdict(budget, 3, 0.5, 2)).toMatchObject({ fits: true });
    const over = budgetVerdict(budget, 3, 0.5, 1) as {
      fits: boolean;
      next: string;
    };
    expect(over.fits).toBe(false);
    expect(over.next).toMatch(/needs 2 runs beside its free local ones/);
    // A studio that counts every run gives local ones no exemption.
    const older = { ...budget, countsLocalRuns: undefined };
    expect(budgetVerdict(older, 3, 0.5, 2)).toMatchObject({ fits: false });
  });

  it("says a studio without a key fits nothing, and names a dollar shortfall", () => {
    const budget = {
      hasServerKey: false,
      sessionLimit: 3,
      budgetUsd: 5,
      runsLeft: 3,
      usdLeft: 0.5,
    };
    const verdict = budgetVerdict(budget, 3, 1.42);
    expect(verdict).toMatchObject({ fits: false });
    expect((verdict as { next: string }).next).toMatch(
      /holds no provider key; the recipe needs about \$1\.42 and the studio's budget has \$0\.50 left/,
    );
  });
});
