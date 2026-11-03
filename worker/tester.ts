// Hosted tester access (docs/tester-access.md). Off unless the operator sets
// every secret below; then an access code handed out with a submission
// unlocks a capped number of runs of the two Comfy Deploy workflows on the
// operator's own endpoint, paid by the operator's workspace. The code is
// compared in constant time and never stored or logged: D1 keeps a hash of it
// and a count. The browser gets a short-lived HMAC token bound to its session.
import { AppError } from "../server/errors";
import { isComfyKey } from "../shared/provider";
import { parseWorkflowDestination } from "../shared/comfy/destination";
import { isDeployModel } from "../shared/comfy/deploy-catalogue";
import type { Entry } from "../shared/registry";
import { sha256Hex, type WorkflowPlan } from "../shared/take";
import {
  DEFAULT_TESTER_RUN_CAP,
  MAX_TESTER_CODE_LENGTH,
  MIN_TESTER_CODE_LENGTH,
  TESTER_TOKEN_PREFIX,
  TESTER_TOKEN_TTL_MS,
  isTesterToken,
  type TesterStatus,
} from "../shared/tester";
import { saveDeploymentUrl } from "./deployments";
import { rateLimit } from "./storage";
import {
  testerDeploymentOnly,
  testerRefused,
  testerRunsUsedUp,
} from "./tester-errors";

/**
 * Pages secrets (`wrangler pages secret put`), so none is in the repository
 * or in the generated `worker/env.d.ts`: an unset one reads as undefined.
 */
export interface TesterBindings {
  TESTER_ACCESS_CODE?: string;
  /** HMAC key for unlock tokens; at least 32 characters. */
  TESTER_TOKEN_SECRET?: string;
  /** The operator's Comfy key, authorised for the deployment's workspace. */
  TESTER_COMFY_KEY?: string;
  /** The operator's `https://<name>.run.comfy.app` endpoint. */
  TESTER_DEPLOYMENT_URL?: string;
  /** Runs one code may reserve; 10 when unset. */
  TESTER_RUN_CAP?: string;
}

/** What a verified token grants one request. */
export interface TesterAccess {
  url: string;
  codeHash: string;
  cap: number;
  expires: number;
}

interface Config {
  code: string;
  secret: string;
  key: string;
  url: string;
  cap: number;
}

function config(env: Env): Config | undefined {
  const e = env as Env & TesterBindings;
  const code = e.TESTER_ACCESS_CODE?.trim() ?? "";
  const secret = e.TESTER_TOKEN_SECRET ?? "";
  const key = e.TESTER_COMFY_KEY?.trim() ?? "";
  if (
    code.length < MIN_TESTER_CODE_LENGTH ||
    code.length > MAX_TESTER_CODE_LENGTH ||
    secret.length < 32 ||
    !isComfyKey(key) ||
    isTesterToken(key)
  )
    return undefined;
  let url: string;
  try {
    const parsed = parseWorkflowDestination(
      "deployment",
      e.TESTER_DEPLOYMENT_URL?.trim() ?? "",
    );
    if (parsed.kind !== "deployment") return undefined;
    url = parsed.url;
  } catch {
    return undefined;
  }
  const raw = e.TESTER_RUN_CAP?.trim();
  const cap = raw ? Number(raw) : DEFAULT_TESTER_RUN_CAP;
  return {
    code,
    secret,
    key,
    url,
    cap: Number.isInteger(cap) && cap >= 0 && cap <= 1000 ? cap : 0,
  };
}

/** `GET /api/health` reports this; false unless every secret is valid. */
export const testerEnabled = (env: Env) => config(env) !== undefined;

const encoder = new TextEncoder();
async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(message)),
  );
}
/** Equal-length digests compared without an early exit. */
function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
/** The counter's key: a hash of the code, so D1 never holds the code. */
const codeHash = (code: string) => sha256Hex(`genobi-tester-v1:${code}`);
const signature = (
  cfg: Config,
  hash: string,
  expires: number,
  session: string,
) => hmac(cfg.secret, `v1|${expires}|${hash}|${session}`);

/**
 * Swaps a tester token in the key slot for the operator's key. Undefined when
 * the slot holds an ordinary key. A token that no longer verifies (expired,
 * another session, a rotated or deleted code) is refused without detail.
 */
export async function resolveTester(
  env: Env,
  key: string | undefined,
  session: string,
): Promise<{ key: string; access: TesterAccess } | undefined> {
  if (!isTesterToken(key)) return undefined;
  const cfg = config(env);
  if (!cfg) throw testerRefused();
  const [expiresText, sig, extra] = key!
    .slice(TESTER_TOKEN_PREFIX.length)
    .split(".");
  const expires = Number(expiresText);
  const now = Date.now();
  if (
    extra !== undefined ||
    !sig ||
    !Number.isSafeInteger(expires) ||
    expires <= now ||
    expires > now + TESTER_TOKEN_TTL_MS
  )
    throw testerRefused();
  const hash = await codeHash(cfg.code);
  const expected = base64url(await signature(cfg, hash, expires, session));
  if (!sameBytes(encoder.encode(expected), encoder.encode(sig)))
    throw testerRefused();
  return {
    key: cfg.key,
    access: { url: cfg.url, codeHash: hash, cap: cfg.cap, expires },
  };
}

