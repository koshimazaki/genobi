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
import { tools } from "../mcp/tools";

const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";
const QUOTE = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const KEY = "run-0001-abc";
const input = {
  generator: "video",
  description: "A ceramic vessel.",
  presetId: "orbit_l",
  cameraEnabled: true,
  duration: 5,
  resolution: "hd",
};
const job = {
  id: "job-1",
  status: "Pending",
  prompt: "A ceramic vessel.",
  model: "flux-3",
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:00:00.000Z",
  costEstimateUsd: 0.25,
  keyMode: "server",
};
const tool = (name: string) => tools.find((t) => t.name === name)!;

interface Seen {
  method: string;
  path: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}
type Answer = { status?: number; body: unknown } | (() => never);

/** A stand-in studio: each route answers once per entry, in order. */
function fakeStudio(routes: Record<string, Answer[]>) {
  const seen: Seen[] = [];
  const fetcher = (async (url: URL, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
    // GenobiApi's session handshake; the cases below count what follows it.
    if (key === "GET /api/health" && !routes[key])
      return Response.json(
        { ok: true },
        { headers: { "Set-Cookie": `camera_session=${SESSION}; Path=/` } },
      );
    seen.push({
      method: init?.method ?? "GET",
      path: new URL(url).pathname,
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const answer = routes[key]?.shift();
    if (!answer) return Response.json({ error: "Not found." }, { status: 404 });
    if (typeof answer === "function") answer();
    const { status = 200, body } = answer as { status?: number; body: unknown };
    return Response.json(body, {
      status,
      headers: { "Set-Cookie": `camera_session=${SESSION}; Path=/` },
    });
  }) as typeof fetch;
  return {
    api: new GenobiApi(studioUrl("http://127.0.0.1:4317"), fetcher),
    seen,
  };
}
const offer = {
  id: QUOTE,
  estimateUsd: 0.25,
  recipe: { id: "flux-3-video", version: 1, route: "bfl" },
  expiresAt: "2026-10-20T10:10:00.000Z",
};
const brokenSocket = () => {
  throw new TypeError("fetch failed", {
    cause: Object.assign(new Error("other side closed sk-live-SECRET"), {
      code: "UND_ERR_SOCKET",
    }),
  });
};

describe("genobi_quote and genobi_submit", () => {
  it("send the quoted settings, then the Quote-Id and idempotency key with the same body", async () => {
    const { api, seen } = fakeStudio({
      "POST /api/quotes": [{ status: 201, body: { quote: offer } }],
      "POST /api/jobs": [{ status: 202, body: { job } }],
    });
    const quoted = (await tool("genobi_quote").run(api, input)) as Record<
      string,
      unknown
    >;
    expect(quoted).toMatchObject({
      quoteId: QUOTE,
      estimateUsd: 0.25,
      recipe: offer.recipe,
      expiresAt: offer.expiresAt,
    });
    expect(String(quoted.next)).toMatch(/agree to about \$0\.25/);
    const submitted = await tool("genobi_submit").run(api, {
      quoteId: QUOTE,
      idempotencyKey: KEY,
      ...input,
    });
    expect(submitted).toMatchObject({
      id: "job-1",
      status: "Pending",
      quoteId: QUOTE,
      idempotencyKey: KEY,
    });
    const [quote, submit] = seen;
    expect([quote.method, quote.path]).toEqual(["POST", "/api/quotes"]);
    expect(quote.headers.get("quote-id")).toBeNull();
    expect(submit.headers.get("quote-id")).toBe(QUOTE);
    expect(submit.headers.get("idempotency-key")).toBe(KEY);
    expect(submit.headers.get("content-type")).toBe("application/json");
    expect(submit.headers.get("cookie")).toBe(`camera_session=${SESSION}`);
    // The confirmation travels in headers only; the bodies are the same settings.
    expect(submit.body).toEqual(quote.body);
    expect(submit.body).not.toHaveProperty("quoteId");
    expect(submit.body).toMatchObject({ draft: false, upscaleFactor: 2 });
    // The MCP server holds no key and sends none.
    for (const request of seen) {
      expect(request.headers.get("x-byo-key")).toBeNull();
      expect(request.headers.get("authorization")).toBeNull();
    }
  });

  it("never retries a submission whose answer was lost, and says how to recover", async () => {
    const { api, seen } = fakeStudio({ "POST /api/jobs": [brokenSocket] });
    const submit = tool("genobi_submit").run(api, {
      quoteId: QUOTE,
      idempotencyKey: KEY,
      ...input,
    });
    await expect(submit).rejects.toThrow(/Outcome uncertain/);
    const message = await submit.catch((error: Error) => error.message);
    expect(message).toContain(`SAME idempotencyKey "${KEY}"`);
    expect(message).toMatch(/genobi_jobs/);
    expect(message).toMatch(/Do not submit again with a new idempotencyKey/);
    expect(message).not.toContain("SECRET");
    expect(seen).toHaveLength(1);
  });

  it("treats a server failure on submit as uncertain, without a second request", async () => {
    const { api, seen } = fakeStudio({
      "POST /api/jobs": [
        {
          status: 500,
          body: { error: "The local server could not complete this request." },
        },
      ],
    });
    await expect(
      tool("genobi_submit").run(api, {
        quoteId: QUOTE,
        idempotencyKey: KEY,
        ...input,
      }),
    ).rejects.toThrow(/Outcome uncertain: Genobi answered 500/);
    expect(seen).toHaveLength(1);
  });

  it("says the studio is down when the connection was refused, since nothing was sent", async () => {
    let calls = 0;
    const api = new GenobiApi(studioUrl(), (async () => {
      calls++;
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }),
      });
    }) as typeof fetch);
    await expect(
      tool("genobi_submit").run(api, {
        quoteId: QUOTE,
        idempotencyKey: KEY,
        ...input,
      }),
    ).rejects.toThrow(/not running.*npm run dev/);
    expect(calls).toBe(1);
  });

  it("explains each quote refusal and passes only the studio's own words", async () => {
    const refusals = [
      ["quote_expired", 410, /ask genobi_quote for a new one/i],
      ["quote_used", 409, /already paid for a run/],
      ["quote_mismatch", 409, /differ from the quoted ones/],
      ["quote_missing", 404, /new quote/],
    ] as const;
    for (const [code, status, next] of refusals) {
      const { api } = fakeStudio({
        "POST /api/jobs": [
          {
            status,
            body: { error: "Refused.", code, detail: "x-byo-key: sk-SECRET" },
          },
        ],
      });
      const message = await tool("genobi_submit")
        .run(api, { quoteId: QUOTE, idempotencyKey: KEY, ...input })
        .catch((error: Error) => error.message);
      expect(message).toContain(`Refused. (${code})`);
      expect(message).toMatch(next);
      expect(message).not.toContain("SECRET");
    }
  });

  it("asks the server, not the agent, to bound a quote", async () => {
    const { api } = fakeStudio({
      "POST /api/quotes": [
        {
          status: 400,
          body: {
            error: "Choose a whole number of seconds between 5 and 20.",
            code: "request_failed",
          },
        },
      ],
    });
    await expect(
      tool("genobi_quote").run(api, { ...input, duration: 99 }),
    ).rejects.toThrow(/^Choose a whole number of seconds between 5 and 20\.$/);
  });
});

