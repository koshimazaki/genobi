import { AppError } from "../server/errors";
import {
  AGENT_MARK_HEADER,
  AGENT_REQUEST_HEADER,
} from "../shared/agent-session-events";
import {
  RELAY_ID,
  RELAY_SECRET,
  localRunnerOrigin,
  runnerUpdate,
} from "../shared/runner-relay";
import { RunnerStore } from "./runner-store";
import type { RateBucket } from "../shared/limits";

async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Expected a JSON body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 256_000) {
      await reader.cancel();
      throw new AppError(413, "Runner request too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(400, "Expected a JSON object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, pattern: RegExp) {
  if (typeof value !== "string" || !pattern.test(value))
    throw new AppError(400, "Invalid runner identifier.");
  return value;
}
export async function runnerRoute(
  request: Request,
  store: RunnerStore,
  owner: string,
  limit: (bucket: RateBucket, id: string) => Promise<void>,
  ipHash: string,
) {
  const path = new URL(request.url).pathname,
    method = request.method;
  if (request.headers.has(AGENT_MARK_HEADER))
    throw new AppError(403, "An agent cannot pair or launch another runner.");
  if (
    method === "POST" &&
    ["/api/runner/claim", "/api/runner/poll"].includes(path)
  ) {
    if (path.endsWith("/claim")) {
      await limit("runnerPair", ipHash);
      const v = await body(request);
      if (v.runner !== "hermes" && v.runner !== "claude")
        throw new AppError(400, "Choose a supported runner.");
      if (typeof v.localOrigin !== "string")
        throw new AppError(400, "Expected the local studio origin.");
      return store.claim(
        text(v.id, RELAY_ID),
        text(v.code, RELAY_SECRET),
        text(v.token, RELAY_SECRET),
        v.runner,
        localRunnerOrigin(v.localOrigin),
      );
    }
    const id = text(request.headers.get("x-genobi-runner"), RELAY_ID);
    const token = text(
      request.headers.get("authorization")?.replace(/^Bearer /, ""),
      RELAY_SECRET,
    );
    const pair = await store.authenticate(id, token);
    // The per-pair budget is enforced with its heartbeat inside poll(),
    // not as a second D1 write in rate_limits on each heartbeat.
    const v = await body(request);
    if (!Array.isArray(v.updates) || v.updates.length > 20)
      throw new AppError(400, "Expected at most 20 session updates.");
    return store.poll(pair, v.updates.map(runnerUpdate));
  }
  if (request.headers.get(AGENT_REQUEST_HEADER) !== "1")
    throw new AppError(403, "Use the studio to manage its runner.");
  if (method === "POST" && path === "/api/runner/pair") {
    await limit("runnerPair", ipHash);
    return store.pair(owner);
  }
  if (method === "DELETE" && path === "/api/runner/pair") {
    await limit("edit", owner);
    return store.revoke(owner);
  }
  if (
    method === "GET" &&
    ["/api/runner/status", "/api/agent/status"].includes(path)
  ) {
    await limit("history", owner);
    return store.status(owner);
  }
  if (method === "GET" && path === "/api/agent/sessions") {
    await limit("history", owner);
    return store.latest(owner);
  }
  if (method === "POST" && path === "/api/agent/sessions") {
    await limit("submit", owner);
    const id = text(request.headers.get("idempotency-key"), RELAY_ID);
    return store.start(owner, id, await body(request));
  }
  const match = /^\/api\/agent\/sessions\/([^/]+)(\/stop)?$/.exec(path);
  if (
    match &&
    ((method === "GET" && !match[2]) || (method === "POST" && match[2]))
  ) {
    const id = text(match[1], RELAY_ID);
    await limit(method === "GET" ? "poll" : "edit", owner);
    return method === "GET" ? store.read(owner, id) : store.stop(owner, id);
  }
  throw new AppError(
    404,
    "This runner action is unavailable. Approve paid steps in the local studio.",
  );
}
