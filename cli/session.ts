import { trackedTool } from "../mcp/activity";
import type { GenobiApi } from "../mcp/api";
import type { ToolDefinition } from "../mcp/definition";
import { messagesForAgent } from "../shared/agent-messages";

/** Side-channel JSON on stderr leaves each command's stdout schema unchanged. */
export interface SessionNotice {
  warning?: string;
  messages?: { text: string }[];
  instruction?: string;
}
export const writeSessionNotice = (notice: SessionNotice) => {
  process.stderr.write(`${JSON.stringify({ notice })}\n`);
};

/** A studio-started CLI process participates in the same session as MCP. */
export async function sessionCommand(
  api: GenobiApi,
  tool: ToolDefinition,
  input: Record<string, unknown>,
  notice: (value: SessionNotice) => void = writeSessionNotice,
) {
  try {
    const { result, warning } = await trackedTool(
      api,
      tool.name,
      input,
      () => tool.run(api, input),
      "cli",
    );
    if (warning) notice({ warning });
    return result;
  } finally {
    // Corrections still arrive after a failed/uncertain tool. Never repeat the
    // operation to recover logging or messages; the grant pins their session.
    const messages = await api.messages();
    if (messages.length)
      notice({ messages, instruction: messagesForAgent(messages) });
  }
}
