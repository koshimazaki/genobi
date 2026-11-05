import { createHash } from "node:crypto";
import { expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { GenobiApi, studioUrl } from "../mcp/api";
import { createServer } from "../mcp/server";
import { base } from "./house-template-fixtures";
import { setup } from "./server-harness";

// An agent over MCP against the real local server: it sees nothing until the
// studio's owner links the project, then reads it and sends a command that
// the owner's next push has to build on.
export async function linkedStudio() {
  const harness = await setup();
  const { base: url, cookie } = harness;
  const bundle = base();
  const { project } = bundle;
  for (const bytes of new Set(bundle.files.values()))
    await fetch(
      `${url}/api/projects/${project.id}/files/${createHash("sha256").update(bytes).digest("hex")}`,
      {
        method: "PUT",
        headers: { cookie, "Content-Type": "application/octet-stream" },
        body: bytes,
      },
    );
  const owner = (route: string, method: string, body?: unknown) =>
    fetch(`${url}/api/projects/${project.id}${route}`, {
      method,
      headers: { cookie, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).then(
      async (r) =>
        ({
          ...((await r.json()) as object),
          status: r.status,
        }) as Record<string, unknown>,
    );
  expect(
    (await owner("", "PUT", { baseRevision: null, project, brief: null }))
      .status,
  ).toBe(200);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(new GenobiApi(studioUrl(url))).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    const text = result.content[0].text;
    return result.isError
      ? { error: text }
      : (JSON.parse(text) as Record<string, unknown>);
  };
  return { ...harness, project, owner, call, client };
}