export async function runsLeft(env: Env, access: TesterAccess) {
  const row = await env.DB.prepare(
    "SELECT used FROM tester_runs WHERE code_hash=?",
  )
    .bind(access.codeHash)
    .first<{ used: number }>();
  return Math.max(0, access.cap - (row?.used ?? 0));
}

export async function testerStatus(
  env: Env,
  access: TesterAccess,
): Promise<TesterStatus> {
  return {
    runsLeft: await runsLeft(env, access),
    expiresAt: new Date(access.expires).toISOString(),
  };
}

/** Before a quote or a reservation: a run left, and only the two deploy workflows on the operator's endpoint. */
export async function requireTesterRun(
  env: Env,
  access: TesterAccess,
  plan: WorkflowPlan,
  entry: Entry,
) {
  if (
    !plan.deployment ||
    plan.deployment.url !== access.url ||
    entry.status !== "ready" ||
    !isDeployModel(entry.videoModel)
  )
    throw testerDeploymentOnly();
  if ((await runsLeft(env, access)) <= 0) throw testerRunsUsedUp();
}

/**
 * The statements `spendQuoteAndReserve` wraps around its quote claim and job
 * insert, in the same D1 transaction: the quote is claimed only while a run is
 * left, and the count rises only when this request's job row was inserted.
 */
export function testerReservation(
  env: Env,
  access: TesterAccess,
  jobId: string,
  session: string,
  now: number,
) {
  return {
    ensure: env.DB.prepare(
      "INSERT OR IGNORE INTO tester_runs(code_hash,used,created_at,updated_at) VALUES(?,0,?,?)",
    ).bind(access.codeHash, now, now),
    /** Appended to the quote claim's WHERE clause, with `capBinds`. */
    capClause:
      " AND (SELECT used FROM tester_runs WHERE code_hash=?) < ?" as const,
    capBinds: [access.codeHash, access.cap] as const,
    count: env.DB.prepare(
      `UPDATE tester_runs SET used=used+1, updated_at=? WHERE code_hash=?
      AND EXISTS (SELECT 1 FROM jobs WHERE id=? AND session=?)`,
    ).bind(now, access.codeHash, jobId, session),
  };
}

/** A submission refused before anything was sent costs nothing, so its run returns. */
export async function returnTesterRun(env: Env, access: TesterAccess) {
  await env.DB.prepare(
    "UPDATE tester_runs SET used=max(used-1,0), updated_at=? WHERE code_hash=?",
  )
    .bind(Date.now(), access.codeHash)
    .run();
}

/**
 * `POST /api/tester/unlock`. Undefined (the route is absent) unless tester
 * access is configured. Rate limited per hashed IP and across the deployment
 * before the body is read. A match registers the operator's endpoint for this
 * session and returns a token; anything else is a bare 401.
 */
export async function testerUnlock(
  request: Request,
  env: Env,
  session: string,
  body: () => Promise<unknown>,
) {
  const cfg = config(env);
  if (!cfg) return undefined;
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "Send JSON from the studio.");
  await rateLimit(
    env,
    "testerUnlockPerIp",
    await sha256Hex(request.headers.get("cf-connecting-ip") || "local"),
  );
  await rateLimit(env, "testerUnlockGlobal", "tester-unlock");
  const value = await body();
  const code =
    value && typeof value === "object" && "code" in value
      ? (value as { code: unknown }).code
      : undefined;
  if (typeof code !== "string" || code.length > MAX_TESTER_CODE_LENGTH)
    throw testerRefused();
  // Both sides go through the same HMAC first, so the comparison is fixed
  // length and leaks neither the code's length nor a matching prefix.
  const matches = sameBytes(
    await hmac(cfg.secret, `code|${code.trim()}`),
    await hmac(cfg.secret, `code|${cfg.code}`),
  );
  if (!matches) throw testerRefused();
  const hash = await codeHash(cfg.code);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO tester_runs(code_hash,used,created_at,updated_at) VALUES(?,0,?,?)",
  )
    .bind(hash, now, now)
    .run();
  await saveDeploymentUrl(env, session, cfg.url);
  const expires = now + TESTER_TOKEN_TTL_MS;
  const access = { url: cfg.url, codeHash: hash, cap: cfg.cap, expires };
  return {
    token: `${TESTER_TOKEN_PREFIX}${expires}.${base64url(await signature(cfg, hash, expires, session))}`,
    ...(await testerStatus(env, access)),
  };
}