describe("genobi_take", () => {
  it("reads a finished take and explains one that is not ready or missing", async () => {
    const take = { version: 1, operationId: "job-1", outputs: [] };
    const { api } = fakeStudio({
      "GET /api/takes/job-1": [
        { body: { take } },
        {
          status: 409,
          body: {
            error: "This take is not ready yet.",
            code: "take_not_ready",
          },
        },
        {
          status: 404,
          body: {
            error: "This run was recorded before takes existed.",
            code: "take_missing",
          },
        },
      ],
    });
    const run = () => tool("genobi_take").run(api, { id: "job-1" });
    expect(await run()).toEqual(take);
    await expect(run()).rejects.toThrow(/no take yet.*genobi_job/);
    await expect(run()).rejects.toThrow(/before takes were recorded/);
    await expect(run()).rejects.toThrow("Not found.");
  });
});

describe("MCP schemas for paid tools", () => {
  it("refuse a submission without a quote or a valid key before calling the studio", async () => {
    const { api, seen } = fakeStudio({});
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(api).connect(serverSide);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
    const listed = await client.listTools();
    const annotations = (name: string) =>
      listed.tools.find((t) => t.name === name)?.annotations;
    expect(annotations("genobi_quote")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
    expect(annotations("genobi_submit")).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(annotations("genobi_take")).toMatchObject({
      readOnlyHint: true,
      idempotentHint: true,
    });
    const submit = listed.tools.find((t) => t.name === "genobi_submit")!;
    expect(submit.inputSchema.required).toEqual(
      expect.arrayContaining(["quoteId", "idempotencyKey", "generator"]),
    );
    expect(submit.description).toMatch(/spends the person's money/);
    for (const args of [
      { idempotencyKey: KEY, ...input },
      { quoteId: QUOTE, ...input },
      { quoteId: QUOTE, idempotencyKey: "short", ...input },
      { quoteId: "not-a-quote", idempotencyKey: KEY, ...input },
    ]) {
      const result = await client.callTool({
        name: "genobi_submit",
        arguments: args,
      });
      expect(result.isError).toBe(true);
    }
    expect(seen).toHaveLength(0);
    await client.close();
  });
});

class FakeBfl extends BflClient {
  submissions = 0;
  override async credits() {
    return 1250;
  }
  override async submit(): Promise<ProviderSubmission> {
    this.submissions++;
    return {
      id: "provider-1",
      polling_url: "https://api.bfl.ai/v1/get_result?id=provider-1",
      cost: 25,
    };
  }
  override async poll() {
    return { id: "provider-1", status: "Generating" };
  }
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** The real local server on a loopback port, with a fake provider behind it. */
async function localStudio() {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "genobi-mcp-test-"));
  cleanups.push(() => rm(temporary, { recursive: true, force: true }));
  const bfl = new FakeBfl();
  const directory = path.join(temporary, ".local");
  const { app, store } = await createApp({
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
  const url = studioUrl(`http://127.0.0.1:${address.port}`);
  const api = new GenobiApi(url);
  return { api, bfl, store, url };
}

describe("MCP against the local server", () => {
  it("quotes, submits once, replays the same key without paying again and refuses other settings", async () => {
    const { api, bfl, store } = await localStudio();
    const quoted = (await tool("genobi_quote").run(api, input)) as {
      quoteId: string;
      estimateUsd: number;
    };
    expect(bfl.submissions).toBe(0);
    const args = { quoteId: quoted.quoteId, idempotencyKey: KEY, ...input };
    const first = (await tool("genobi_submit").run(api, args)) as {
      id: string;
      status: string;
      estimateUsd: number;
    };
    expect(first).toMatchObject({
      status: "Pending",
      estimateUsd: quoted.estimateUsd,
    });
    expect(store.data.quotes.find((q) => q.id === quoted.quoteId)?.jobId).toBe(
      first.id,
    );
    // A repeated submission with the same key is the same run, paid once.
    const again = (await tool("genobi_submit").run(api, args)) as {
      id: string;
    };
    expect(again.id).toBe(first.id);
    expect(bfl.submissions).toBe(1);
    // The spent quote cannot pay for a new run.
    await expect(
      tool("genobi_submit").run(api, {
        ...args,
        idempotencyKey: "run-0002-abc",
      }),
    ).rejects.toThrow(/quote_used.*already paid/);
    // A quote covers the settings it priced.
    const fresh = (await tool("genobi_quote").run(api, input)) as {
      quoteId: string;
    };
    await expect(
      tool("genobi_submit").run(api, {
        ...args,
        quoteId: fresh.quoteId,
        idempotencyKey: "run-0003-abc",
        duration: 6,
      }),
    ).rejects.toThrow(/quote_mismatch/);
    expect(bfl.submissions).toBe(1);
    // The run is still generating, so its take is not ready.
    await expect(
      tool("genobi_take").run(api, { id: first.id }),
    ).rejects.toThrow(/no take yet/);
  });

  it("refuses the same key after an MCP restart instead of paying again", async () => {
    const { api, bfl, url } = await localStudio();
    const quoted = (await tool("genobi_quote").run(api, input)) as {
      quoteId: string;
    };
    await tool("genobi_submit").run(api, {
      quoteId: quoted.quoteId,
      idempotencyKey: KEY,
      ...input,
    });
    // A restarted MCP server has a new client, so a new studio session.
    const restarted = new GenobiApi(url);
    expect(await tool("genobi_jobs").run(restarted, {})).toEqual([]);
    const requoted = (await tool("genobi_quote").run(restarted, input)) as {
      quoteId: string;
    };
    await expect(
      tool("genobi_submit").run(restarted, {
        quoteId: requoted.quoteId,
        idempotencyKey: KEY,
        ...input,
      }),
    ).rejects.toThrow(/idempotency_other_session.*Do not submit it again/);
    expect(bfl.submissions).toBe(1);
  });
});
