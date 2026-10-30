import { z } from "zod";
import { profileConnection } from "../mcp/connection";
import { profileDefaults } from "../mcp/profile-defaults";
import { ProfileStore, profileSchema } from "../mcp/profile-store";
import { StudioNoAnswer, StudioUnreachable, StudioError } from "../mcp/api";
import {
  availableTools,
  commandSchema,
  commandTool,
  describeTool,
  parseOptions,
} from "./commands";
import { readJsonInput } from "./input";
import capabilities from "../plugins/genobi/capabilities.json";

export const HELP = `Genobi — the local studio's MCP tools from your terminal (Node 22+).

  genobi tools                              JSON command catalogue, offline
  genobi capabilities                       Every feature: where, route, models, offline
  genobi schema <command>                   Exact JSON input schema, offline
  genobi <command> --input @request.json     One result as JSON
  genobi call genobi_<tool> --input -       JSON from stdin
  genobi profile list | show | use NAME
  genobi profile set NAME --input @profile.json
  genobi profile schema                     Connection/preference schema

Commands accept hyphens, spaces, or full MCP tool names:
  genobi media frames, genobi media-frames, genobi call genobi_media_frames
  genobi swords frames                      Alias of media frames

Options: --profile NAME, --url http://127.0.0.1:4317, --input JSON|@FILE|-
         --confirm (paid commands only, after the person accepted the quote)
Errors are JSON on stderr with a nonzero exit code. Commands never retry.

Use skill --input '{"name":"genobi-cli"}' for setup and worked examples.
Read project context before editing; Taste proposals need owner activation.
`;

export interface Runtime {
  env?: NodeJS.ProcessEnv;
  store?: ProfileStore;
  fetcher?: typeof fetch;
  input?: typeof readJsonInput;
}

/** One command, one dispatch through the MCP definitions; no generator logic here. */
export async function run(
  argv: string[],
  runtime: Runtime = {},
): Promise<unknown> {
  const options = parseOptions(argv);
  const env = runtime.env ?? process.env;
  const agent = env.GENOBI_AGENT_SESSION === "1";
  const [first, ...rest] = options.words;
  const input = runtime.input ?? readJsonInput;
  if (
    options.confirm &&
    (!first ||
      ["help", "schema", "tools", "capabilities", "profile"].includes(first))
  )
    throw new Error("--confirm is only valid for a paid command.");
  if (!first || first === "help") {
    if (rest.length) return describeTool(commandTool(rest, agent));
    return HELP;
  }
  if (first === "tools") {
    if (rest.length) throw new Error("Use genobi tools without arguments.");
    return availableTools(agent).map(describeTool);
  }
  if (first === "capabilities") {
    if (rest.length)
      throw new Error("Use genobi capabilities without arguments.");
    return capabilities;
  }
  if (first === "schema") return describeTool(commandTool(rest, agent));
  const store = runtime.store ?? new ProfileStore();
  if (first === "profile") {
    const [action, name, ...extra] = rest;
    if (extra.length) throw new Error("Unexpected profile arguments.");
    if (action === "schema" && !name)
      return z.toJSONSchema(profileSchema, { io: "input" });
    if (action === "list" && !name)
      return { active: await store.current(), profiles: await store.list() };
    if (action === "show") {
      const selected =
        name ??
        options.profile ??
        env.GENOBI_PROFILE ??
        (await store.current());
      return { name: selected, ...(await store.get(selected)) };
    }
    if (action === "set" && name && options.input !== undefined)
      return store.set(name, await input(options.input));
    if (action === "use" && name) return store.use(name);
    throw new Error(
      "Use genobi profile list, show [NAME], set NAME --input JSON, use NAME, or schema.",
    );
  }
  const tool = commandTool(first === "call" ? rest : options.words, agent);
  // Resolve/validate before any API call, including the paid confirmation gate.
  const args = commandSchema(tool).parse(await input(options.input));
  if (tool.paid && !options.confirm)
    throw new Error(
      "Submission needs --confirm after the person accepts this quote. Read jobs first if an earlier submission had an unknown outcome.",
    );
  if (options.confirm && !tool.paid)
    throw new Error("--confirm is only valid for a paid command.");
  const connection = await profileConnection({
    profile: options.profile,
    url: options.url,
    store,
    env,
    fetcher: runtime.fetcher,
    client: "cli",
  });
  return tool.run(
    connection.api,
    profileDefaults(tool.name, args, connection.profile.selection),
  );
}

export function commandError(error: unknown) {
  if (error instanceof z.ZodError)
    return {
      code: "invalid_input",
      message:
        "Input does not match the command schema. Run genobi schema COMMAND.",
      issues: error.issues.map(({ path, code, message }) => ({
        path,
        code,
        message,
      })),
    };
  return {
    code:
      error instanceof StudioNoAnswer
        ? "outcome_unknown"
        : error instanceof StudioUnreachable
          ? "studio_unreachable"
          : error instanceof StudioError
            ? (error.code ?? "studio_error")
            : "command_failed",
    message: error instanceof Error ? error.message : "Command failed.",
  };
}
