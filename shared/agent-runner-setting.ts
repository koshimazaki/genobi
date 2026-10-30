/**
 * The harness setup records for project prompts (`.local/agent.json`, read by
 * `server/agent-config.ts` when `GENOBI_AGENT_RUNNER` is unset), and what the
 * setup's sign-in rows show. Shapes and name rules only: no Node or DOM.
 */

/** The harnesses setup offers. Codex is recorded but cannot run sessions yet. */
export const SETUP_RUNNERS = ["claude", "hermes", "codex"] as const;
export type SetupRunner = (typeof SETUP_RUNNERS)[number];

export const SETUP_RUNNER_NAMES: Record<SetupRunner, string> = {
  claude: "Claude Code",
  hermes: "Hermes",
  codex: "Codex",
};

/** A model id such as `deepseek/deepseek-v4-pro`. */
export const HERMES_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/;
/** A provider id such as `nous`. */
export const HERMES_PROVIDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** What `.local/agent.json` holds. No path, binary or credential. */
export interface AgentRunnerChoice {
  runner: SetupRunner | null;
  hermesModel?: string;
  hermesProvider?: string;
}

/** `GET` and `POST /api/settings/agent-runner`. */
export interface AgentRunnerSettingState {
  /** The saved choice; `{ runner: null }` when none was saved. */
  saved: AgentRunnerChoice;
  /**
   * `GENOBI_AGENT_RUNNER` is set on the server, so it, not the saved choice,
   * picks the runner. Only whether it is set, never its value.
   */
  environment: boolean;
  /**
   * The server holds a Hermes provider, saved here or in
   * `GENOBI_AGENT_HERMES_PROVIDER`, so Hermes can sign in. Only whether.
   */
  hermesProvider: boolean;
}

/** Whether a harness's own status command says it is signed in. */
export type SignedIn = boolean | "unknown";

/** One row of `GET /api/agent/sign-in`: booleans and names, never output. */
export interface HarnessSignIn {
  runner: SetupRunner;
  name: string;
  installed: boolean;
  signedIn: SignedIn;
  /** A fixed sentence when sign-in needs something first. */
  note?: string;
  /** Hermes' `genobi` profile is missing; Sign in sets it up first. */
  profile?: "missing";
}

/**
 * The open models setup offers Hermes, from LICENCES.md ("Other open
 * models"), newest checked first. The first is prefilled: the pair the run
 * guide uses (docs/hermes-runs.md). "Other" keeps a typed model and provider.
 */
export interface HermesChoice {
  label: string;
  model: string;
  provider: string;
  /** Licence and route in a few words. */
  note: string;
}
export const HERMES_CHOICES: readonly HermesChoice[] = [
  {
    label: "DeepSeek V4.1 Flash",
    model: "deepseek/deepseek-v4.1-flash",
    provider: "nous",
    note: "MIT · Nous Portal",
  },
  {
    label: "Qwen3-VL 235B A22B",
    model: "qwen/qwen3-vl-235b-a22b-instruct",
    provider: "nous",
    note: "Apache-2.0 · Nous Portal",
  },
];
export const DEFAULT_HERMES_CHOICE = HERMES_CHOICES[0];

/** The listed choice a model and provider are, or undefined for "other". */
export const hermesChoiceOf = (model: string, provider: string) =>
  HERMES_CHOICES.find(
    (choice) =>
      choice.model === model.trim() &&
      choice.provider === provider.trim().toLowerCase(),
  );

/** The steps of setting up Hermes' `genobi` profile from the studio. */
export const PROFILE_SETUP_STEPS = [
  "check",
  "create",
  "apply",
  "verify",
] as const;
export type ProfileSetupStep = (typeof PROFILE_SETUP_STEPS)[number];
export const PROFILE_SETUP_LABELS: Record<ProfileSetupStep, string> = {
  check: "Check Hermes and the chosen model",
  create: "Create the genobi profile",
  apply: "Add Genobi's plugin, tools and model",
  verify: "Check the open route",
};
export type ProfileStepOutcome = "pending" | "running" | "done" | "failed";

/** `GET` and `POST /api/agent/hermes-profile`: steps and a fixed sentence. */
export interface HermesProfileSetupState {
  phase: "idle" | "running" | "done" | "failed";
  steps: Partial<Record<ProfileSetupStep, ProfileStepOutcome>>;
  /** The profile did not exist and was created. */
  created?: boolean;
  /** A fixed sentence when it failed; never a path, token or output. */
  error?: string;
}
