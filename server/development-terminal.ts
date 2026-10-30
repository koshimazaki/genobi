import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  access,
  chmod,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  developmentRole,
  type DevelopmentRole,
  type TerminalRequest,
  type TerminalSession,
  type TerminalState,
} from "../shared/development-terminal";
import type { DevelopmentRunner } from "../shared/development-session";
import { findBinary } from "./agent-config";
import { shellQuote } from "./agent-hermes-setup";
import { AppError } from "./errors";
import { safeDevelopmentText } from "./development-runner";
import {
  loginArguments,
  roleBrief,
  terminalArguments,
} from "./development-terminal-plan";
import { DevelopmentViewer, VIEWER_ORIGIN } from "./development-viewer";
import {
  hasGenobiProfile,
  hermesRoot,
  HERMES_PROFILE_NOTE,
} from "./harness-sign-in";
import { HERMES_PROVIDER } from "../shared/agent-runner-setting";
import { openRouteRefusal } from "../shared/open-route";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ownerHash = (owner: string) =>
  createHash("sha256").update(owner).digest("hex");
const runners: DevelopmentRunner[] = ["hermes", "codex", "claude"];
interface Saved {
  owner: string;
  nativeId: string;
  view: TerminalSession;
}
const openTerminal = (file: string) =>
  new Promise<void>((resolve, reject) => {
    execFile(
      "/usr/bin/open",
      ["-a", "Terminal", file],
      { timeout: 10_000 },
      (error) => (error ? reject(error) : resolve()),
    );
  });

