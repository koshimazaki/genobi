import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run, commandError } from "../cli/run";
import { ProfileStore } from "../mcp/profile-store";
import { setup, input } from "./server-harness";
import { createServer } from "../mcp/server";
import { profileConnection } from "../mcp/connection";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const execute = promisify(execFile);
let directory: string;
let store: ProfileStore;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "genobi-cli-integration-"));
  store = new ProfileStore(directory);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("terminal → real local studio, fake paid provider", () => {
  it("runs the shipped bundle with JSON stdin and resolves its packaged skills", async () => {
    const options = {
      env: {
        ...process.env,
        GENOBI_CONFIG_DIR: directory,
        GENOBI_PROFILE: "default",
        GENOBI_AGENT_SESSION: "0",
        GENOBI_AGENT_RUN: "",
      },
    };
    const child = execute(
      process.execPath,
      ["plugins/genobi/server/genobi-cli.mjs", "scene", "--input", "-"],
      options,
    );
    child.child.stdin!.end(
      JSON.stringify({
        action: "create",
        id: "terminal-set",
        label: "Terminal set",
      }),
    );
    const created = await child;
    expect(created.stderr).toBe("");
    expect(JSON.parse(created.stdout)).toMatchObject({
      id: "terminal-set",
      label: "Terminal set",
    });
    const skill = await execute(
      process.execPath,
      [
        "plugins/genobi/server/genobi-cli.mjs",
        "skill",
        "--input",
        '{"name":"genobi-cli"}',
      ],
      options,
    );
    expect(skill.stderr).toBe("");
    expect(JSON.parse(skill.stdout)).toHaveProperty("name", "genobi-cli");
  });
  it("retains quote ownership across processes, gates spending and replays the same run", async () => {
    const studio = await setup();
    const cli = async (...argv: string[]) => {
      const result = await execute(
        process.execPath,
        ["--import", "tsx", "cli/main.ts", ...argv],
        {
          env: {
            ...process.env,
            GENOBI_CONFIG_DIR: directory,
            GENOBI_URL: studio.base,
            GENOBI_PROFILE: "default",
            GENOBI_AGENT_SESSION: "0",
            GENOBI_AGENT_RUN: "",
          },
        },
      );
      expect(result.stderr).toBe("");
      return JSON.parse(result.stdout);
    };
    const quote = await cli("quote", "--input", JSON.stringify(input));
    expect(studio.bfl.submissions).toBe(0);
    const submission = {
      ...input,
      quoteId: quote.quoteId,
      idempotencyKey: "cli-integration-1",
    };
    await expect(
      cli("submit", "--input", JSON.stringify(submission)),
    ).rejects.toMatchObject({
      code: 1,
      stdout: "",
      stderr: expect.stringContaining("--confirm"),
    });
    expect(studio.bfl.submissions).toBe(0);
    const job = await cli(
      "submit",
      "--confirm",
      "--input",
      JSON.stringify(submission),
    );
    const replay = await cli(
      "submit",
      "--confirm",
      "--input",
      JSON.stringify(submission),
    );
    expect(job.id).toBe(replay.id);
    expect(studio.bfl.submissions).toBe(1);
    expect(await cli("jobs")).toEqual([
      expect.objectContaining({ id: job.id }),
    ]);
    const other = await run(
      ["jobs", "--url", studio.base, "--profile", "other"],
      {
        env: {},
        store: await (async () => {
          await store.set("other", {});
          return store;
        })(),
      },
    );
    expect(other).toEqual([]);
  }, 20000);

  it("does not retry a lost write response and can recover its run from the same profile", async () => {
    const studio = await setup();
    const options = { env: { GENOBI_URL: studio.base }, store };
    const quote = (await run(
      ["quote", "--input", JSON.stringify(input)],
      options,
    )) as { quoteId: string };
    let writes = 0;
    const fetcher = (async (url, init) => {
      const response = await fetch(url, init);
      if (new URL(String(url)).pathname === "/api/jobs") {
        writes++;
        await response.text();
        throw new Error("Lost response after the reservation");
      }
      return response;
    }) as typeof fetch;
    const submission = {
      ...input,
      quoteId: quote.quoteId,
      idempotencyKey: "cli-lost-response",
    };
    let error;
    try {
      await run(
        ["submit", "--confirm", "--input", JSON.stringify(submission)],
        { ...options, fetcher },
      );
    } catch (caught) {
      error = caught;
    }
    expect(commandError(error)).toMatchObject({
      code: "outcome_unknown",
      message: expect.stringContaining("SAME idempotencyKey"),
    });
    expect(writes).toBe(1);
    expect(studio.bfl.submissions).toBe(1);
    expect(await run(["jobs"], options)).toEqual([
      expect.objectContaining({ id: expect.any(String) }),
    ]);
  });

  it("MCP and CLI share an explicitly selected connection profile", async () => {
    const studio = await setup();
    const options = {
      env: { GENOBI_PROFILE: "default", GENOBI_URL: studio.base },
      store,
    };
    const quote = (await run(
      ["quote", "--input", JSON.stringify(input)],
      options,
    )) as { quoteId: string };
    const connection = await profileConnection(options);
    const server = createServer(connection.api, {
      weights: "open-weights",
      execution: "local",
    });
    const client = new Client({ name: "cli-profile-test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const models = await client.callTool({
        name: "genobi_models",
        arguments: { status: "ready" },
      });
      const catalogue = JSON.parse(
        (models.content as { text: string }[])[0].text,
      ) as { open: boolean; runLocations: string[] }[];
      expect(catalogue.length).toBeGreaterThan(0);
      expect(
        catalogue.every(
          (model) => model.open && model.runLocations.includes("local"),
        ),
      ).toBe(true);
      const response = await client.callTool({
        name: "genobi_submit",
        arguments: {
          ...input,
          quoteId: quote.quoteId,
          idempotencyKey: "cli-mcp-parity-1",
        },
      });
      expect(response.isError).not.toBe(true);
      expect(studio.bfl.submissions).toBe(1);
      expect(await run(["jobs"], options)).toEqual([
        expect.objectContaining({ id: expect.any(String) }),
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
