/**
 * The fixture behind scripts/check-review-step.mjs: one ready draft, and the
 * chain routes as `shared/chain.ts` describes them, held in memory. Every
 * request is answered here, so no job, chain or key leaves the page.
 */
import { randomUUID } from "node:crypto";

export function reviewFixture(library) {
  const at = new Date().toISOString();
  const run = (id, extra = {}) => ({
    ...library[0].setup,
    id,
    generator: "video",
    model: "flux-3",
    description: "Fixture draft",
    prompt: "Fixture draft",
    status: "Ready",
    duration: 5,
    resolution: "hd",
    aspectRatio: "16:9",
    draft: true,
    upscaleFactor: 2,
    upscaleCreativity: 0,
    resultUrl: library[0].url,
    resultContentType: "video/mp4",
    mediaAvailable: true,
    keyMode: "server",
    costEstimateUsd: 0.3,
    createdAt: at,
    updatedAt: at,
    ...extra,
  });
  const clip = (id) => ({
    id,
    label: "Fixture draft",
    url: library[0].url,
    width: 1280,
    height: 720,
    duration: 5,
    origin: "generated",
    mediaType: "video",
  });

  /** The chain routes' contract (`shared/chain.ts`), held in this process. */
  function fixture() {
    const state = {
      chains: new Map(),
      jobs: [run("fixture-draft")],
      approvals: 0,
      refuseNext: false,
      /** History requests to fail next, and every job read by its own id. */
      failHistory: 0,
      historyReads: 0,
      jobReads: [],
    };
    const quote = (stage) => ({
      id: randomUUID(),
      estimateUsd: stage.input.generator === "upscale" ? 0.45 : 0.3,
      recipe: {
        id:
          stage.input.generator === "upscale"
            ? "flux-video-upscale"
            : "flux-3-video",
        version: 1,
        route: "bfl",
      },
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    const pause = (chain, index) => {
      chain.status = "paused";
      chain.pausedAt = index;
      chain.stages[index].status = "paused";
      chain.quote = quote(chain.stages[index]);
    };
    const advance = (chain) => {
      const index = chain.stages.findIndex((s) => s.status === "running");
      if (index < 0) return;
      chain.stages[index].status = "ready";
      if (index + 1 < chain.stages.length) pause(chain, index + 1);
      else chain.status = "complete";
    };
    const create = (body) => {
      const stages = body.stages.map(({ input }) => ({
        status: "waiting",
        input,
      }));
      if (body.target)
        stages.push({
          status: "waiting",
          consumes: 0,
          input: {
            ...stages[0].input,
            generator: "upscale",
            upscaleFactor: 1.5,
          },
        });
      const chain = {
        id: randomUUID(),
        createdAt: at,
        updatedAt: at,
        target: body.target,
        stages,
      };
      pause(chain, 0);
      state.chains.set(chain.id, chain);
      return chain;
    };
    async function handle(route) {
      const request = route.request();
      const { pathname } = new URL(request.url());
      const method = request.method();
      const json = (body, status = 200) =>
        route.fulfill({ status, json: body });
      if (pathname === "/api/health") return json({ hasServerKey: true });
      if (pathname === "/api/history") state.historyReads++;
      if (pathname === "/api/history" && state.failHistory > 0) {
        state.failHistory--;
        return json({ error: "History is unavailable." }, 503);
      }
      if (pathname === "/api/history")
        return json({
          jobs: state.jobs,
          sources: [...library, ...state.jobs.map((j) => clip(j.id))],
        });
      if (method === "GET" && pathname.startsWith("/api/jobs/")) {
        const id = pathname.split("/").at(-1);
        state.jobReads.push(id);
        return json({
          job: state.jobs.find((j) => j.id === id) ?? state.jobs[0],
        });
      }
      if (pathname === "/api/chains")
        return method === "POST"
          ? json({ chain: create(request.postDataJSON()) }, 201)
          : json({ chains: [...state.chains.values()] });
      const match = /^\/api\/chains\/([^/]+)(?:\/(approve|cancel))?$/.exec(
        pathname,
      );
      const chain = match && state.chains.get(match[1]);
      if (!chain)
        return method === "GET"
          ? json({ error: "Not found" }, 404)
          : route.abort();
      if (method === "GET") {
        advance(chain);
        return json({ chain });
      }
      if (match[2] === "approve") {
        state.approvals++;
        if (
          state.refuseNext ||
          request.headers()["quote-id"] !== chain.quote?.id
        ) {
          state.refuseNext = false;
          return json(
            {
              error:
                "This quote is not the one the chain is waiting on. Read the chain for its quote.",
              code: "quote_mismatch",
            },
            409,
          );
        }
        const index = chain.pausedAt;
        const jobId = `stage-${chain.id.slice(0, 8)}-${index}`;
        // A stage's take has its own clip, so the check can tell which is shown.
        state.jobs.unshift(
          run(jobId, {
            // An upscale stage is an upscale job, as the server records it.
            generator: chain.stages[index].input.generator,
            description: `Stage ${index + 1}`,
            resultUrl: library[1].url,
          }),
        );
        Object.assign(chain.stages[index], { status: "running", jobId });
        Object.assign(chain, {
          status: "running",
          pausedAt: undefined,
          quote: undefined,
        });
        return json({ chain }, 202);
      }
      if (chain.status !== "paused")
        return json(
          { error: "A stage is running.", code: "chain_not_paused" },
          409,
        );
      chain.status = "cancelled";
      chain.quote = undefined;
      for (const stage of chain.stages)
        if (stage.status !== "ready") stage.status = "cancelled";
      return json({ chain });
    }
    return { state, handle, create };
  }
  return { run, fixture };
}