/** Terminal owns the process lifetime; Genobi stores launch receipts, not transcripts. */
export class DevelopmentTerminal {
  private busy = false;
  private viewer = new DevelopmentViewer(cwd);
  constructor(
    private directory: string,
    private deps: {
      platform?: string;
      binary?: (runner: DevelopmentRunner) => Promise<string | undefined>;
      open?: typeof openTerminal;
      viewer?: (origin: string) => Promise<boolean>;
      /** Whether Hermes' profile for a role (`hermes-<role>`) is installed. */
      profile?: (role: DevelopmentRole) => Promise<boolean>;
      /** Whether Hermes' `genobi` profile exists, for its sign-in. */
      genobiProfile?: () => Promise<boolean>;
    } = {},
  ) {}
  private get folder() {
    return path.join(this.directory, "development-terminals");
  }
  /** macOS Terminal is the only native launcher so far. */
  get supported() {
    return (this.deps.platform ?? process.platform) === "darwin";
  }
  private async command(runner: DevelopmentRunner) {
    return this.deps.binary
      ? await this.deps.binary(runner)
      : await findBinary(
          runner,
          process.env,
          process.env.HOME
            ? [
                path.join(process.env.HOME, ".local/bin"),
                path.join(process.env.HOME, "bin"),
              ]
            : [],
        );
  }
  private async binary(
    runner: DevelopmentRunner,
    role: DevelopmentRole = "developer",
  ) {
    const command = await this.command(runner);
    if (runner === "hermes") {
      const profile = this.deps.profile
        ? await this.deps.profile(role)
        : await access(
            path.join(
              process.env.GENOBI_AGENT_HERMES_ROOT ??
                path.join(process.env.HOME ?? "", ".hermes"),
              `profiles/hermes-${role}/config.yaml`,
            ),
          ).then(
            () => true,
            () => false,
          );
      if (!profile) return undefined;
    }
    return command;
  }
  private async saved(): Promise<Saved[]> {
    try {
      const value = JSON.parse(
        await readFile(path.join(this.folder, "sessions.json"), "utf8"),
      );
      if (!Array.isArray(value)) return [];
      return (
        value
          .filter(
            (s) =>
              s &&
              typeof s.owner === "string" &&
              typeof s.nativeId === "string" &&
              s.view &&
              /^[0-9a-f-]{36}$/.test(s.view.id) &&
              runners.includes(s.view.runner),
          )
          // The role names a profile, so a receipt's role is re-read through the
          // enum; receipts written before roles existed were Developer terminals.
          .map((s) => ({
            ...s,
            view: {
              ...s.view,
              role: developmentRole.safeParse(s.view.role).data ?? "developer",
            },
          }))
          .slice(-40)
      );
    } catch {
      return [];
    }
  }
  private async persist(rows: Saved[]) {
    const file = path.join(this.folder, "sessions.json");
    await writeFile(`${file}.tmp`, JSON.stringify(rows.slice(-40)), {
      mode: 0o600,
    });
    await rename(`${file}.tmp`, file);
  }
  private async receipt(row: Saved): Promise<TerminalSession> {
    const view = { ...row.view };
    try {
      const status = JSON.parse(
        await readFile(
          path.join(this.folder, row.view.id, "status.json"),
          "utf8",
        ),
      ).status;
      if (status === "closed" || status === "failed") view.status = status;
    } catch {
      /* No completion receipt: never claim the agent has finished. */
    }
    view.resumable = view.status === "closed" && view.runner !== "codex";
    return view;
  }
  async state(owner: string): Promise<TerminalState> {
    return {
      supported: this.supported,
      runners: await Promise.all(
        runners.map(async (runner) => ({
          runner,
          available: !!(await this.binary(runner)),
          creative: !!(await this.binary(runner, "creative")),
        })),
      ),
      sessions: await Promise.all(
        (await this.saved())
          .filter((s) => s.owner === ownerHash(owner))
          .reverse()
          .map((s) => this.receipt(s)),
      ),
    };
  }
  /**
   * Opens one Terminal window per requested role, Developer first. Each
   * window is reserved (receipt written) before it is opened, and an open
   * that cannot be confirmed stops the rest: windows already open stay open.
   */
  async start(owner: string, input: TerminalRequest, studioOrigin: string) {
    if (!this.supported)
      throw new AppError(
        400,
        "Native launching currently requires macOS Terminal. Open your harness manually on this system.",
      );
    if (this.busy)
      throw new AppError(409, "A terminal is already being opened.");
    this.busy = true;
    try {
      if (input.resumePicker && input.runner === "hermes")
        throw new AppError(
          400,
          "Choose a saved Hermes session, or start fresh and use /sessions in Hermes.",
        );
      const rows = await this.saved();
      const previous = input.previous
        ? rows.find(
            (s) => s.owner === ownerHash(owner) && s.view.id === input.previous,
          )
        : undefined;
      if (input.previous && !previous)
        throw new AppError(404, "Development session not found.");
      if (
        previous &&
        (previous.view.runner !== input.runner ||
          !(await this.receipt(previous)).resumable)
      )
        throw new AppError(
          409,
          "Close the native conversation before resuming it with the same harness.",
        );
      const roles: DevelopmentRole[] = previous
        ? [previous.view.role]
        : (input.roles ?? ["developer"]);
      const commands = new Map<DevelopmentRole, string>();
      for (const role of roles) {
        const command = await this.binary(input.runner, role);
        if (!command)
          throw new AppError(
            503,
            role === "creative"
              ? "Install and sign in to this harness first. Hermes also needs the hermes-creative profile (see docs/hermes-profiles.md)."
              : "Install and sign in to this harness first. Hermes also needs the hermes-developer profile (see docs/hermes-profiles.md).",
          );
        commands.set(role, command);
      }
      const handover = safeDevelopmentText(input.handover ?? "");
      const sessions: TerminalSession[] = [];
      for (const role of roles) {
        const id = randomUUID();
        const nativeId =
          previous?.nativeId ??
          (input.runner === "hermes"
            ? `genobi-${role === "creative" ? "creative" : "supervisor"}-${id}`
            : id);
        const plan = terminalArguments(
          input.runner,
          roleBrief(role, handover, roles.length > 1),
          nativeId,
          !!previous,
          input.resumePicker,
          role,
        );
        const launchFile = await this.write(
          id,
          input.runner,
          commands.get(role)!,
          plan,
        );
        const row: Saved = {
          owner: ownerHash(owner),
          nativeId,
          view: {
            id,
            runner: input.runner,
            role,
            startedAt: new Date().toISOString(),
            status: "opened",
            resumable: false,
          },
        };
        rows.push(row);
        await this.persist(rows); // Reserve before opening; no automatic retry on uncertainty.
        try {
          await (this.deps.open ?? openTerminal)(launchFile);
        } catch {
          row.view.status = "failed";
          await this.persist(rows);
          throw new AppError(
            503,
            sessions.length
              ? `Terminal could not be confirmed open for ${role}; the ${sessions.map((s) => s.role).join(" and ")} window is open. Check Terminal before starting again.`
              : "Terminal could not be confirmed open. Check Terminal before starting again.",
          );
        }
        sessions.push(row.view);
      }
      const viewerReady = await (
        this.deps.viewer ?? ((origin) => this.viewer.ensure(origin))
      )(studioOrigin).catch(() => false);
      return {
        session: sessions[0],
        sessions,
        viewerOrigin: VIEWER_ORIGIN,
        viewerReady,
      };
    } finally {
      this.busy = false;
    }
  }
  /**
   * The private plan and `.command` file Terminal opens: the plan holds the
   * argument list, and the launcher passes it to the harness without a shell.
   */
  private async write(
    id: string,
    runner: DevelopmentRunner,
    command: string,
    plan: { args: string[]; env?: Record<string, string | undefined> },
  ) {
    const folder = path.join(this.folder, id);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    await chmod(this.folder, 0o700);
    const planFile = path.join(folder, "plan.json");
    await writeFile(
      planFile,
      JSON.stringify({
        ...plan,
        command,
        cwd,
        env: {
          ...plan.env,
          ...(runner === "hermes"
            ? {
                HERMES_HOME:
                  process.env.GENOBI_AGENT_HERMES_ROOT ??
                  path.join(process.env.HOME ?? "", ".hermes"),
              }
            : {}),
        },
        statusFile: path.join(folder, "status.json"),
      }),
      { mode: 0o600 },
    );
    const launchFile = path.join(folder, "Genobi.command");
    await writeFile(
      launchFile,
      `#!/bin/sh\ncd ${shellQuote(cwd)} || exit 1\nexec ${[process.execPath, path.join(cwd, "scripts/development-terminal.mjs"), planFile].map(shellQuote).join(" ")}\n`,
      { mode: 0o700 },
    );
    return launchFile;
  }
  /**
   * Opens the harness's own sign-in in Terminal (`loginArguments`). No
   * session receipt: there is nothing to resume, and the harness keeps its
   * own credentials; Genobi never reads them.
   */
  async login(runner: DevelopmentRunner, provider?: string) {
    if (!this.supported)
      throw new AppError(
        400,
        "Opening a sign-in currently requires macOS Terminal. Sign in from your own terminal on this system.",
      );
    if (
      runner === "hermes" &&
      (!provider ||
        !HERMES_PROVIDER.test(provider) ||
        openRouteRefusal("", provider))
    )
      throw new AppError(
        409,
        "Choose Hermes' open model provider in setup first.",
        "hermes_provider_missing",
      );
    if (this.busy)
      throw new AppError(409, "A terminal is already being opened.");
    this.busy = true;
    try {
      const command = await this.command(runner);
      if (!command)
        throw new AppError(503, "Install this harness first.", "not_installed");
      if (
        runner === "hermes" &&
        !(await (this.deps.genobiProfile
          ? this.deps.genobiProfile()
          : hasGenobiProfile(hermesRoot(process.env))))
      )
        throw new AppError(409, HERMES_PROFILE_NOTE, "hermes_profile_missing");
      const launchFile = await this.write(
        `login-${randomUUID()}`,
        runner,
        command,
        loginArguments(runner, provider),
      );
      try {
        await (this.deps.open ?? openTerminal)(launchFile);
      } catch {
        throw new AppError(
          503,
          "Terminal could not be confirmed open. Check Terminal before trying again.",
        );
      }
      return { opened: true as const };
    } finally {
      this.busy = false;
    }
  }
  /** A Genobi agent session's private folder, for the files its plan names. */
  agentFolder(id: string) {
    return path.join(this.folder, `agent-${id}`);
  }
  /**
   * Opens a Genobi agent session's harness in Terminal; the plan comes from
   * `server/agent-terminal.ts`. Its private files (owner-only) are written
   * first, then the plan and the `.command` file, as for the supervisor's
   * sessions. Resolves with the receipt the launcher writes when the harness
   * exits. An uncertain open is never retried.
   */
  async openAgent(
    id: string,
    runner: DevelopmentRunner,
    command: string,
    plan: { args: string[]; env?: Record<string, string | undefined> },
    files: Record<string, string> = {},
  ) {
    if (!this.supported)
      throw new AppError(
        400,
        "Opening a session in Terminal needs macOS. Run it in the bubble instead.",
      );
    if (this.busy)
      throw new AppError(409, "A terminal is already being opened.");
    this.busy = true;
    try {
      const folder = this.agentFolder(id);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      for (const [name, text] of Object.entries(files))
        await writeFile(path.join(folder, path.basename(name)), text, {
          mode: 0o600,
        });
      const launchFile = await this.write(
        path.basename(folder),
        runner,
        command,
        plan,
      );
      try {
        await (this.deps.open ?? openTerminal)(launchFile);
      } catch {
        throw new AppError(
          503,
          "Terminal could not be confirmed open. Check Terminal before starting again.",
        );
      }
      return { statusFile: path.join(folder, "status.json") };
    } finally {
      this.busy = false;
    }
  }
  close() {
    this.viewer.close();
  } // Native agent terminals remain owned by the user.
}
