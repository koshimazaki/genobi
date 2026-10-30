import type { ChainView } from "../shared/chain";
import type { GenerateInput } from "../shared/types";

/**
 * The chain routes as `server/chains.ts` answers them, in memory: a chain
 * pauses before each stage with a fresh quote, an approval must carry that
 * quote, a stage runs until it is read again, and a cancel works only at a
 * pause. Every request is recorded so a test can count what was sent.
 */
export function fakeChainServer() {
  const chains = new Map<string, ChainView>();
  const sent: {
    method: string;
    path: string;
    headers: Record<string, string>;
  }[] = [];
  let next = 0;
  const refusals: { status: number; error: string; code: string }[] = [];
  let loseNext = false;
  /**
   * A slow approval: its answer is lost and its claim lands only after this
   * many reads (Infinity: it never lands, as when it could not reserve).
   */
  let lateBy: number | undefined;
  let late: { wait: number; land: () => void } | undefined;
  let lostReads = 0;
  let slowSubmit = false;
  /** Reads a claimed stage still answers `submitting` before its job shows. */
  let claimedReads = 0;
  const quote = (generator: string) => ({
    id: `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
    estimateUsd: generator === "upscale" ? 0.45 : 0.3,
    recipe: {
      id: generator === "upscale" ? "flux-video-upscale" : "flux-3-video",
      version: 1,
      route: "bfl" as const,
    },
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });
  const pause = (chain: ChainView, index: number) => {
    chain.status = "paused";
    chain.pausedAt = index;
    chain.stages[index].status = "paused";
    chain.quote = quote(chain.stages[index].input.generator);
  };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });
  async function fetch(path: string, init: RequestInit = {}) {
    const method = init.method ?? "GET";
    const headers = (init.headers ?? {}) as Record<string, string>;
    sent.push({ method, path, headers });
    if (path === "/api/chains" && method === "GET")
      return reply(200, { chains: [...chains.values()] });
    if (path === "/api/chains") {
      const body = JSON.parse(String(init.body)) as {
        stages: { input: GenerateInput }[];
      };
      const id = `11111111-0000-4000-8000-${String(++next).padStart(12, "0")}`;
      const chain: ChainView = {
        id,
        status: "paused",
        createdAt: "2026-10-21T00:00:00.000Z",
        updatedAt: "2026-10-21T00:00:00.000Z",
        stages: body.stages.map(({ input }) => ({ status: "waiting", input })),
      };
      pause(chain, 0);
      chains.set(id, chain);
      return reply(201, { chain: structuredClone(chain) });
    }
    const [, , , id, action] = path.split("/");
    const chain = chains.get(id);
    if (!chain) return reply(404, { error: "Chain not found." });
    if (method === "GET") {
      if (late) {
        if (late.wait > 0) late.wait--;
        else {
          late.land();
          late = undefined;
        }
      }
      if (lostReads > 0) {
        lostReads--;
        throw new TypeError("Failed to fetch");
      }
      // A claimed approval becomes its job on a later read.
      const claimed = chain.stages.findIndex((s) => s.status === "submitting");
      if (claimed >= 0) {
        if (claimedReads > 0) {
          claimedReads--;
          return reply(200, { chain: structuredClone(chain) });
        }
        chain.stages[claimed] = {
          ...chain.stages[claimed],
          status: "running",
          jobId: `job-${id.slice(-4)}-${claimed}`,
        };
        return reply(200, { chain: structuredClone(chain) });
      }
      const at = chain.stages.findIndex((stage) => stage.status === "running");
      if (at >= 0) {
        chain.stages[at].status = "ready";
        if (at + 1 < chain.stages.length) pause(chain, at + 1);
        else chain.status = "complete";
      }
      return reply(200, { chain: structuredClone(chain) });
    }
    const refusal = refusals.shift();
    if (refusal) return reply(refusal.status, refusal);
    if (action === "approve") {
      if (chain.status !== "paused")
        return reply(409, {
          error: "This chain is not waiting for an approval.",
          code: "chain_not_paused",
        });
      if (headers["Quote-Id"] !== chain.quote?.id)
        return reply(409, {
          error: "This quote is not the one the chain is waiting on.",
          code: "quote_mismatch",
        });
      const at = chain.pausedAt!;
      if (lateBy !== undefined) {
        const wait = lateBy;
        lateBy = undefined;
        late = {
          wait,
          land: () => {
            chain.stages[at] = {
              ...chain.stages[at],
              status: "running",
              jobId: `job-${id.slice(-4)}-${at}`,
            };
            chain.status = "running";
            delete chain.pausedAt;
            delete chain.quote;
          },
        };
        throw new TypeError("Failed to fetch");
      }
      chain.stages[at] = slowSubmit
        ? { ...chain.stages[at], status: "submitting" }
        : {
            ...chain.stages[at],
            status: "running",
            jobId: `job-${id.slice(-4)}-${at}`,
          };
      if (slowSubmit) claimedReads = 1;
      slowSubmit = false;
      chain.status = "running";
      delete chain.pausedAt;
      delete chain.quote;
      if (loseNext) {
        // The stage started; only its answer never arrives.
        loseNext = false;
        throw new TypeError("Failed to fetch");
      }
      return reply(202, { chain: structuredClone(chain) });
    }
    if (chain.status !== "paused")
      return reply(409, {
        error: "A stage is running. A chain can be cancelled only at a pause.",
        code: "chain_not_paused",
      });
    chain.status = "cancelled";
    chain.cancelledAt = "2026-10-21T00:01:00.000Z";
    delete chain.pausedAt;
    delete chain.quote;
    for (const stage of chain.stages)
      if (stage.status !== "ready") stage.status = "cancelled";
    return reply(200, { chain: structuredClone(chain) });
  }
  /** The next POST is refused with this answer, once. */
  const refuseNext = (status: number, error: string, code: string) =>
    refusals.push({ status, error, code });
  /** The next approval starts its stage, then its response is lost. */
  const loseNextApproval = () => {
    loseNext = true;
  };
  /** The next `count` chain reads are lost before they answer. */
  /** The next approval's answer is lost; it lands after `reads` reads. */
  const approveLate = (reads: number) => {
    lateBy = reads;
  };
  const loseReads = (count: number) => {
    lostReads = count;
  };
  /** The next approval is claimed, but its job appears only on a later read. */
  const submitSlowly = () => {
    slowSubmit = true;
  };
  const posts = (suffix: string) =>
    sent.filter((r) => r.method === "POST" && r.path.endsWith(suffix)).length;
  return {
    fetch,
    chains,
    sent,
    refuseNext,
    loseNextApproval,
    loseReads,
    approveLate,
    submitSlowly,
    posts,
  };
}
