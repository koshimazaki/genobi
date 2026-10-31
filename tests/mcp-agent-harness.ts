import { afterEach, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GenobiApi, studioUrl } from "../mcp/api";
import { createServer } from "../mcp/server";

const clients: Client[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
});

/** Real MCP schema/transport, over either the local HTTP server or a bounded fake. */
export async function mcpAgent(api: GenobiApi | string) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(
    typeof api === "string" ? new GenobiApi(studioUrl(api)) : api,
  ).connect(serverSide);
  const client = new Client({ name: "agent-parity-test", version: "0" });
  await client.connect(clientSide);
  clients.push(client);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return {
      error: result.isError === true,
      text: (result.content as { text: string }[])[0].text,
    };
  };
  const json = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await call(name, args);
    expect(result.error, result.text).toBe(false);
    return JSON.parse(result.text);
  };
  return { call, json, client };
}
