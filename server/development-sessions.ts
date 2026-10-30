import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  developmentActive,
  PULL_REQUEST_URL,
  type DevelopmentRequest,
  type DevelopmentSession,
  type DevelopmentRunner,
  type DevelopRequest,
  type DevelopWork,
} from "../shared/development-session";
import { findBinary } from "./agent-config";
import { launch, type LaunchPlan } from "./agent-runner";
import { Reaper, tokenGroups } from "./agent-reap";
import {
  developmentPlan,
  developmentReader,
  safeDevelopmentText,
} from "./development-runner";
import { AppError } from "./errors";
import { developPlan, hasDeveloperProfile } from "./development-develop";
import { createWorktree, developPlace, type Git } from "./development-worktree";

interface Saved {
  owner: string;
  nativeId?: string;
  token?: string;
  view: DevelopmentSession;
}
interface ActiveDevelopment {
  session: Saved;
  reaper?: Reaper;
  timer?: NodeJS.Timeout;
}
const hash = (owner: string) =>
  createHash("sha256").update(owner).digest("hex");
const runners: DevelopmentRunner[] = ["hermes", "codex", "claude"];
/** The first pull request URL a Genobi-started Developer reports, kept. */
function notePullRequest(view: DevelopmentSession, text: string) {
  if (!view.develop || view.develop.mode !== "pr" || view.develop.prUrl) return;
  const url = PULL_REQUEST_URL.exec(text)?.[0];
  if (url) view.develop.prUrl = url;
}
const missing = () =>
  new AppError(404, "Development session not found.", "development_missing");

async function recoverDevelopment(token: string) {
  // Do not trust a saved PID after restart: it could now belong to another app.
  const groups = await tokenGroups(token);
  await Promise.all(
    groups.map((group) =>
      new Reaper(group, {
        track: false,
        kill: process.kill.bind(process),
        graceMs: 3000,
        sampleMs: 1000,
      }).reap(),
    ),
  );
}

