import { GenobiApi, studioUrl } from "./api";
import { ProfileStore } from "./profile-store";
import { AGENT_RUN_GRANT } from "../shared/agent-session-events";

/** Shared explicit profile for terminal and MCP; no implicit model/runner launch. */
export async function profileConnection(
  options: {
    profile?: string;
    url?: string;
    store?: ProfileStore;
    env?: NodeJS.ProcessEnv;
    fetcher?: typeof fetch;
    /** The terminal adapter and the MCP server say so on every request. */
    client?: "cli" | "mcp";
  } = {},
) {
  const env = options.env ?? process.env;
  const store = options.store ?? new ProfileStore();
  const name = options.profile ?? env.GENOBI_PROFILE ?? (await store.current());
  const profile = await store.get(name);
  const base = studioUrl(options.url ?? env.GENOBI_URL ?? profile.url);
  const agent = env.GENOBI_AGENT_SESSION === "1";
  const grant =
    agent && AGENT_RUN_GRANT.test(env.GENOBI_AGENT_RUN ?? "")
      ? env.GENOBI_AGENT_RUN
      : undefined;
  const session = await store.session(name, base.origin, agent, grant);
  return {
    name,
    profile,
    api: new GenobiApi(
      base,
      options.fetcher ?? fetch,
      agent,
      grant,
      session,
      options.client,
    ),
  };
}
