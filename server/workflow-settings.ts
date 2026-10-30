import { AppError } from "./errors";
import { entryFor, readyEntry, type Entry } from "../shared/registry";
import type { Generator, VideoModel } from "../shared/types";
import {
  parseWorkflowDestination,
  DEFAULT_DESTINATION,
  type DestinationKind,
  type WorkflowDestination,
} from "../shared/comfy/destination";
import {
  firstSettingsRevision,
  LOCATION_LABEL,
  parseRunLocation,
  RUN_LOCATIONS,
  type LocalComfyStatus,
  type RunLocationState,
  type RunLocation,
} from "../shared/comfy/run-location";
import {
  requireTemplateFor,
  workflowCatalogue,
  type TemplateChoice,
} from "../shared/comfy/workflows";
import type { TakeRecipe, WorkflowPlan } from "../shared/take";
import type { Store, StoredSettings } from "./store";
import { requireExpected } from "./settings-expectation";

/** A session's run location and template choices, as another may adopt them. */
export interface SettingsSnapshot {
  location: DestinationKind | "both";
  workflows: Record<string, string>;
  deployment?: { url: string };
}

/** Sessions whose choices are kept; the oldest go first past this. */
const MAX_SESSIONS = 1000;

export interface WorkflowSettingsOptions {
  /** The server's default: `GENOBI_WORKFLOW_DESTINATION`. */
  destination?: WorkflowDestination;
  /** Asks the local ComfyUI whether it answers; absent where there is none. */
  localStatus?: () => Promise<LocalComfyStatus>;
}

/**
 * The run location and workflow choices, per session, on the local server.
 * The studio and agents read and change the same record through
 * `/api/settings`; the job service reads it when it prices a run, and the take
 * records what it read, so a run polls where it was sent and a quote taken
 * under one location or template is never spent under another. Kept in the
 * local snapshot, so a restart does not move a session back to the default.
 */
export class WorkflowSettings {
  private readonly destination: WorkflowDestination;
  /**
   * The settings revision: bumped on every accepted write, in memory only.
   * Each process starts above the last (`firstSettingsRevision`), so a
   * restart never answers with a revision older than one already handed out.
   */
  private revision = firstSettingsRevision();
  constructor(
    private readonly store: Store,
    private readonly options: WorkflowSettingsOptions = {},
  ) {
    this.destination = options.destination ?? DEFAULT_DESTINATION;
  }

  private record(sessionId: string): StoredSettings | undefined {
    return this.store.data.settings.find((s) => s.sessionId === sessionId);
  }

  /**
   * Applies one write and bumps the revision; `answer` reads what it made
   * at once, before the save is awaited.
   */
  private async change(
    sessionId: string,
    edit: (record: StoredSettings) => void,
    answer: () => void,
  ) {
    const settings = this.store.data.settings;
    let record = this.record(sessionId);
    if (!record) {
      record = { sessionId, workflows: {}, updatedAt: "" };
      settings.push(record);
    }
    edit(record);
    this.revision++;
    record.updatedAt = new Date().toISOString();
    if (settings.length > MAX_SESSIONS) {
      settings.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
      settings.splice(0, settings.length - MAX_SESSIONS);
    }
    answer();
    await this.store.save();
  }

  /** What this session runs workflows with now: location and templates. */
  snapshot(sessionId: string): SettingsSnapshot {
    return {
      location: this.mode(sessionId),
      workflows: { ...this.record(sessionId)?.workflows },
      ...(this.deployment(sessionId)
        ? { deployment: { url: this.deployment(sessionId)!.url } }
        : {}),
    };
  }

  /**
   * Gives another session (an agent's) the same choices, through the same
   * write and checks as the person's own controls: a location outside
   * Local, Cloud and Both and a template its entry does not offer are skipped.
   */
  async adopt(sessionId: string, snapshot: SettingsSnapshot) {
    let location: ReturnType<typeof parseRunLocation> | undefined;
    try {
      location = parseRunLocation(snapshot.location);
    } catch {
      location = undefined;
    }
    let deployment: { url: string } | undefined;
    try {
      const parsed =
        snapshot.deployment &&
        parseWorkflowDestination("deployment", snapshot.deployment.url);
      if (parsed?.kind === "deployment") deployment = { url: parsed.url };
    } catch {
      /* Invalid inherited settings grant no destination. */
    }
    if (location === "deployment" && !deployment && !this.deployment(sessionId))
      location = undefined;
    const workflows: Record<string, string> = {};
    for (const [entry, template] of Object.entries(snapshot.workflows))
      try {
        const { entry: e, choice } = requireTemplateFor(entry, template);
        workflows[e.id] = choice.id;
      } catch {
        // Not offered in this build: the agent keeps the default.
      }
    await this.change(
      sessionId,
      (record) => {
        if (location) record.location = location;
        if (deployment) record.deployment = deployment;
        record.workflows = { ...record.workflows, ...workflows };
      },
      () => {},
    );
  }

  private mode(sessionId: string): RunLocation | WorkflowDestination["kind"] {
    return this.record(sessionId)?.location ?? this.destination.kind;
  }

  location(sessionId: string): DestinationKind {
    const mode = this.mode(sessionId);
    return mode === "both" ? "local" : mode;
  }

