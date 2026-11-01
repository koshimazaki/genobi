import { AppError } from "../server/errors";
import type { AgentSession } from "../shared/agent-session";
import {
  RATE_LIMITS,
  RATE_LIMIT_MESSAGE,
  RATE_WINDOW_MS,
} from "../shared/limits";
import {
  PAIR_CODE_MS,
  PAIR_LIFETIME_MS,
  RUNNER_ONLINE_MS,
  relayRequest,
  runnerUpdate,
  type RunnerPoll,
  type RunnerUpdate,
} from "../shared/runner-relay";

// Small structural boundary also permits tests against real SQLite without a network listener.
export interface RelayStatement {
  bind(...values: unknown[]): RelayStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface RelayDB {
  prepare(sql: string): RelayStatement;
}
interface Pair {
  id: string;
  owner: string;
  token_hash: string | null;
  runner: "hermes" | "claude";
  local_origin: string;
  last_seen: number;
  expires: number;
  revoked: number;
}
interface SessionRow {
  id: string;
  pair_id: string;
  request: string;
  view: string;
  phase: string;
  stop_requested: number;
  created: number;
}
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
export const secret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
const missing = () => new AppError(404, "Runner or session not found.");

export class RunnerStore {
  constructor(
    private db: RelayDB,
    private now = () => Date.now(),
  ) {}
  async pair(owner: string) {
    const id = crypto.randomUUID(),
      code = secret(),
      now = this.now();
    await this.db
      .prepare(
        `INSERT INTO runner_pairs (id,owner,code_hash,code_expires,expires)
      VALUES (?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET id=excluded.id,code_hash=excluded.code_hash,
      code_expires=excluded.code_expires,expires=excluded.expires,token_hash=NULL,runner=NULL,
      local_origin=NULL,last_seen=0,revoked=0,poll_window=0,poll_count=0`,
      )
      .bind(
        id,
        owner,
        await digest(code),
        now + PAIR_CODE_MS,
        now + PAIR_LIFETIME_MS,
      )
      .run();
    return { id, code, expires: now + PAIR_CODE_MS };
  }
  async claim(
    id: string,
    code: string,
    token: string,
    runner: string,
    localOrigin: string,
  ) {
    const now = this.now(),
      hash = await digest(token);
    const pair = await this.db
      .prepare(
        `UPDATE runner_pairs SET token_hash=?,code_hash=NULL,runner=?,local_origin=?
      WHERE id=? AND code_hash=? AND code_expires>? AND expires>? AND revoked=0 AND token_hash IS NULL RETURNING id`,
      )
      .bind(hash, runner, localOrigin, id, await digest(code), now, now)
      .first();
    if (!pair)
      throw new AppError(
        403,
        "Pairing code expired or already used. Create a new code in the hosted studio.",
      );
    return { paired: true };
  }
  async authenticate(id: string, token: string): Promise<Pair> {
    const pair = await this.db
      .prepare(
        "SELECT * FROM runner_pairs WHERE id=? AND token_hash=? AND revoked=0 AND expires>?",
      )
      .bind(id, await digest(token), this.now())
      .first<Pair>();
    if (!pair) throw new AppError(401, "Runner pairing expired or revoked.");
    return pair;
  }
  async status(owner: string) {
    const pair = await this.db
      .prepare(
        "SELECT * FROM runner_pairs WHERE owner=? AND revoked=0 AND expires>?",
      )
      .bind(owner, this.now())
      .first<Pair>();
    const available =
      !!pair?.token_hash && pair.last_seen > this.now() - RUNNER_ONLINE_MS;
    return {
      available,
      paired: !!pair?.token_hash,
      ...(pair?.runner ? { runner: pair.runner } : {}),
      message: available
        ? "Paired local runner is online. Model authentication is verified by a real session."
        : "Pair a local runner, or start the paired local studio.",
    };
  }
  async revoke(owner: string) {
    await this.db
      .prepare(
        "UPDATE runner_pairs SET revoked=1,code_hash=NULL,token_hash=NULL WHERE owner=?",
      )
      .bind(owner)
      .run();
    return { revoked: true };
  }
  async start(owner: string, id: string, raw: unknown) {
    let request;
    try {
      request = relayRequest(raw);
    } catch (error) {
      throw new AppError(400, (error as Error).message);
    }
    const encoded = JSON.stringify(request),
      now = this.now();
    const existing = await this.db
      .prepare("SELECT * FROM runner_sessions WHERE id=? AND owner=?")
      .bind(id, owner)
      .first<SessionRow>();
    if (existing) {
      if (existing.request !== encoded)
        throw new AppError(
          409,
          "This start ID already belongs to another request.",
        );
      return this.read(owner, id);
    }
    const pair = await this.db
      .prepare(
        "SELECT * FROM runner_pairs WHERE owner=? AND revoked=0 AND expires>? AND last_seen>? AND token_hash IS NOT NULL",
      )
      .bind(owner, now, now - RUNNER_ONLINE_MS)
      .first<Pair>();
    if (!pair)
      throw new AppError(
        503,
        "The paired runner is offline. Open your local studio first.",
      );
    const view: AgentSession = {
      id,
      runner: pair.runner,
      prompt: request.prompt,
      status: "starting",
      startedAt: new Date(now).toISOString(),
      lines: ["Waiting for the paired local runner…"],
    };
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO runner_sessions (id,owner,pair_id,request,view,created)
      SELECT ?,?,?,?,?,? FROM runner_pairs WHERE id=? AND revoked=0 AND expires>? AND last_seen>?`,
      )
      .bind(
        id,
        owner,
        pair.id,
        encoded,
        JSON.stringify(view),
        now,
        pair.id,
        now,
        now - RUNNER_ONLINE_MS,
      )
      .run();
    const row = await this.db
      .prepare("SELECT * FROM runner_sessions WHERE id=? AND owner=?")
      .bind(id, owner)
      .first<SessionRow>();
    if (!row)
      throw new AppError(
        409,
        "A session is already active, or pairing changed. Inspect the session before starting another.",
      );
    if (row.request !== encoded)
      throw new AppError(
        409,
        "This start ID already belongs to another request.",
      );
    return this.read(owner, id);
  }
  async read(owner: string, id: string): Promise<AgentSession> {
    const row = await this.db
      .prepare("SELECT * FROM runner_sessions WHERE id=? AND owner=?")
      .bind(id, owner)
      .first<SessionRow>();
    if (!row) throw missing();
    const pair = await this.db
      .prepare("SELECT * FROM runner_pairs WHERE id=? AND owner=?")
      .bind(row.pair_id, owner)
      .first<Pair>();
    const view = JSON.parse(row.view) as AgentSession;
    if (row.phase === "claimed" && row.created < this.now() - RUNNER_ONLINE_MS)
      view.summary =
        "Launch acknowledgement is missing. This request will not be replayed; use Stop and inspect the local studio.";
    if (
      ["queued", "claimed", "running"].includes(row.phase) &&
      (!pair ||
        pair.revoked ||
        pair.expires <= this.now() ||
        pair.last_seen <= this.now() - RUNNER_ONLINE_MS)
    ) {
      view.status = "interrupted";
      view.summary =
        "Runner connection lost or revoked. Execution may be uncertain; inspect the local studio before starting again.";
    }
    return view;
  }
  async latest(owner: string) {
    const row = await this.db
      .prepare(
        "SELECT id FROM runner_sessions WHERE owner=? ORDER BY created DESC LIMIT 1",
      )
      .bind(owner)
      .first<{ id: string }>();
    return { session: row ? await this.read(owner, row.id) : null };
  }
  async stop(owner: string, id: string) {
    await this.read(owner, id);
    await this.db
      .prepare(
        "UPDATE runner_sessions SET stop_requested=1 WHERE id=? AND owner=?",
      )
      .bind(id, owner)
      .run();
    return this.read(owner, id);
  }
  async poll(pair: Pair, updates: RunnerUpdate[]): Promise<RunnerPoll> {
    const now = this.now();
    const windowStart = now - RATE_WINDOW_MS;
    // One atomic write for both the heartbeat and the strict per-pair limit.
    // Before this, every poll wrote a separate rate_limits row as well,
    // exhausting the shared D1 Free allowance when a runner stayed online.
    // The WHERE guard works across Worker isolates and rechecks revocation.
    const heartbeat = await this.db
      .prepare(
        `UPDATE runner_pairs SET last_seen=?,
        poll_count=CASE WHEN poll_window<? THEN 1 ELSE poll_count+1 END,
        poll_window=CASE WHEN poll_window<? THEN ? ELSE poll_window END
        WHERE id=? AND token_hash=? AND revoked=0 AND expires>?
        AND (poll_window<? OR poll_count<?) RETURNING id`,
      )
      .bind(
        now,
        windowStart,
        windowStart,
        now,
        pair.id,
        pair.token_hash,
        now,
        windowStart,
        RATE_LIMITS.runnerPoll,
      )
      .first();
    if (!heartbeat) {
      // The request may have hit its limit or the pairing may have been
      // revoked since authenticate(). Do not turn a revoked token into 429.
      const valid = await this.db
        .prepare(
          "SELECT id FROM runner_pairs WHERE id=? AND token_hash=? AND revoked=0 AND expires>?",
        )
        .bind(pair.id, pair.token_hash, now)
        .first();
      if (valid) throw new AppError(429, RATE_LIMIT_MESSAGE);
      throw new AppError(401, "Runner pairing revoked.");
    }
    // Recheck the capability in every mutating SQL statement: revocation can race a poll.
    const live =
      "EXISTS (SELECT 1 FROM runner_pairs WHERE id=? AND token_hash=? AND revoked=0 AND expires>?)";
    for (const raw of updates) {
      const update = runnerUpdate(raw);
      const row = await this.db
        .prepare("SELECT * FROM runner_sessions WHERE id=? AND pair_id=?")
        .bind(update.id, pair.id)
        .first<SessionRow>();
      if (!row || row.phase === "queued" || row.phase === "terminal") continue;
      const old = JSON.parse(row.view) as AgentSession;
      const view: AgentSession = {
        ...old,
        status: update.status,
        lines: update.lines,
        summary: update.summary,
        ...(update.localId
          ? {
              localSessionUrl: `${pair.local_origin}/?agentSession=${update.localId}`,
            }
          : {}),
      };
      const phase = ["starting", "running"].includes(update.status)
        ? "running"
        : "terminal";
      await this.db
        .prepare(
          `UPDATE runner_sessions SET view=?,phase=? WHERE id=? AND pair_id=? AND phase IN ('claimed','running') AND ${live}`,
        )
        .bind(
          JSON.stringify(view),
          phase,
          update.id,
          pair.id,
          pair.id,
          pair.token_hash,
          now,
        )
        .run();
    }
    // Claim exactly once. A lost response never makes an uncertain launch eligible again.
    const command = await this.db
      .prepare(
        `UPDATE runner_sessions SET phase='claimed' WHERE id=(
      SELECT id FROM runner_sessions WHERE pair_id=? AND phase='queued' AND stop_requested=0 AND created>? ORDER BY created LIMIT 1)
      AND phase='queued' AND ${live} RETURNING id,request`,
      )
      .bind(pair.id, now - RUNNER_ONLINE_MS, pair.id, pair.token_hash, now)
      .first<{ id: string; request: string }>();
    const stops = await this.db
      .prepare(
        "SELECT id FROM runner_sessions WHERE pair_id=? AND stop_requested=1 AND phase IN ('queued', 'claimed', 'running') ORDER BY created DESC LIMIT 20",
      )
      .bind(pair.id)
      .all<{ id: string }>();
    // Unclaimed old/cancelled requests never launch after a reconnect.
    await this.db
      .prepare(
        "UPDATE runner_sessions SET phase='terminal', view=json_set(view,'$.status','stopped','$.summary','Stopped before launch.') WHERE pair_id=? AND phase='queued' AND (stop_requested=1 OR created<=?)",
      )
      .bind(pair.id, now - RUNNER_ONLINE_MS)
      .run();
    return {
      ...(command
        ? {
            command: {
              id: command.id,
              request: relayRequest(JSON.parse(command.request)),
            },
          }
        : {}),
      stops: stops.results.map((row) => row.id),
    };
  }
}

/** Same bounded housekeeping pass as jobs; no prompt data enters aggregate statistics. */
export async function sweepRunnerRelay(db: RelayDB, now: number) {
  await db
    .prepare(
      "DELETE FROM runner_sessions WHERE id IN (SELECT id FROM runner_sessions WHERE created<? ORDER BY created LIMIT 100)",
    )
    .bind(now - PAIR_LIFETIME_MS)
    .run();
  await db
    .prepare(
      "DELETE FROM runner_pairs WHERE id IN (SELECT id FROM runner_pairs WHERE expires<? ORDER BY expires LIMIT 100)",
    )
    .bind(now)
    .run();
}
