import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  INSTALL_STEPS,
  pipProgress,
  type InstallState,
  type InstallStep,
  type StepOutcome,
} from "../shared/voice-install";
import { AppError } from "./errors";
import type { VoiceService } from "./voice";
import {
  adoptVoiceModel,
  defaultVoiceFolder,
  discoverVoiceModels,
  previousVoiceModels,
  type FoundVoiceModel,
} from "./voice-discovery";
import { installProcess } from "./voice-install-process";
import {
  downloadVoiceModel,
  MODEL_BYTES,
  MODEL_FILES,
  VOICE_MODEL,
  type ModelFile,
} from "./voice-model";
import { saveVoiceConfig } from "./voice-settings";

const probe = (command: string, args: string[]) =>
  new Promise<boolean>((resolve) =>
    execFile(command, args, { timeout: 10_000 }, (e) => resolve(!e)),
  );
export type { InstallState };

/** What the installer runs; tests replace any of it. */
export interface InstallDeps {
  run: typeof installProcess;
  download: typeof downloadVoiceModel;
  probe: typeof probe;
  adopt: typeof adoptVoiceModel;
  /** Every verified model already on this machine. */
  discover: (signal: AbortSignal) => Promise<FoundVoiceModel[]>;
  /** The default parent folder for a new install. */
  folder: () => Promise<string>;
  files: readonly ModelFile[];
}

/** The folder Genobi used before `models/`; earlier installs there are found. */
const LEGACY = path.join(os.homedir(), ".genobi");

