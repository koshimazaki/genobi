// What `npm run agent:hermes-profile` prints after setting the profile up:
// the commands that sign it in and use it. Hermes does not read
// GENOBI_AGENT_HERMES_ROOT; for a root other than its default (~/.hermes),
// `hermes -p genobi` finds the profile only with `HERMES_HOME=<root>` set,
// which Hermes documents as the override for its config directory
// (reference/environment-variables.md, `HERMES_HOME`) and under which
// `-p genobi` resolves to `<root>/profiles/genobi`.
import path from "node:path";
import { isLocalProvider } from "../shared/open-route";
import { PROFILE_NAME } from "./agent-hermes-profile";

/** A word the shell reads back as itself. */
export const shellQuote = (value: string) =>
  /^[A-Za-z0-9_./:@%+=,-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", `'\\''`)}'`;

export interface SetupText {
  /** The Hermes root that holds `profiles/genobi`. */
  root: string;
  /** The person's home folder, whose `.hermes` is Hermes' default root. */
  home?: string;
  /** The open model and provider the profile pins. */
  model: string;
  provider: string;
  /**
   * Hermes' executable, when a bare `hermes` in the person's shell would not
   * run it (not first on PATH); printed, quoted, in every Hermes command.
   */
  executable?: string;
  /** GENOBI_AGENT_HERMES as the setup saw it, kept for the studio. */
  hermesVariable?: string;
}

export function setupInstructions(text: SetupText) {
  const custom =
    !text.home ||
    path.resolve(text.root) !== path.resolve(text.home, ".hermes");
  const binary = text.executable ? shellQuote(text.executable) : "hermes";
  const hermes = `${custom ? `HERMES_HOME=${shellQuote(text.root)} ` : ""}${binary} -p ${PROFILE_NAME}`;
  const provider = text.provider;
  const studio = [
    ...(custom ? [`GENOBI_AGENT_HERMES_ROOT=${shellQuote(text.root)}`] : []),
    ...(text.hermesVariable
      ? [`GENOBI_AGENT_HERMES=${shellQuote(text.hermesVariable)}`]
      : []),
    "GENOBI_AGENT_RUNNER=hermes",
    `GENOBI_AGENT_HERMES_MODEL=${shellQuote(text.model)}`,
    `GENOBI_AGENT_HERMES_PROVIDER=${shellQuote(text.provider)}`,
    "npm run dev",
  ].join(" ");
  // A local server needs its endpoint, not a sign-in (Ollama's default here).
  const first = isLocalProvider(provider)
    ? `Point the profile at your model server once (Ollama's default shown):

  ${hermes} config set model.base_url http://127.0.0.1:11434/v1
`
    : `Sign the profile in once, with Hermes' own login:

  ${hermes} auth add ${provider}${provider === "nous" ? " --type oauth" : ""}
`;
  return `
${first}
Then either:
  - in a terminal, with the studio running (npm run dev):
      ${hermes}
  - from the studio, then its Project prompt:
      ${studio}

Hermes is the open route: Genobi refuses Anthropic and OpenAI models and providers here,
and the profile pins this model and provider with fallback off.

Run this again after moving the checkout or changing the port; the studio's runner also
updates these keys itself when they differ, or when the profile's config.yaml changed.`;
}
