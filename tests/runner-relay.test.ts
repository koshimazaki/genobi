import { afterEach, expect, it } from "vitest";
import { relayFixture } from "./runner-relay-fixture";
import { secret, sweepRunnerRelay } from "../worker/runner-store";
import { runnerRoute } from "../worker/runner-routes";
import {
  PAIR_CODE_MS,
  RUNNER_ONLINE_MS,
  PAIR_LIFETIME_MS,
  relayRequest,
} from "../shared/runner-relay";
const fixtures: ReturnType<typeof relayFixture>[] = [];
function fixture() {
  const f = relayFixture();
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures.splice(0)) f.db.close();
});
const request = { prompt: "Build a simple camera scene", source: "typed" };
async function paired(f = fixture(), owner = "host-owner") {
  const code = await f.store.pair(owner),
    token = secret();
  await f.store.claim(
    code.id,
    code.code,
    token,
    "hermes",
    "http://127.0.0.1:4317",
  );
  const auth = await f.store.authenticate(code.id, token);
  await f.store.poll(auth, []);
  return { ...f, auth, code, token };
}
it("applies all additive migrations and stores only hashes for one-use credentials", async () => {
  const f = await paired();
  const row = f.db.prepare("SELECT * FROM runner_pairs").get();
  expect(row?.code_hash).toBeNull();
  expect(JSON.stringify(row)).not.toContain(f.token);
  await expect(
    f.store.claim(
      f.code.id,
      f.code.code,
      secret(),
      "hermes",
      "http://127.0.0.1:4317",
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(f.store.authenticate(f.code.id, secret())).rejects.toMatchObject(
    { status: 401 },
  );
  expect(await f.store.status("stranger")).toMatchObject({
    paired: false,
    available: false,
  });
});
it("expires pairing codes and lets only one competing claim win", async () => {
  const f = fixture(),
    code = await f.store.pair("owner");
  f.advance(PAIR_CODE_MS + 1);
  await expect(
    f.store.claim(
      code.id,
      code.code,
      secret(),
      "hermes",
      "http://localhost:4317",
    ),
  ).rejects.toMatchObject({ status: 403 });
  const current = await f.store.pair("owner");
  const claims = await Promise.allSettled(
    [1, 2].map(() =>
      f.store.claim(
        current.id,
        current.code,
        secret(),
        "hermes",
        "http://localhost:4317",
      ),
    ),
  );
  expect(claims.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
it("queues exactly one start under concurrent replay and claims it only once", async () => {
  const f = await paired(),
    id = crypto.randomUUID();
  const starts = await Promise.all([
    f.store.start("host-owner", id, request),
    f.store.start("host-owner", id, request),
  ]);
  expect(starts[0].id).toBe(starts[1].id);
  await expect(
    f.store.start("host-owner", id, { ...request, prompt: "Other request" }),
  ).rejects.toMatchObject({ status: 409 });
  const deliveries = await Promise.all([
    f.store.poll(f.auth, []),
    f.store.poll(f.auth, []),
  ]);
  expect(deliveries.filter((r) => r.command)).toHaveLength(1);
  expect((await f.store.poll(f.auth, [])).command).toBeUndefined();
  await expect(
    f.store.start("host-owner", crypto.randomUUID(), request),
  ).rejects.toMatchObject({ status: 409 });
});
it("isolates session reads, stop requests and runner reports across owners", async () => {
  const f = await paired(),
    id = crypto.randomUUID();
  await f.store.start("host-owner", id, request);
  await f.store.poll(f.auth, []);
  await expect(f.store.read("stranger", id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(f.store.stop("stranger", id)).rejects.toMatchObject({
    status: 404,
  });
  const other = await paired(f, "other-owner");
  await f.store.poll(other.auth, [{ id, status: "done", lines: ["spoof"] }]);
  expect((await f.store.read("host-owner", id)).status).toBe("starting");
  const localId = crypto.randomUUID();
  await f.store.poll(f.auth, [
    { id, localId, status: "done", lines: ["Scene prepared"] },
  ]);
  expect(await f.store.read("host-owner", id)).toMatchObject({
    status: "done",
    localSessionUrl: `http://127.0.0.1:4317/?agentSession=${localId}`,
  });
});
it("revocation wins against an already authenticated poll and invalidates the token", async () => {
  const f = await paired(),
    id = crypto.randomUUID();
  await f.store.start("host-owner", id, request);
  await f.store.revoke("host-owner");
  await expect(f.store.poll(f.auth, [])).rejects.toMatchObject({ status: 401 });
  await expect(f.store.authenticate(f.code.id, f.token)).rejects.toMatchObject({
    status: 401,
  });
  expect((await f.store.read("host-owner", id)).status).toBe("interrupted");
});
it("cancelled or stale queued starts never launch after reconnect", async () => {
  const f = await paired(),
    id = crypto.randomUUID();
  await f.store.start("host-owner", id, request);
  await f.store.stop("host-owner", id);
  expect((await f.store.poll(f.auth, [])).command).toBeUndefined();
  expect((await f.store.read("host-owner", id)).status).toBe("stopped");
  const next = crypto.randomUUID();
  await f.store.start("host-owner", next, request);
  f.advance(RUNNER_ONLINE_MS + 1);
  expect(await f.store.status("host-owner")).toMatchObject({
    available: false,
  });
  expect((await f.store.poll(f.auth, [])).command).toBeUndefined();
});
it("rejects hosted asset handles rather than giving a local runner unrelated context", async () => {
  const f = await paired();
  await expect(
    f.store.start("host-owner", crypto.randomUUID(), {
      ...request,
      context: {
        picks: [{ kind: "take", id: "asset", name: "Private", media: "video" }],
      },
    }),
  ).rejects.toThrow("not synced");
});
it("refuses setup's start: a relayed brief must never carry a local folder", async () => {
  const f = await paired();
  await expect(
    f.store.start("host-owner", crypto.randomUUID(), {
      ...request,
      setup: true,
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect(() => relayRequest({ ...request, setup: true })).toThrow(
    "local studio only",
  );
  // Nothing was queued for the local runner.
  expect((await f.store.poll(f.auth, [])).command).toBeUndefined();
});
it("browser management needs the explicit header; marked agents cannot pair or launch", async () => {
  const f = fixture();
  await expect(
    runnerRoute(
      new Request("https://studio.pages.dev/api/runner/pair", {
        method: "POST",
      }),
      f.store,
      "owner",
      async () => {},
      "ip",
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    runnerRoute(
      new Request("https://studio.pages.dev/api/runner/pair", {
        method: "POST",
        headers: { "X-Genobi-Agent": "1", "X-Genobi-Agent-Session": "1" },
      }),
      f.store,
      "owner",
      async () => {},
      "ip",
    ),
  ).rejects.toMatchObject({ status: 403 });
});

it("a lost claim can be stopped and acknowledged without being delivered again", async () => {
  const f = await paired(),
    id = crypto.randomUUID();
  await f.store.start("host-owner", id, request);
  await f.store.poll(f.auth, []);
  await f.store.stop("host-owner", id);
  const stopped = await f.store.poll(f.auth, []);
  expect(stopped.command).toBeUndefined();
  expect(stopped.stops).toContain(id);
  await f.store.poll(f.auth, [{ id, status: "interrupted", lines: [] }]);
  expect((await f.store.read("host-owner", id)).status).toBe("interrupted");
  await expect(
    f.store.start("host-owner", crypto.randomUUID(), request),
  ).resolves.toHaveProperty("id");
});

it("expires capabilities and deletes relay data through bounded housekeeping", async () => {
  const f = await paired();
  await f.store.start("host-owner", crypto.randomUUID(), request);
  f.advance(PAIR_LIFETIME_MS + 1);
  await expect(f.store.authenticate(f.code.id, f.token)).rejects.toMatchObject({
    status: 401,
  });
  await sweepRunnerRelay(f.binding, Date.now() + PAIR_LIFETIME_MS + 1000);
  expect(f.db.prepare("SELECT count(*) AS n FROM runner_pairs").get()?.n).toBe(
    0,
  );
  expect(
    f.db.prepare("SELECT count(*) AS n FROM runner_sessions").get()?.n,
  ).toBe(0);
});
