// Ends one agent session's processes. The runner is spawned in a process
// group of its own, so one signal reaches it and every child that stayed in
// that group. A runner that starts its MCP servers in sessions of their own
// (Hermes: its MCP SDK spawns stdio servers with `start_new_session=True`)
// is also watched while it runs, and the groups its descendants were seen in
// are ended with it. Because a child that starts and is orphaned between two
// looks has no visible ancestry left, such a runner also carries a random
// per-session token in its environment (`GENOBI_AGENT_RUN`), which its
// children inherit; at the end, every group holding a process with that exact
// token is ended too. Only processes this session started can hold it.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

/** The environment variable that marks a session's processes. */
export const RUN_TOKEN_VARIABLE = "GENOBI_AGENT_RUN";

export interface ProcessRow {
  pid: number;
  ppid: number;
  pgid: number;
  command: string;
}

/** Every process the user can see, from `ps` (macOS and Linux); one retry. */
export async function processTable(): Promise<ProcessRow[]> {
  const rows = await listProcesses();
  return rows.length ? rows : listProcesses();
}

function listProcesses(): Promise<ProcessRow[]> {
  return new Promise((resolve) => {
    execFile(
      "ps",
      ["-A", "-o", "pid=,ppid=,pgid=,command="],
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error) return resolve([]);
        resolve(
          stdout.split("\n").flatMap((line) => {
            const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s(.*)$/);
            return match
              ? [
                  {
                    pid: Number(match[1]),
                    ppid: Number(match[2]),
                    pgid: Number(match[3]),
                    command: match[4].trim(),
                  },
                ]
              : [];
          }),
        );
      },
    );
  });
}

/** The processes below `root` in the table, not including it. */
export function descendants(rows: ProcessRow[], root: number) {
  const children = new Map<number, ProcessRow[]>();
  for (const row of rows)
    children.set(row.ppid, [...(children.get(row.ppid) ?? []), row]);
  const found: ProcessRow[] = [];
  const queue = [root];
  const visited = new Set(queue);
  while (queue.length) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (visited.has(child.pid)) continue;
      visited.add(child.pid);
      found.push(child);
      queue.push(child.pid);
    }
  }
  return found;
}

/** True while any process is in the group. */
export const groupAlive = (group: number) => {
  try {
    process.kill(-group, 0);
    return true;
  } catch {
    return false;
  }
};

const run = (command: string, args: string[]) =>
  new Promise<string>((resolve) =>
    execFile(
      command,
      args,
      { maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (error, stdout) => resolve(error ? "" : stdout),
    ),
  );

/**
 * The process groups holding a process whose environment has
 * `GENOBI_AGENT_RUN=<token>` exactly. macOS: `ps -E -ww` prints each of the
 * user's processes' environment after its command (platform binaries such
 * as `sleep` show none). Linux: `/proc/<pid>/environ`.
 */
export async function tokenGroups(
  token: string,
  rows?: ProcessRow[],
): Promise<number[]> {
  const entry = `${RUN_TOKEN_VARIABLE}=${token}`;
  const groups = new Set<number>();
  if (process.platform === "darwin") {
    const out = await run("ps", [
      "-E",
      "-ww",
      "-A",
      "-o",
      "pid=,pgid=,command=",
    ]);
    for (const line of out.split("\n")) {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s(.*)$/);
      if (match && ` ${match[3]} `.includes(` ${entry} `))
        groups.add(Number(match[2]));
    }
  } else if (process.platform === "linux") {
    for (const row of rows ?? (await processTable())) {
      const environ = await readFile(`/proc/${row.pid}/environ`, "utf8").catch(
        () => "",
      );
      if (environ.split("\0").includes(entry)) groups.add(row.pgid);
    }
  }
  return [...groups];
}

export interface ReaperOptions {
  /** Watch descendants that leave the runner's group (see the file header). */
  track: boolean;
  kill: (pid: number, signal: NodeJS.Signals) => void;
  /** How long SIGTERM has before SIGKILL. */
  graceMs: number;
  /** How often a tracked runner's descendants are listed. */
  sampleMs: number;
  /** Tests replace the process table. */
  table?: () => Promise<ProcessRow[]>;
  /** The session's `GENOBI_AGENT_RUN` token, when its runner carries one. */
  token?: string;
}

export class Reaper {
  /** Descendants seen outside the runner's group, by pid. */
  private seen = new Map<number, ProcessRow>();
  private timer?: NodeJS.Timeout;
  private reaping?: Promise<void>;

  constructor(
    private group: number,
    private options: ReaperOptions,
  ) {
    if (!options.track) return;
    this.timer = setInterval(() => void this.sample(), options.sampleMs);
    this.timer.unref();
    void this.sample();
  }

  private table() {
    return (this.options.table ?? processTable)().catch(() => []);
  }

  /** Records the runner's descendants that left its group. */
  async sample() {
    if (!this.options.track || !groupAlive(this.group)) return;
    for (const row of descendants(await this.table(), this.group))
      if (row.pgid !== this.group) this.seen.set(row.pid, row);
  }

  /**
   * The groups that still hold a process this session started: one that
   * carries the session's token, or one seen as a descendant with the same
   * pid, group and command line still, so a recycled pid in a stranger's
   * group is never signalled. Never this server's own group.
   */
  private async trackedGroups() {
    if (!this.seen.size && !this.options.token) return [];
    const rows = await this.table();
    const own = rows.find((row) => row.pid === process.pid)?.pgid;
    const groups = new Set<number>(
      this.options.token ? await tokenGroups(this.options.token, rows) : [],
    );
    for (const row of rows) {
      const seen = this.seen.get(row.pid);
      if (seen && seen.pgid === row.pgid && seen.command === row.command)
        groups.add(row.pgid);
    }
    return [...groups].filter(
      (group) => group > 1 && group !== own && group !== this.group,
    );
  }

  /**
   * SIGTERM to every group, then SIGKILL to whatever is left after the grace
   * period. It runs on every way a session ends, even after the runner has
   * exited, because a child it started can outlive it. Every caller shares
   * the one cleanup.
   */
  reap(): Promise<void> {
    this.reaping ??= (async () => {
      await this.sample();
      clearInterval(this.timer);
      const groups = [this.group, ...(await this.trackedGroups())];
      const living = () => groups.filter(groupAlive);
      const send = (signal: NodeJS.Signals) => {
        for (const group of living())
          try {
            this.options.kill(-group, signal);
          } catch {
            // Already gone.
          }
      };
      if (!living().length) return;
      send("SIGTERM");
      const deadline = Date.now() + this.options.graceMs;
      while (living().length && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (!living().length) return;
      send("SIGKILL");
      // A kill lands a moment later; wait for it so shutdown can rely on it.
      for (let i = 0; i < 20 && living().length; i++)
        await new Promise((resolve) => setTimeout(resolve, 50));
    })();
    return this.reaping;
  }
}
