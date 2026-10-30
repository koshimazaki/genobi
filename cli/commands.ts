import { z } from "zod";
import { tools, type ToolDefinition } from "../mcp/tools";
import { GENOBI_TOOLS } from "../shared/agent-tools";

export const commandName = (tool: ToolDefinition) =>
  tool.name.replace(/^genobi_/, "").replaceAll("_", "-");
export const commandSchema = (tool: ToolDefinition) =>
  tool.inputObject ?? z.strictObject(tool.inputSchema);
export const availableTools = (agent: boolean) =>
  tools.filter((tool) => !agent || GENOBI_TOOLS.includes(tool.name));

export function commandTool(words: string[], agent: boolean) {
  const name = words
    .join("_")
    .replaceAll("-", "_")
    .replace(/^genobi_/, "");
  // Dual Swords is the existing local media toolset, not a second implementation.
  const canonical = `genobi_${name.replace(/^swords_/, "media_")}`;
  const tool = availableTools(agent).find((t) => t.name === canonical);
  if (!tool)
    throw new Error(
      "Unknown or unavailable command. Run genobi tools to list this session's commands.",
    );
  return tool;
}

export function describeTool(tool: ToolDefinition) {
  return {
    command: commandName(tool),
    tool: tool.name,
    description: tool.description,
    paid: tool.paid === true,
    annotations: tool.annotations,
    inputSchema: z.toJSONSchema(commandSchema(tool)),
  };
}

export interface Options {
  words: string[];
  input?: string;
  profile?: string;
  url?: string;
  confirm: boolean;
}
export function parseOptions(argv: string[]): Options {
  const parsed: Options = { words: [], confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i];
    if (word === "--confirm") {
      if (parsed.confirm) throw new Error("Duplicate --confirm.");
      parsed.confirm = true;
    } else if (["--input", "--profile", "--url"].includes(word)) {
      const key = word.slice(2) as "input" | "profile" | "url";
      if (
        parsed[key] !== undefined ||
        argv[i + 1] === undefined ||
        argv[i + 1].startsWith("--")
      )
        throw new Error(`Supply ${word} once with a value.`);
      parsed[key] = argv[++i];
    } else if (word === "--help" || word === "-h") parsed.words.unshift("help");
    else if (word.startsWith("-"))
      throw new Error("Unknown option. Run genobi help.");
    else parsed.words.push(word);
  }
  return parsed;
}
