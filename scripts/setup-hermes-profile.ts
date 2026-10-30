// Creates or updates Hermes' `genobi` profile (`npm run agent:hermes-profile`),
// the one the studio's Hermes runner uses and `hermes -p genobi` opens. The
// studio runs the same code from setup's "Set up Hermes"
// (`POST /api/agent/hermes-profile`, server/agent-hermes-profile-setup.ts);
// this script is the terminal's way in. Safe to run again: it creates the
// profile only when it is missing (Hermes' own `hermes profile create genobi
// --no-alias --no-skills`), then sets Genobi's keys in that profile alone with
// `hermes -p genobi plugins enable` and `config set`: the genobi plugin (its
// skills), the Genobi MCP server with the session's tool filter and agent
// mark, the isolated browser, and the open model and provider
// (GENOBI_AGENT_HERMES_MODEL and _PROVIDER, or the ones saved in setup's
// Connect step, `.local/agent.json`; both required) pinned with fallback off.
// Each variable, when set, wins over the saved one. It refuses an Anthropic or
// OpenAI model or provider before anything is created (shared/open-route.ts).
// The default profile and every other profile are left alone. It reads no
// credential and calls no model.
//
// The studio it points at: GENOBI_URL, else http://127.0.0.1:$PORT (4317).
// The saved choice is read from GENOBI_AGENT_SETTINGS_DIR, else this
// checkout's `.local` (tests point it at a scratch folder).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findBinary } from "../server/agent-config";
import { readAgentRunnerChoice } from "../server/agent-runner-setting";
import { PROFILE_NAME } from "../server/agent-hermes-profile";
import {
  hermesSetupConfig,
  profileSetupProblem,
  setupHermesProfile,
  type ProfileSetupProblem,
} from "../server/agent-hermes-profile-setup";
import { setupInstructions } from "../server/agent-hermes-setup";
import { OPEN_ROUTE_REFUSAL } from "../shared/open-route";

/** The terminal's sentences: they name the variables a script reads. */
const PROBLEMS: Record<ProfileSetupProblem, string> = {
  hermes:
    "Hermes was not found on PATH or in ~/.local/bin; set GENOBI_AGENT_HERMES.",
  root: "Set GENOBI_AGENT_HERMES_ROOT to an absolute Hermes root, or HOME.",
  invalid:
    "Hermes' model or provider (GENOBI_AGENT_HERMES_MODEL or _PROVIDER, or the one saved in setup) is not a valid name.",
  closed: OPEN_ROUTE_REFUSAL,
  choice:
    "Choose Hermes' open model and provider in setup's Connect step, or set GENOBI_AGENT_HERMES_MODEL and GENOBI_AGENT_HERMES_PROVIDER, such as deepseek/deepseek-v4.1-flash and nous; the profile pins both.",
  studio: "GENOBI_URL must be the local studio, such as http://127.0.0.1:4317.",
};

const settings =
  process.env.GENOBI_AGENT_SETTINGS_DIR?.trim() ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".local");
const config = await hermesSetupConfig(
  process.env,
  await readAgentRunnerChoice(settings),
);
const fail = (message: string) => {
  console.error(message);
  process.exit(1);
};
const studio =
  process.env.GENOBI_URL?.trim() ||
  `http://127.0.0.1:${Number(process.env.PORT ?? 4317)}`;
const problem = profileSetupProblem(config, studio);
if (problem) fail(PROBLEMS[problem]);
const hermes = config.hermes!;
const home = config.hermesHome!;
const model = config.hermesModel!;
const provider = config.hermesProvider!;

try {
  const { created, root } = await setupHermesProfile(
    config,
    studio,
    process.env,
    {
      onStep: (step, outcome) => {
        if (step === "apply" && outcome === "done")
          console.log(
            `Set Genobi's plugin, MCP server and tool filter for ${studio}, and pinned ${model} on ${provider} on every route with no fallback.`,
          );
      },
    },
  );
  console.log(
    created
      ? `Created Hermes' "${PROFILE_NAME}" profile at ${home}.`
      : `Hermes' "${PROFILE_NAME}" profile is at ${home}.`,
  );
  // A bare `hermes` runs this executable only when it is the first on PATH.
  const onPath = (await findBinary("hermes", process.env)) === hermes;
  const hermesVariable = process.env.GENOBI_AGENT_HERMES?.trim();
  console.log(
    setupInstructions({
      root,
      ...(onPath ? {} : { executable: hermes }),
      ...(hermesVariable ? { hermesVariable: hermes } : {}),
      ...(process.env.HOME ? { home: process.env.HOME } : {}),
      model,
      provider,
    }),
  );
} catch (error) {
  fail((error as Error).message);
}