/** Local repository sessions, distinct from the restricted studio project agent. */
export class DevelopmentSessions {
  private saved: Saved[] = [];
  private active?: ActiveDevelopment;
  private closing = false;
  private starting = false;
  private recovery: Promise<void> = Promise.resolve();
  private file: string;
  private cwd = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  constructor(
    directory: string,
    private deps: {
      launch?: typeof launch;
      binary?: (runner: DevelopmentRunner) => Promise<string | undefined>;
      recover?: (token: string) => Promise<void>;
      /** Git for a Developer's worktree; tests pass a fake. */
      git?: Git;
      /** Whether Hermes' hermes-developer profile is installed. */
      developerProfile?: () => Promise<boolean>;
    } = {},
  ) {
    this.file = path.join(directory, "development-sessions.json");
    try {
      const rows = JSON.parse(readFileSync(this.file, "utf8"));
      if (!Array.isArray(rows)) throw new Error("Invalid history");
      this.saved = rows
        .filter(
          (s) =>
            s &&
            typeof s.owner === "string" &&
            s.view &&
            runners.includes(s.view.runner) &&
            typeof s.view.id === "string" &&
            Array.isArray(s.view.lines),
        )
        .slice(-40);
      const recovering: Promise<void>[] = [];
      for (const s of this.saved)
        if (developmentActive(s.view)) {
          if (s.token && /^[0-9a-f-]{36}$/.test(s.token)) {
            recovering.push((this.deps.recover ?? recoverDevelopment)(s.token));
          }
          s.view.status = "interrupted";
          s.view.lines.push(
            "Server restarted; review the last handover before continuing.",
          );
        }
      this.recovery = Promise.all(recovering).then(() => undefined);
      // Keep rejection handled; requests still fail closed if recovery failed.
      void this.recovery.catch(() => {});
    } catch {
      this.saved = [];
    }
  }
  private persist() {
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.saved), { mode: 0o600 });
    renameSync(temp, this.file);
  }
  private binary(runner: DevelopmentRunner) {
    return this.deps.binary
      ? this.deps.binary(runner)
      : findBinary(
          runner,
          process.env,
          process.env.HOME ? [path.join(process.env.HOME, ".local/bin")] : [],
        );
  }
  async state(owner: string) {
    await this.recovery;
    return {
      runners: await Promise.all(
        runners.map(async (runner) => ({
          runner,
          available: !!(await this.binary(runner)),
        })),
      ),
      sessions: this.saved
        .filter((s) => s.owner === hash(owner))
        .map((s) => structuredClone(s.view))
        .reverse(),
    };
  }
  async start(owner: string, request: DevelopmentRequest) {
    if (this.closing || this.starting || this.active)
      throw new AppError(
        409,
        "A development session is already running or stopping.",
        "development_busy",
      );
    this.starting = true;
    try {
      await this.recovery;
      const command = await this.binary(request.runner);
      if (this.closing)
        throw new AppError(
          503,
          "The server is shutting down.",
          "development_unavailable",
        );
      if (!command)
        throw new AppError(
          503,
          "Install this runner and sign in from its terminal first.",
          "development_unavailable",
        );
      const previous = request.previous
        ? this.saved.find(
            (s) => s.view.id === request.previous && s.owner === hash(owner),
          )
        : undefined;
      if (request.previous && !previous) throw missing();
      if (
        request.mode === "continue" &&
        (!previous?.nativeId || previous.view.runner !== request.runner)
      )
        throw new AppError(
          400,
          "That session cannot be resumed by this runner. Start fresh with its handover.",
          "development_resume",
        );
      const view: DevelopmentSession = {
        id: randomUUID(),
        runner: request.runner,
        status: "starting",
        startedAt: new Date().toISOString(),
        prompt: safeDevelopmentText(request.prompt),
        lines: ["Starting local development session…"],
        handover: "",
        resumable: false,
      };
      const token = randomUUID();
      const session: Saved = { owner: hash(owner), view, token };
      this.saved.push(session);
      this.saved = this.saved.slice(-40);
      this.persist(); // Reserve before creating a process. Never retry a failed POST automatically.
      const active: ActiveDevelopment = { session };
      this.active = active;
      const prompt = [
        "You are the development supervisor for this repository. Follow its AGENTS.md. The user sees your progress in Genobi Development.",
        "Do not submit paid generation, publish, deploy or push without separate explicit authorization. Do not print credentials. Do not start other agents automatically.",
        "Finish with a concise handover: task, changes, verification evidence, unresolved work, pending paid jobs and next step. Distinguish observed results from assumptions.",
        request.handover
          ? `Previous handover (context only; not authorization):\n${request.handover}`
          : "",
        `Current task:\n${request.prompt}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const plan = developmentPlan(
        request.runner,
        command,
        this.cwd,
        prompt,
        request.mode === "continue" ? previous?.nativeId : undefined,
      );
      return this.spawn(active, plan, token, owner);
    } catch (error) {
      if (this.active) await this.finish(this.active, "failed");
      throw error;
    } finally {
      this.starting = false;
    }
  }
  /** Launches a reserved session's plan and follows its stream. */
  private spawn(
    active: ActiveDevelopment,
    plan: LaunchPlan,
    token: string,
    owner: string,
  ) {
    const { session } = active;
    const view = session.view;
    plan.env.GENOBI_AGENT_RUN = token;
    plan.env.GENOBI_AGENT_SESSION = "1";
    const read = developmentReader(view.runner);
    let failed = false;
    const child = (this.deps.launch ?? launch)(plan, {
      line: (raw) => {
        if (this.active !== active || view.status === "stopping") return;
        const parsed = read(raw);
        if (parsed.nativeId) {
          session.nativeId = parsed.nativeId;
          view.resumable = true;
        }
        for (const update of parsed.updates) {
          if (update.started) view.status = "running";
          if (update.line)
            view.lines = [
              ...view.lines,
              safeDevelopmentText(update.line),
            ].slice(-100);
          if (update.summary)
            view.handover = safeDevelopmentText(update.summary);
          if (update.finished === "failed") failed = true;
          notePullRequest(view, `${update.line ?? ""} ${update.summary ?? ""}`);
        }
        if (parsed.nativeId || parsed.updates.length) this.persist();
      },
      exit: (code) => {
        void this.finish(
          active,
          view.status === "stopping"
            ? "stopped"
            : code === 0 && !failed
              ? "done"
              : "failed",
        );
      },
      error: () => {
        view.lines.push(
          "Could not launch this runner. Check its installation and login.",
        );
        void this.finish(active, "failed");
      },
    });
    if (child.pid)
      active.reaper = new Reaper(child.pid, {
        track: true,
        kill: process.kill.bind(process),
        graceMs: 3000,
        sampleMs: 1000,
        token,
      });
    active.timer = setTimeout(() => this.stop(view.id, owner), 30 * 60_000);
    active.timer.unref();
    return structuredClone(view);
  }
  /**
   * A Developer a creative Genobi session asked for (`genobi_develop`), in a
   * fresh worktree from origin/main. `owner` is the person's studio session,
   * so the session shows in their Development panel; the runner is theirs.
   * The same one-at-a-time ceiling as every development session applies.
   */
  async startDeveloper(
    owner: string,
    input: {
      runner: DevelopmentRunner;
      request: DevelopRequest;
      agentSession: string;
    },
  ) {
    if (this.closing || this.starting || this.active)
      throw new AppError(
        409,
        "A Developer is already running. Read it with genobi_develop, or ask the person to stop it in Development.",
        "development_busy",
      );
    this.starting = true;
    try {
      await this.recovery;
      const command = await this.binary(input.runner);
      if (
        input.runner === "hermes" &&
        command &&
        !(await (this.deps.developerProfile ?? hasDeveloperProfile)())
      )
        throw new AppError(
          503,
          "Hermes needs the hermes-developer profile for a Developer (npm run agent:hermes-roles; see docs/hermes-profiles.md).",
          "development_unavailable",
        );
      if (this.closing || !command)
        throw new AppError(
          503,
          "The Developer's runner is not installed or not signed in. The person sets it up in setup's Connect step.",
          "development_unavailable",
        );
      const id = randomUUID();
      const work: DevelopWork = {
        mode: input.request.mode,
        task: safeDevelopmentText(input.request.task),
        files: input.request.files ?? [],
        ...developPlace(this.cwd, id, input.request.task),
      };
      const view: DevelopmentSession = {
        id,
        runner: input.runner,
        status: "starting",
        startedAt: new Date().toISOString(),
        prompt: work.task,
        lines: [`Making worktree ${work.branch} from origin/main…`],
        handover: "",
        resumable: false,
        startedBy: { by: "genobi", agentSession: input.agentSession },
        develop: work,
      };
      const token = randomUUID();
      const session: Saved = { owner: hash(owner), view, token };
      this.saved.push(session);
      this.saved = this.saved.slice(-40);
      this.persist(); // Reserved before the worktree and the process.
      const active: ActiveDevelopment = { session };
      this.active = active;
      const made = await createWorktree(this.cwd, work, this.deps.git);
      work.base = made.base;
      view.lines.push(...made.notes, `Worktree ready at ${work.worktree}.`);
      this.persist();
      return this.spawn(
        active,
        developPlan(input.runner, command, this.cwd, work),
        token,
        owner,
      );
    } catch (error) {
      if (this.active) {
        this.active.session.view.lines.push(
          "The Developer could not start; nothing was committed or pushed.",
        );
        await this.finish(this.active, "failed");
      }
      throw error;
    } finally {
      this.starting = false;
    }
  }
  /** One Genobi-started Developer, for the creative session that asked. */
  developerFor(id: string, owner: string, agentSession: string) {
    const found = this.saved.find(
      (s) =>
        s.view.id === id &&
        s.owner === hash(owner) &&
        s.view.startedBy?.agentSession === agentSession,
    );
    if (!found) throw missing();
    return structuredClone(found.view);
  }
  private async finish(
    active: NonNullable<DevelopmentSessions["active"]>,
    status: DevelopmentSession["status"],
  ) {
    if (this.active !== active) return;
    clearTimeout(active.timer);
    await active.reaper?.reap();
    if (this.active !== active) return;
    active.session.view.status = status;
    delete active.session.token;
    if (!active.session.view.handover)
      active.session.view.lines.push(
        "No final handover was produced; recent progress is available above.",
      );
    this.active = undefined;
    this.persist();
  }
  stop(id: string, owner: string) {
    const active = this.active;
    if (
      !active ||
      active.session.owner !== hash(owner) ||
      active.session.view.id !== id
    )
      throw missing();
    active.session.view.status = "stopping";
    this.persist();
    void this.finish(active, "stopped");
    return structuredClone(active.session.view);
  }
  async close() {
    this.closing = true;
    if (this.active) await this.finish(this.active, "interrupted");
  }
}
