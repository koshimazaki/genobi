import { expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../mcp/server";
import type { GenobiApi } from "../mcp/api";
import { arenaTools } from "../mcp/arena-tools";
import { commandSchema, describeTool } from "../cli/commands";

it("publishes conditional requirements and rejects missing action fields before MCP or CLI I/O", async () => {
  const api = { get: vi.fn(), post: vi.fn(), postBytes: vi.fn() };
  const schema = describeTool(arenaTools[0]).inputSchema;
  expect(JSON.stringify(schema)).toContain('"allOf"');
  expect(
    commandSchema(arenaTools[0]).safeParse({ action: "link" }).success,
  ).toBe(false);
  const server = createServer(api as unknown as GenobiApi);
  const client = new Client({ name: "arena-validation", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const listed = (await client.listTools()).tools.find(
      (t) => t.name === "genobi_arena",
    )!;
    expect(JSON.stringify(listed.inputSchema)).toContain('"allOf"');
    const result = await client.callTool({
      name: "genobi_arena",
      arguments: { action: "update", id: crypto.randomUUID() },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("revision");
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await server.close();
  }
});