export class VoiceInstaller {
  private grant?: { token: string; owner: string; expires: number };
  private owner?: string;
  private controller?: AbortController;
  private state: InstallState = { phase: "idle", bytes: 0 };
  private task?: Promise<void>;
  private deps: InstallDeps;
  private search?: Promise<FoundVoiceModel[]>;
  /** Folders the last search verified: the only ones a start may adopt. */
  private offered = new Set<string>();
  constructor(
    private voice: VoiceService,
    private directory: string,
    deps: Partial<InstallDeps> = {},
  ) {
    this.deps = {
      run: installProcess,
      download: downloadVoiceModel,
      probe,
      adopt: adoptVoiceModel,
      folder: () => defaultVoiceFolder(),
      files: MODEL_FILES,
      discover: async (signal) =>
        discoverVoiceModels(signal, {
          configured: this.voice.config.model,
          parents: [await this.deps.folder(), LEGACY],
          files: this.deps.files,
        }),
      ...deps,
    };
  }
  async describe(owner: string) {
    const [python, ffmpeg, folder] = await Promise.all([
      this.deps.probe("python3.11", [
        "-c",
        "import venv, sys; assert sys.version_info[:2] == (3,11)",
      ]),
      this.deps.probe(this.voice.config.ffmpeg, ["-version"]),
      this.deps.folder(),
    ]);
    if (
      !this.grant ||
      this.grant.owner !== owner ||
      Date.now() > this.grant.expires
    )
      this.grant = {
        token: randomUUID(),
        owner,
        expires: Date.now() + 10 * 60_000,
      };
    return {
      token: this.grant.token,
      model: VOICE_MODEL,
      bytes: MODEL_BYTES,
      folder,
      browse: process.platform === "darwin",
      supported: python && ffmpeg,
      reason: !python
        ? "Install Python 3.11 to enable automatic voice setup on this machine."
        : !ffmpeg
          ? "Install ffmpeg to enable automatic voice setup on this machine."
          : undefined,
      state: this.status(owner),
    };
  }
  /**
   * Looks for a verified Qwen3-ASR-0.6B already on this machine. One search
   * runs at a time; a request that arrives during it shares its answer.
   */
  async found() {
    this.search ??= this.deps
      .discover(AbortSignal.timeout(5 * 60_000))
      .finally(() => {
        this.search = undefined;
      });
    const models = await this.search;
    this.offered = new Set(models.map((model) => model.folder));
    return { models };
  }
  status(owner: string) {
    if (this.owner && this.owner !== owner)
      return { phase: "idle", bytes: 0, busy: !!this.controller };
    return { ...this.state, busy: !!this.controller };
  }
  authorize(owner: string, token: unknown) {
    if (
      !this.grant ||
      this.grant.owner !== owner ||
      this.grant.token !== token ||
      this.grant.expires < Date.now()
    )
      throw new AppError(403, "Reopen voice setup and confirm again.");
  }
  async folder(owner: string, token: unknown) {
    this.authorize(owner, token);
    if (process.platform !== "darwin")
      throw new AppError(400, "Enter the folder path instead.");
    return new Promise<string>((resolve, reject) =>
      execFile(
        "/usr/bin/osascript",
        [
          "-e",
          'POSIX path of (choose folder with prompt "Choose where Genobi installs Voice Mode")',
        ],
        { timeout: 120_000, maxBuffer: 8192 },
        (error, value) =>
          error
            ? reject(new AppError(400, "Folder selection closed."))
            : resolve(value.trim()),
      ),
    );
  }
  async start(
    owner: string,
    body: {
      token?: unknown;
      confirmed?: unknown;
      folder?: unknown;
      model?: unknown;
    },
  ) {
    this.authorize(owner, body.token);
    if (body.confirmed !== true)
      throw new AppError(400, "Confirm the voice installation first.");
    if (this.controller)
      throw new AppError(409, "Voice installation is already running.");
    if (
      typeof body.folder !== "string" ||
      body.folder.length > 4096 ||
      !path.isAbsolute(body.folder) ||
      /[\x00-\x1f]/.test(body.folder)
    )
      throw new AppError(400, "Choose an absolute folder path.");
    // Only a model the last search verified may be adopted.
    if (
      body.model !== undefined &&
      (typeof body.model !== "string" || !this.offered.has(body.model))
    )
      throw new AppError(400, "Look for the model again, then choose it.");
    const adopt = body.model as string | undefined;
    // Resolve existing parent symlinks, then create only our own new private child.
    let parent = body.folder;
    if ([await this.deps.folder(), LEGACY].includes(parent))
      await mkdir(parent, { recursive: true, mode: 0o700 }).catch(() => {});
    try {
      parent = await realpath(parent);
      await access(parent);
    } catch {
      throw new AppError(400, "Choose an existing writable folder.");
    }
    const checked = await this.describe(owner);
    if (!checked.supported) throw new AppError(400, checked.reason!);
    // Recheck after asynchronous preflight; only one install may reserve the slot.
    if (this.controller)
      throw new AppError(409, "Voice installation is already running.");
    this.grant = undefined;
    this.owner = owner;
    const controller = new AbortController();
    this.controller = controller;
    this.state = { phase: "environment", bytes: 0, steps: {} };
    this.task = this.install(parent, controller.signal, adopt)
      .catch(() => {
        const running = this.state.phase;
        if (!controller.signal.aborted)
          this.mark(running as InstallStep, "failed");
        this.state = {
          ...this.state,
          phase: controller.signal.aborted ? "cancelled" : "error",
          error: controller.signal.aborted
            ? undefined
            : running === "verify"
              ? "The model could not load on this machine."
              : "Voice setup could not finish. Check your connection, folder permissions and available disk space, then try again.",
        };
      })
      .finally(() => {
        this.controller = undefined;
      });
    return this.status(owner);
  }
  close() {
    this.controller?.abort();
    return this.task ?? Promise.resolve();
  }
  async cancel(owner: string) {
    if (this.owner !== owner)
      throw new AppError(
        403,
        "This installation belongs to another studio session.",
      );
    this.controller?.abort();
    await this.task;
    return this.status(owner);
  }
  /** Records a step's outcome; a running step is the current phase. */
  private mark(step: InstallStep, outcome: StepOutcome) {
    if (!this.state.steps || !INSTALL_STEPS.includes(step)) return;
    this.state.steps = { ...this.state.steps, [step]: outcome };
    if (outcome === "running") this.state.phase = step;
  }
  private async install(parent: string, signal: AbortSignal, adopt?: string) {
    const folder = await mkdtemp(path.join(parent, "genobi-voice-"));
    await chmod(folder, 0o700);
    let activated = false;
    const files = this.deps.files;
    try {
      this.mark("environment", "running");
      const environment = path.join(folder, "environment");
      const python = path.join(
        environment,
        process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
      );
      const model = path.join(folder, VOICE_MODEL);
      await mkdir(model);
      await this.deps.run("python3.11", ["-m", "venv", environment], signal);
      this.mark("environment", "done");
      // The model before anything is downloaded: the one chosen, or an
      // earlier install in this folder, linked in once each file verifies.
      this.mark("check", "running");
      const sources = [
        ...(adopt ? [adopt] : []),
        ...(await previousVoiceModels(parent, folder)),
      ];
      const found = await this.deps.adopt(model, sources, signal, files);
      if (found) {
        const home = os.homedir();
        this.state.found = found.startsWith(`${home}${path.sep}`)
          ? `~${found.slice(home.length)}`
          : found;
        this.state.bytes = files.reduce((n, file) => n + file.size, 0);
        this.state.reused = true;
        this.mark("check", "done");
        this.mark("download", "skipped");
      } else {
        this.mark("check", "done");
        this.mark("download", "running");
        // Files from a partial earlier install that verify are kept; the
        // rest is downloaded and checked against the pinned hashes.
        const downloaded = await this.deps.download(
          model,
          signal,
          (bytes) => {
            this.state.bytes = bytes;
          },
          sources,
        );
        this.state.reused = downloaded === 0;
        this.mark("download", "done");
      }
      this.mark("runtime", "running");
      const seen = new Set<string>();
      await this.deps.run(
        python,
        [
          "-I",
          "-m",
          "pip",
          "--isolated",
          "install",
          "--no-cache-dir",
          "--progress-bar",
          "off",
          "--index-url",
          "https://pypi.org/simple",
          "--disable-pip-version-check",
          "-r",
          path.join(path.dirname(this.voice.config.script), "requirements.txt"),
        ],
        signal,
        undefined,
        (line) => {
          this.state.runtime = pipProgress(this.state.runtime, line, seen);
        },
      );
      this.mark("runtime", "done");
      this.mark("verify", "running");
      await this.deps.run(
        python,
        ["-I", this.voice.config.script, "--check", model],
        signal,
        180_000,
      );
      // Actually load/warm the model offline before advertising Ready.
      await this.voice.checkConfiguration(
        { ...this.voice.config, python, model },
        signal,
      );
      if (signal.aborted) throw new Error("Installation cancelled.");
      this.mark("verify", "done");
      this.mark("activate", "running");
      const config = { ...this.voice.config, python, model };
      await saveVoiceConfig(this.directory, config);
      this.voice.configure(config);
      activated = true;
      this.mark("activate", "done");
      this.state.phase = "ready";
    } finally {
      if (!activated) await rm(folder, { recursive: true, force: true });
    }
  }
}
