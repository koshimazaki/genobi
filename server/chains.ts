// Chained jobs on the local adapter: the chain record in the JSON store, its
// stages as ordinary jobs found by key. See shared/chain.ts for the contract.
import express, { type Request } from "express";
import { expecting } from "./settings-expectation";
import { randomUUID } from "node:crypto";
import {
  approvalStage,
  approvedWith,
  CHAIN_ID,
  chainStageKey,
  chainStatus,
  chainView,
  stageInput,
  stageStatuses,
  type ChainView,
} from "../shared/chain";
import type { RateBucket } from "../shared/limits";
import { publicQuote } from "../shared/quote";
import { AppError, requireKey } from "./errors";
import type { JobService } from "./jobs";
import type { GenerateInput } from "../shared/types";
import type { StoredChain } from "./store";
import { validateChain } from "./validate-chain";
import { validateQuoteId } from "./validation";

/** A chain, and why its pause has no quote yet when it has none. */
export interface ChainReply {
  chain: ChainView;
  needsKey?: true;
  pauseError?: { error: string; code: string };
}

/** What a chain needs from the job service; tests stand in for it. */
export type ChainJobs = Pick<
  JobService,
  "store" | "hasServerKey" | "quote" | "submit"
> &
  Partial<Pick<JobService, "settings">>;
/** Whether a stage would run with no key: planned for the local ComfyUI. */
export type Keyless = (input: GenerateInput, sessionId: string) => boolean;

export class ChainService {
  constructor(
    private jobs: ChainJobs,
    private keyless: Keyless = () => false,
  ) {}
  private get store() {
    return this.jobs.store;
  }

  private owned(id: string, sessionId: string): StoredChain {
    const chain = CHAIN_ID.test(id)
      ? this.store.data.chains.find(
          (item) => item.id === id && item.sessionId === sessionId,
        )
      : undefined;
    if (!chain) throw new AppError(404, "Chain not found.");
    return chain;
  }

  /** Each stage's job, by its key, within the owner's session. */
  private stageJobs(chain: StoredChain) {
    return chain.stages.map((_, index) => {
      const key = chainStageKey(chain.id, index);
      return this.store.data.jobs.find(
        (job) =>
          job.sessionId === chain.sessionId && job.idempotencyKey === key,
      );
    });
  }

  private liveQuote(chain: StoredChain, id: string | undefined) {
    const quote = id
      ? this.store.data.quotes.find(
          (item) => item.id === id && item.sessionId === chain.sessionId,
        )
      : undefined;
    // A quote for another run location or template cannot be spent, so the
    // next read quotes the stage again rather than waiting out the expiry.
    return quote &&
      !quote.jobId &&
      Date.parse(quote.expiresAt) > Date.now() &&
      (this.jobs.settings?.fits(chain.sessionId, quote.recipe) ?? true)
      ? quote
      : undefined;
  }

  private view(chain: StoredChain): ChainView {
    const jobs = this.stageJobs(chain);
    const at = approvalStage(stageStatuses(chain, jobs));
    const quote =
      at < 0 ? undefined : this.liveQuote(chain, chain.stages[at].quoteId);
    return chainView(chain, jobs, quote && publicQuote(quote));
  }

  private touch(chain: StoredChain) {
    chain.updatedAt = new Date().toISOString();
    return this.store.save();
  }

  async create(body: unknown, sessionId: string, byoKey?: string) {
    const { stages, target } = validateChain(body);
    // Quoted before anything is stored: a stage 1 the submission would refuse
    // (route, budget, source) refuses the chain.
    const quote = await this.jobs.quote(stages[0].input, sessionId, byoKey);
    const now = new Date().toISOString();
    const chain: StoredChain = {
      id: randomUUID(),
      sessionId,
      ...(target ? { target } : {}),
      stages: stages.map((stage, index) =>
        index === 0 ? { ...stage, quoteId: quote.id } : stage,
      ),
      createdAt: now,
      updatedAt: now,
    };
    this.store.data.chains.push(chain);
    await this.store.save();
    return { chain: this.view(chain) } satisfies ChainReply;
  }

  /** The newest fifty, with stage statuses; read one for its pause's quote. */
  list(sessionId: string) {
    return {
      chains: this.store.data.chains
        .filter((chain) => chain.sessionId === sessionId)
        .slice(-50)
        .reverse()
        .map((chain) => chainView(chain, this.stageJobs(chain))),
    };
  }

  /**
   * Reads the chain and, when it is paused with no live quote (its stage just
   * became reachable, or the quote expired or was spent elsewhere), quotes the
   * stage with the input it will now read. Quoting is free; nothing is sent.
   */
  async read(id: string, sessionId: string, byoKey?: string) {
    const chain = this.owned(id, sessionId);
    const jobs = this.stageJobs(chain);
    const statuses = stageStatuses(chain, jobs);
    const at = statuses.indexOf("paused");
    if (
      chainStatus(chain, statuses) !== "paused" ||
      at < 0 ||
      this.liveQuote(chain, chain.stages[at].quoteId)
    )
      return { chain: this.view(chain) } satisfies ChainReply;
    const input = stageInput(chain, at, jobs);
    // A stage planned for the local ComfyUI needs no key; any other does.
    if (!byoKey && !this.jobs.hasServerKey && !this.keyless(input, sessionId))
      return { chain: this.view(chain), needsKey: true } satisfies ChainReply;
    let quoteId: string;
    try {
      quoteId = (await this.jobs.quote(input, sessionId, byoKey)).id;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      return {
        chain: this.view(chain),
        pauseError: { error: error.message, code: error.code },
      } satisfies ChainReply;
    }
    // An approval or a cancel may have landed while the stage was priced.
    const stage = chain.stages[at];
    if (
      stageStatuses(chain, this.stageJobs(chain))[at] === "paused" &&
      !this.liveQuote(chain, stage.quoteId)
    ) {
      stage.quoteId = quoteId;
      // A lapsed approval goes with the quote it was for.
      delete stage.approval;
      await this.touch(chain);
    }
    return { chain: this.view(chain) } satisfies ChainReply;
  }

