// Local only: lets the studio pick up new server code without the person
// finding the terminal that runs `npm run dev`. The hosted Worker has no
// equivalent; a deploy replaces it.
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The exit code `scripts/dev-server.mjs` reads as "start the server again". */
export const RESTART_EXIT_CODE = 75;
/** Set by `scripts/dev-server.mjs`; without it nothing would start us again. */
export const RESTARTABLE_VARIABLE = "GENOBI_RESTARTABLE";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** What the running process loaded: a newer file here means stale code. */
const SOURCES = ["server", "shared", "scripts/development-terminal.mjs"];

async function newest(file: string): Promise<number> {
  const info = await stat(file).catch(() => undefined);
  if (!info) return 0;
  if (!info.isDirectory()) return info.mtimeMs;
  const names = await readdir(file).catch(() => [] as string[]);
  const times = await Promise.all(
    names.map((name) => newest(path.join(file, name))),
  );
  return Math.max(0, ...times);
}

export interface ServerState {
  /** Whether the studio can restart this process itself. */
  restartable: boolean;
  /** Whether server code changed on disk after this process started. */
  changed: boolean;
}

/**
 * Why a restart must wait: a job still `submitting` has no provider id yet,
 * so exiting now would record it as an error although the provider may
 * already have accepted and charged the run.
 */
export function inFlightSubmissions(
  jobs: readonly { status: string }[],
): string | undefined {
  const count = jobs.filter((job) => job.status === "submitting").length;
  if (!count) return undefined;
  return `${count} submission${count === 1 ? " is" : "s are"} still being sent; restart once it has a provider id.`;
}

export class ServerRestart {
  private startedAt = Date.now();
  private requested = false;
  constructor(
    /** Graceful shutdown with `RESTART_EXIT_CODE`; absent when unsupervised. */
    private restart?: () => void,
    private root = ROOT,
    /** Why a restart must wait, when a paid submission is still in flight. */
    private inFlight?: () => string | undefined,
  ) {}
  /** A reason to refuse right now, or nothing when the server may exit. */
  busy(): string | undefined {
    return this.inFlight?.();
  }
  async state(): Promise<ServerState> {
    const times = await Promise.all(
      SOURCES.map((source) => newest(path.join(this.root, source))),
    );
    return {
      restartable: !!this.restart,
      changed: Math.max(...times) > this.startedAt,
    };
  }
  /** Answers whether a restart was scheduled; repeated requests share one. */
  request() {
    if (!this.restart) return false;
    if (!this.requested) {
      this.requested = true;
      // Let the response leave before the listener closes.
      setTimeout(this.restart, 100).unref();
    }
    return true;
  }
}
