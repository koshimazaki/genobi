import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { trackedTool } from "./activity";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GenobiApi, studioUrl } from "./api";
import { tools, type ToolDefinition } from "./tools";
import { profileConnection } from "./connection";
import { profileDefaults } from "./profile-defaults";
import type { SelectionPreference } from "../shared/licensing/selection";
import { messagesForAgent } from "../shared/agent-messages";

/** Stdio MCP server for Hermes, Claude Code and Codex. Logs go to stderr only. */
export function createServer(
  api: GenobiApi,
  selection: SelectionPreference = {},
) {
  const server = new McpServer({ name: "genobi", version: "0.1.0" });
  for (const tool of tools)
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputObject ?? tool.inputSchema,
        annotations: tool.annotations,
      },
      async (args: Record<string, unknown>) =>
        withMessages(api, await callTool(api, tool, args, selection)),
    );
  return server;
}

/** One tool call: its JSON answer and any warning, or its error. */
async function callTool(
  api: GenobiApi,
  tool: ToolDefinition,
  args: Record<string, unknown>,
  selection: SelectionPreference,
): Promise<CallToolResult> {
  try {
    const input = profileDefaults(tool.name, args ?? {}, selection);
    const { result, warning } = await trackedTool(api, tool.name, input, () =>
      tool.run(api, input),
    );
    return {
      content: [
        { type: "text", text: JSON.stringify(result, null, 2) },
        ...(warning ? [{ type: "text" as const, text: warning }] : []),
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

/**
 * Box 1.8: the person's messages from their studio (a voice transcript sent
 * to this running session) reach the agent after its next Genobi tool
 * answer, as one block naming them as the person's next message. A session
 * the studio did not start never has any.
 */
export async function withMessages(
  api: Pick<GenobiApi, "messages">,
  answer: CallToolResult,
): Promise<CallToolResult> {
  const said = messagesForAgent(
    typeof api.messages === "function" ? await api.messages() : [],
  );
  return said
    ? { ...answer, content: [...answer.content, { type: "text", text: said }] }
    : answer;
}

export async function main() {
  const connection = process.env.GENOBI_PROFILE
    ? await profileConnection({ client: "mcp" })
    : undefined;
  const api =
    connection?.api ??
    new GenobiApi(
      studioUrl(process.env.GENOBI_URL),
      fetch,
      process.env.GENOBI_AGENT_SESSION === "1",
      process.env.GENOBI_AGENT_RUN,
      undefined,
      "mcp",
    );
  await createServer(api, connection?.profile.selection).connect(
    new StdioServerTransport(),
  );
}