  /**
   * Spends the pause's quote on its stage. The approval is stored as this
   * request's own claim before the submission, and the stage's job runs under
   * its own key. An approval that finds a claim standing submits nothing, and
   * a failed one releases only its own claim, so a cancel can never land
   * between another approval's claim and its run.
   */
  async approve(
    id: string,
    sessionId: string,
    quoteId: string,
    byoKey?: string,
  ) {
    const chain = this.owned(id, sessionId);
    if (chain.cancelledAt)
      throw new AppError(409, "This chain was cancelled.", "chain_cancelled");
    const jobs = this.stageJobs(chain);
    const statuses = stageStatuses(chain, jobs);
    const at = approvalStage(statuses);
    if (at < 0) {
      if (approvedWith(chain, quoteId))
        return { chain: this.view(chain) } satisfies ChainReply;
      throw new AppError(
        409,
        "This chain is not waiting for an approval.",
        "chain_not_paused",
      );
    }
    const stage = chain.stages[at];
    if (statuses[at] === "submitting") {
      // Another request holds this approval; its run is the answer.
      if (stage.approval!.quoteId === quoteId)
        return { chain: this.view(chain) } satisfies ChainReply;
      throw new AppError(
        409,
        "This stage was approved with another quote.",
        "chain_approved",
      );
    }
    if (stage.quoteId !== quoteId)
      throw new AppError(
        409,
        "This quote is not the one the chain is waiting on. Read the chain for its quote.",
        "quote_mismatch",
      );
    const claim = {
      quoteId,
      claimId: randomUUID(),
      at: new Date().toISOString(),
    };
    stage.approval = claim;
    await this.touch(chain);
    // Checked again once the claim is stored, before anything is sent.
    if (chain.cancelledAt)
      throw new AppError(409, "This chain was cancelled.", "chain_cancelled");
    if (stage.approval?.claimId !== claim.claimId)
      throw new AppError(
        409,
        "This stage was approved by another request.",
        "chain_approved",
      );
    try {
      await this.jobs.submit(
        stageInput(chain, at, jobs),
        sessionId,
        chainStageKey(chain.id, at),
        byoKey,
        quoteId,
      );
    } catch (error) {
      // Refused before any reservation (expired quote, key, budget): nothing
      // was sent, so this approval's own claim goes and the stage is paused.
      if (
        stage.approval?.claimId === claim.claimId &&
        !this.stageJobs(chain)[at]
      ) {
        delete stage.approval;
        await this.touch(chain);
      }
      throw error;
    }
    return { chain: this.view(chain) } satisfies ChainReply;
  }

  async cancel(id: string, sessionId: string) {
    const chain = this.owned(id, sessionId);
    if (!chain.cancelledAt) {
      const status = chainStatus(
        chain,
        stageStatuses(chain, this.stageJobs(chain)),
      );
      if (status !== "paused")
        throw new AppError(
          409,
          status === "running"
            ? "A stage is running. A chain can be cancelled only at a pause."
            : "This chain has already finished.",
          "chain_not_paused",
        );
      chain.cancelledAt = new Date().toISOString();
      await this.touch(chain);
    }
    return { chain: this.view(chain) } satisfies ChainReply;
  }
}

/** The chain routes, mounted at `/api/chains` after the session middleware. */
export function chainRouter(
  jobs: JobService,
  limit: (bucket: RateBucket, id: string) => void,
  keyless?: Keyless,
) {
  const chains = new ChainService(jobs, keyless);
  const router = express.Router();
  const session = (response: express.Response) =>
    response.locals.sessionId as string;
  const byoKey = (request: Request) =>
    request.headers["x-byo-key"] === undefined
      ? undefined
      : requireKey(request.headers["x-byo-key"]);
  router.get("/", (_request, response) => {
    limit("history", session(response));
    response.json(chains.list(session(response)));
  });
  // Counted with the paid writes in the session middleware, as every POST is.
  router.post(
    "/",
    express.json({ limit: "64kb" }),
    async (request, response) => {
      response
        .status(201)
        .json(
          await expecting(response.locals, () =>
            chains.create(request.body, session(response), byoKey(request)),
          ),
        );
    },
  );
  router.get("/:id", async (request, response) => {
    // A read can price the next stage, so it counts like a poll.
    limit("poll", session(response));
    response.json(
      await chains.read(request.params.id, session(response), byoKey(request)),
    );
  });
  router.post("/:id/approve", async (request, response) => {
    const quoteId = validateQuoteId(request.headers["quote-id"]);
    if (!quoteId)
      throw new AppError(
        400,
        "Approve with the quote the chain is waiting on, as Quote-Id.",
        "quote_missing",
      );
    response
      .status(202)
      .json(
        await expecting(response.locals, () =>
          chains.approve(
            request.params.id,
            session(response),
            quoteId,
            byoKey(request),
          ),
        ),
      );
  });
  router.post("/:id/cancel", async (request, response) => {
    response.json(await chains.cancel(request.params.id, session(response)));
  });
  return router;
}