  /**
   * The run location and its revision, read together before anything is
   * awaited, so an answer never pairs one write's value with another's
   * revision.
   */
  async state(sessionId: string): Promise<RunLocationState> {
    const revision = this.revision;
    const location = this.location(sessionId);
    const mode = this.mode(sessionId);
    const deployment = this.deployment(sessionId);
    const source = this.record(sessionId)?.location ? "session" : "server";
    const local = this.options.localStatus
      ? await this.options.localStatus()
      : null;
    return {
      revision,
      location,
      mode,
      label: LOCATION_LABEL[location],
      ...(deployment ? { deployment } : {}),
      source,
      fixed: false,
      choices: [...RUN_LOCATIONS],
      local,
      note:
        mode === "both"
          ? "Open workflows run on local ComfyUI; API models run through Comfy Router or BFL. No automatic cloud fallback."
          : location === "local"
            ? "Workflows run on the ComfyUI on this machine, with its own models. Nothing is charged."
            : location === "cloud"
              ? "Workflows run on Comfy Cloud with your Comfy key, and each run is charged to it."
              : "Workflows run on your Comfy deployment. GPU time is billed by Comfy to its workspace.",
    };
  }

  /** Answers with the state this write made, whatever lands while it saves. */
  async setLocation(sessionId: string, value: unknown, url?: unknown) {
    const location = parseRunLocation(value);
    const destination =
      url === undefined
        ? undefined
        : parseWorkflowDestination("deployment", url);
    const deployment =
      destination?.kind === "deployment"
        ? {
            url: destination.url,
            name: new URL(destination.url).hostname.split(".")[0],
          }
        : undefined;
    if (location === "deployment" && !deployment && !this.deployment(sessionId))
      throw new AppError(
        400,
        "Register a Comfy deployment endpoint first.",
        "invalid_destination",
      );
    let answer!: Promise<RunLocationState>;
    await this.change(
      sessionId,
      (record) => {
        record.location = location;
        if (deployment) record.deployment = { url: deployment.url };
      },
      () => (answer = this.state(sessionId)),
    );
    return answer;
  }

  deployment(sessionId: string) {
    const saved = this.record(sessionId)?.deployment;
    if (saved) {
      const parsed = parseWorkflowDestination("deployment", saved.url);
      if (parsed.kind === "deployment")
        return {
          url: parsed.url,
          name: new URL(parsed.url).hostname.split(".")[0],
        };
    }
    return this.destination.kind === "deployment"
      ? {
          url: this.destination.url,
          name: new URL(this.destination.url).hostname.split(".")[0],
        }
      : undefined;
  }

  catalogue(sessionId: string) {
    const chosen = { ...this.record(sessionId)?.workflows };
    return workflowCatalogue(
      (entry) => chosen[entry],
      false,
      this.revision,
      Boolean(this.deployment(sessionId)),
    );
  }

  /** Answers with the catalogue this write made, whatever lands while it saves. */
  async select(sessionId: string, entryId: unknown, templateId: unknown) {
    const { entry, choice } = requireTemplateFor(entryId, templateId);
    let answer!: ReturnType<WorkflowSettings["catalogue"]>;
    await this.change(
      sessionId,
      (record) => {
        record.workflows[entry.id] = choice.id;
      },
      () => (answer = this.catalogue(sessionId)),
    );
    return answer;
  }

  /**
   * `plan` for the entry a request names, as a run is priced: refused with
   * `settings_changed` when it is not what the request expected.
   */
  planFor(sessionId: string, generator: Generator, model?: VideoModel) {
    const plan = this.plan(sessionId, entryFor(generator, model));
    requireExpected(plan);
    return plan;
  }

  /**
   * What a run of this entry records: for a `workflow` entry, its template
   * and run location; nothing for any other route. A choice the build no
   * longer allows falls back to the entry's default.
   */
  plan(sessionId: string, entry: Entry): WorkflowPlan {
    if (entry.status !== "ready" || entry.route !== "workflow") return {};
    const chosen = this.record(sessionId)?.workflows[entry.id];
    let choice: TemplateChoice;
    try {
      choice = requireTemplateFor(entry.id, chosen).choice;
    } catch {
      choice = requireTemplateFor(entry.id).choice;
    }
    const location = this.hostFor(choice, sessionId);
    const deployment =
      location === "deployment" ? this.deployment(sessionId) : undefined;
    if (entry.deploymentOnly && !deployment)
      throw new AppError(
        400,
        "Register your Comfy deployment in Settings → run location.",
        "invalid_destination",
      );
    return {
      workflow: choice.id,
      location,
      ...(deployment ? { deployment } : {}),
    };
  }

  /**
   * The session's location, unless the template names its own hosts: then
   * the session's location when it is one of them (a server whose default is
   * its deployment), otherwise the first host it lists.
   */
  private hostFor(choice: TemplateChoice, sessionId: string): DestinationKind {
    const location = this.location(sessionId);
    const hosts = choice.template.hosts;
    if (!hosts) return location;
    if ((hosts as readonly string[]).includes(location)) return location;
    return hosts[0];
  }

  /**
   * Whether a recipe still matches what the session would run now. A quote
   * taken before the run location or template changed no longer does: it
   * cannot be spent, so a paused chain quotes its stage again.
   */
  fits(sessionId: string, recipe: TakeRecipe) {
    const entry = readyEntry(recipe.id);
    if (!entry || entry.route !== "workflow") return true;
    const plan = this.plan(sessionId, entry);
    return (
      recipe.workflow === plan.workflow &&
      recipe.location === plan.location &&
      recipe.deployment?.url === plan.deployment?.url
    );
  }
}
