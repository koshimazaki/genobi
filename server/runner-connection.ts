import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentSessions } from "./agent-sessions";
import { AppError } from "./errors";
import {
  RELAY_ID,
  RELAY_SECRET,
  relayRequest,
  localRunnerOrigin,
  runnerPollDelay,
  type RunnerPoll,
  type RunnerUpdate,
} from "../shared/runner-relay";
import { plainText } from "../shared/agent-context";

interface Receipt {
  id: string;
  localId?: string;
  uncertain?: boolean;
}
interface Connection {
  owner: string;
  origin: string;
  id: string;
  token: string;
  runner: "hermes" | "claude";
  receipts: Receipt[];
}
type Sessions = Pick<AgentSessions, "status" | "start" | "read" | "stop">;
/** Only Cloudflare-owned HTTPS hostnames. No arbitrary local fetch proxy or redirects. */
/**
 * The hosted studios this local server may pair with: `GENOBI_HOSTED_ORIGINS`
 * (comma-separated HTTPS origins), else the project's own Pages site. Any
 * other pages.dev or workers.dev site is refused, so a look-alike deployment
 * cannot pair a local runner through a pasted code.
 */
export const DEFAULT_HOSTED_ORIGINS = [
  "https://genobi.pages.dev",
  // The previous Pages project, kept while visitors move to genobi.pages.dev.
  "https://fluxstudio.pages.dev",
];
export function hostedOrigins(
  env: string | undefined = process.env.GENOBI_HOSTED_ORIGINS,
) {
  const listed = (env ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return listed.length ? listed : DEFAULT_HOSTED_ORIGINS;
}

/**
 * Whether `url` is an allowed hosted studio: one of `allowed` exactly, or a
 * deployment of an allowed Pages project (`<deployment>.<project>.pages.dev`),
 * which Cloudflare serves under that project alone.
 */
function allowedHost(url: URL, allowed: readonly string[]) {
  return allowed.some((origin) => {
    let base: URL;
    try {
      base = new URL(origin);
    } catch {
      return false;
    }
    if (base.protocol !== "https:") return false;
    if (url.origin === base.origin) return true;
    return (
      base.hostname.endsWith(".pages.dev") &&
      base.hostname.split(".").length === 3 &&
      /^[a-z0-9-]+$/.test(url.hostname.slice(0, -base.hostname.length - 1)) &&
      url.hostname.endsWith(`.${base.hostname}`)
    );
  });
}

export function cloudRunnerOrigin(
  value: unknown,
  allowed: readonly string[] = hostedOrigins(),
) {
  if (typeof value !== "string")
    throw new AppError(400, "Enter the hosted studio URL.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, "Enter a valid hosted studio URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new AppError(400, "Use the studio's HTTPS origin, without a path.");
  if (!allowedHost(url, allowed))
    throw new AppError(
      400,
      "That studio is not one this local server pairs with. Add its origin to GENOBI_HOSTED_ORIGINS to trust it.",
    );
  return url.origin;
}

/** Outbound-only relay. No public listener, provider credentials or arbitrary command execution. */
export class RunnerConnection {
  private connection?: Connection;
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<void>;
  private changing = false;
  private stopped = true;
  private message = "Not paired.";
  private sent = new Map<string, string>();
  private file: string;
  constructor(
    directory: string,
    private agents: Sessions,
    private localOrigin: string,
    private fetcher: typeof fetch = fetch,
  ) {
    this.file = path.join(directory, "runner-pair.json");
    localRunnerOrigin(localOrigin);
  }
  async load() {
    try {
      const c = JSON.parse(await readFile(this.file, "utf8"));
      if (
        !RELAY_ID.test(c.id) ||
        !RELAY_SECRET.test(c.token) ||
        typeof c.owner !== "string" ||
        !["hermes", "claude"].includes(c.runner) ||
        !Array.isArray(c.receipts) ||
        c.receipts.length > 20 ||
        c.receipts.some(
          (r: Receipt) =>
            !RELAY_ID.test(r.id) || (r.localId && !RELAY_ID.test(r.localId)),
        )
      )
        throw new Error("Invalid connection");
      c.origin = cloudRunnerOrigin(c.origin);
      this.connection = c;
      this.message = "Paired; reconnecting.";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        this.message =
          "Pairing could not be loaded. Disconnect and pair again.";
    }
  }
  private async save(c: Connection) {
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(c), { mode: 0o600 });
    await rename(temp, this.file);
  }
  status(owner: string) {
    const c = this.connection;
    return c && c.owner !== owner
      ? {
          paired: false,
          message: "Another local studio session owns the pairing.",
        }
      : {
          paired: !!c,
          ...(c ? { origin: c.origin } : {}),
          message: this.message,
        };
  }
  private async send(c: Connection, endpoint: string, body: unknown) {
    const response = await this.fetcher(`${c.origin}/api/runner/${endpoint}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.token}`,
        "X-Genobi-Runner": c.id,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new AppError(
        response.status,
        "The hosted runner connection was refused. Check pairing in Settings.",
      );
    // Bound replies as well: a substituted origin cannot feed an unbounded command.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty relay response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 64_000) {
        await reader.cancel();
        throw new Error("Relay response too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async connect(owner: string, value: unknown) {
    if (this.changing || this.connection)
      throw new AppError(
        409,
        "Disconnect the existing pairing before connecting another studio.",
      );
    this.changing = true;
    try {
      const v = value as Record<string, unknown>;
      if (
        !v ||
        typeof v.id !== "string" ||
        !RELAY_ID.test(v.id) ||
        typeof v.code !== "string" ||
        !RELAY_SECRET.test(v.code) ||
        v.confirmed !== true
      )
        throw new AppError(
          400,
          "Paste a current pairing code and confirm remote session access.",
        );
      const status = await this.agents.status();
      if (!status.available || !status.runner)
        throw new AppError(
          409,
          "Configure and authenticate the local runner first.",
        );
      const c: Connection = {
        owner,
        origin: cloudRunnerOrigin(v.origin),
        id: v.id,
        token: randomBytes(32).toString("hex"),
        runner: status.runner,
        receipts: [],
      };
      // Retain the capability before claim; a lost claim response can be recovered by polling.
      await this.save(c);
      this.connection = c;
      try {
        await this.send(c, "claim", {
          id: c.id,
          code: v.code,
          token: c.token,
          runner: c.runner,
          localOrigin: this.localOrigin,
        });
        this.message = "Paired; connecting to the hosted studio.";
      } catch {
        this.message =
          "Pairing response was lost or refused. Checking connection; if it stays offline, disconnect and create a new code.";
      }
      this.resume();
      return this.status(owner);
    } finally {
      this.changing = false;
    }
  }
  private updates(c: Connection): RunnerUpdate[] {
    return c.receipts.map((r) => {
      if (r.localId && !r.uncertain) {
        try {
          const view = this.agents.read(r.localId, c.owner);
          return {
            id: r.id,
            localId: r.localId,
            status: view.status,
            lines: view.lines.slice(-40).map((line) => plainText(line, 300)),
            summary: view.approvals?.some((a) => a.status === "pending")
              ? "A paid step needs your approval in the local studio."
              : view.summary && plainText(view.summary, 2000),
          };
        } catch {
          /* Never recreate a session lost across process restart. */
        }
      }
      return {
        id: r.id,
        localId: r.localId,
        status: "interrupted",
        lines: [],
        summary:
          "Execution could not be recovered. Inspect the local studio; this request will not be replayed.",
      };
    });
  }
  private stopTracked(c: Connection) {
    for (const r of c.receipts)
      if (r.localId) {
        try {
          this.agents.stop(r.localId, c.owner);
        } catch {
          /* Already gone. */
        }
      }
  }
  async tick() {
    if (this.inFlight) return this.inFlight;
    const task = this.poll();
    this.inFlight = task;
    try {
      await task;
    } finally {
      this.inFlight = undefined;
    }
  }
  private async poll() {
    const c = this.connection;
    if (!c || this.stopped) return;
    try {
      const status = await this.agents.status();
      if (!status.available || status.runner !== c.runner)
        throw new Error("Runner changed");
      const updates = this.updates(c).filter(
        (update) => this.sent.get(update.id) !== JSON.stringify(update),
      );
      const result = (await this.send(c, "poll", { updates })) as RunnerPoll;
      if (this.stopped || c !== this.connection) return;
      if (
        !Array.isArray(result.stops) ||
        result.stops.length > 20 ||
        result.stops.some((id) => typeof id !== "string" || !RELAY_ID.test(id))
      )
        throw new Error("Invalid stops");
      for (const update of updates)
        this.sent.set(update.id, JSON.stringify(update));
      for (const id of this.sent.keys())
        if (!c.receipts.some((r) => r.id === id)) this.sent.delete(id);
      for (const id of result.stops) {
        const receipt = c.receipts.find((r) => r.id === id);
        if (receipt?.localId) {
          try {
            this.agents.stop(receipt.localId, c.owner);
          } catch {
            /* Already gone: restarted away or evicted. Nothing left to stop. */
          }
        } else if (!receipt)
          c.receipts = [...c.receipts.slice(-19), { id, uncertain: true }];
      }
      const command = result.command;
      if (command && !result.stops.includes(command.id)) {
        if (typeof command.id !== "string" || !RELAY_ID.test(command.id))
          throw new Error("Invalid command");
        const request = relayRequest(command.request);
        if (!c.receipts.some((r) => r.id === command.id)) {
          const receipt: Receipt = { id: command.id, uncertain: true };
          c.receipts = [...c.receipts.slice(-19), receipt];
          await this.save(c); // Reserve locally before starting inference, even if delivery is duplicated.
          if (this.stopped || c !== this.connection) return;
          const session = await this.agents.start(c.owner, request, true);
          receipt.localId = session.id;
          receipt.uncertain = false;
          try {
            await this.save(c);
          } catch {
            this.agents.stop(session.id, c.owner);
            throw new Error("Receipt failed");
          }
          if (this.stopped) this.agents.stop(session.id, c.owner);
        }
      }
      this.message =
        "Connected. Hosted prompts can start the configured local runner.";
    } catch (error) {
      // Loss of control stops paired work. A heartbeat reconnect never replays a start.
      this.stopTracked(c);
      this.message =
        "Connection unavailable. Paired sessions were asked to stop; check the local studio before retrying.";
      if (error instanceof AppError && [401, 403].includes(error.status))
        this.stopped = true;
    }
  }
  resume() {
    if (!this.stopped || !this.connection) return;
    this.stopped = false;
    const loop = async () => {
      await this.tick();
      if (!this.stopped) {
        // An idle connection needs only a 6s heartbeat; once a local
        // session starts, progress and Stop retain their 3s cadence.
        const updates = this.connection ? this.updates(this.connection) : [];
        this.timer = setTimeout(() => void loop(), runnerPollDelay(updates));
        this.timer.unref();
      }
    };
    void loop();
  }
  async close() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.inFlight;
    if (this.connection) this.stopTracked(this.connection);
  }
  async disconnect(owner: string) {
    if (this.changing)
      throw new AppError(409, "Pairing is changing; retry shortly.");
    if (this.connection && this.connection.owner !== owner)
      throw new AppError(403, "Only the pairing owner can disconnect it.");
    this.changing = true;
    try {
      await this.close();
      await rm(this.file, { force: true });
      this.connection = undefined;
      this.sent.clear();
      this.message =
        "Disconnected. Revoke the pairing in the hosted studio too.";
      return this.status(owner);
    } finally {
      this.changing = false;
    }
  }
}
