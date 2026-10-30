// Native Hermes distributions plus the existing Genobi MCP/open-route setup.
// Installs/configures profiles only: no chat, model call or generation.
import { parseArgs } from "node:util";
import path from "node:path";
import { agentConfig } from "../server/agent-config";
import { runHermes } from "../server/agent-hermes-profile";
import { shellQuote } from "../server/agent-hermes-setup";
import { ROLES, setupRoles, type Role } from "./lib/hermes-role-profiles";

try {
  const { values } = parseArgs({
    options: {
      role: { type: "string" },
      configure: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(`Usage: npm run agent:hermes-roles -- [--role creative|developer] [--configure]
Requires GENOBI_AGENT_HERMES_MODEL and GENOBI_AGENT_HERMES_PROVIDER.
Optional GENOBI_URL, GENOBI_AGENT_HERMES_ROOT, GENOBI_AGENT_BROWSER=off.
Installs both roles by default. --configure rebinds existing roles' tools,
model and studio without replacing their skills or SOUL. Stop them first.
For role text updates use hermes profile update <name> after saving local edits.`);
  } else {
    if (values.role && !ROLES.includes(values.role as Role))
      throw new Error("--role must be creative or developer.");
    const config = await agentConfig({
      ...process.env,
      GENOBI_AGENT_RUNNER: "hermes",
    });
    if (!config.hermes)
      throw new Error("Hermes was not found; set GENOBI_AGENT_HERMES.");
    const targets = await setupRoles({
      config,
      studio:
        process.env.GENOBI_URL?.trim() ||
        `http://127.0.0.1:${Number(process.env.PORT ?? 4317)}`,
      roles: values.role ? [values.role as Role] : ROLES,
      run: runHermes(config.hermes),
      env: process.env,
      configureOnly: values.configure,
    });
    for (const { name, home } of targets) {
      const root = path.dirname(path.dirname(home));
      const command = `HERMES_HOME=${shellQuote(root)} ${shellQuote(config.hermes)} -p ${name}`;
      console.log(`${name}: configured. Choose its working checkout before launch.
  ${command} auth status
  ${command}
Role files update with: HERMES_HOME=${shellQuote(root)} ${shellQuote(config.hermes)} profile update ${name}
Model: ${config.hermesModel} on ${config.hermesProvider}. Sign in with Hermes if needed.`);
    }
    console.log(
      "No chat or paid run started. The studio runner still uses genobi.",
    );
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
