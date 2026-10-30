import { z } from "zod";
import type { Quote } from "../shared/quote";
import type { Take } from "../shared/take";
import type { Job } from "../shared/types";
import { StudioError, StudioNoAnswer } from "./api";
import { JOB_ID, jobSummary, type ToolDefinition } from "./definition";
import {
  generationBody,
  generationShape,
  idempotencyKeyField,
  quoteIdField,
} from "./inputs";

/**
 * Paid generation for agents: quote, then submit. The studio may submit
 * without a quote; an agent may not, so a price the person accepted always
 * stands between an agent and a charge. Neither tool ever retries.
 */

/** What the agent should do after each refusal the studio can give. */
const NEXT: Record<string, string> = {
  quote_missing:
    "Ask genobi_quote for a new quote and show the person the price again.",
  quote_expired:
    "Quotes last ten minutes. Ask genobi_quote for a new one and show the person the price again.",
  quote_used:
    "That quote already paid for a run: check genobi_jobs. Another run needs a new quote the person accepts.",
  quote_mismatch:
    "The inputs differ from the quoted ones. Submit exactly the quoted inputs, or quote these and ask the person again.",
  budget:
    "The studio's demo budget or session limit is used up. Tell the person; do not retry.",
  idempotency_other_session:
    "The run under that key was sent from an earlier session, probably before this MCP server restarted, so genobi_jobs cannot show it. Do not submit it again: ask the person to check the studio's history, and start a new run only with a new quote and key they accept.",
};

function refusal(error: unknown) {
  if (!(error instanceof StudioError)) return error;
  const next = error.code && NEXT[error.code];
  if (next) return new Error(`${error.message} ${next}`);
  if (error.status === 409 && !error.code)
    return new Error(
      `${error.message} That idempotencyKey already belongs to a run with other settings: check genobi_jobs, and use a new key only for a new run the person accepted.`,
    );
  return error;
}

function uncertain(quoteId: string, idempotencyKey: string, why: string) {
  return new StudioNoAnswer(
    [
      `Outcome uncertain: ${why} The run may or may not have been reserved and charged.`,
      "Do not submit again with a new idempotencyKey.",
      `Check genobi_jobs (or genobi_job) for it first. If it is not there, resubmit with the SAME idempotencyKey "${idempotencyKey}" and the same inputs: the studio replays that key instead of paying twice, and refuses it if the run was sent from a session this MCP server no longer holds. If quote ${quoteId} has expired by then, ask genobi_quote again and still reuse that key.`,
    ].join(" "),
  );
}

export const generationTools: ToolDefinition[] = [
  {
    name: "genobi_quote",
    title: "Genobi quote",
    description:
      "Price a generation without running it. Runs every check a submission would (validation, route, budget) and answers with a quoteId, the estimate in USD, the recipe and an expiry ten minutes out. Show the person the price; call genobi_submit only after they agree. Spends nothing.",
    inputSchema: generationShape,
    tags: ["agents", "mcp", "backend"],
    docs: [
      "docs/agent-approvals.md",
      "docs/director-agent-tools.md",
      "plugins/genobi/README.md",
    ],
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
    async run(api, args) {
      const { quote } = await api
        .post<{ quote: Quote }>("/api/quotes", generationBody(args))
        .catch((error) => Promise.reject(refusal(error)));
      return {
        quoteId: quote.id,
        estimateUsd: quote.estimateUsd,
        recipe: quote.recipe,
        expiresAt: quote.expiresAt,
        // A run its host bills by GPU time has no price here: say who bills it.
        ...(quote.billing
          ? {
              billing: quote.billing,
              next: `Genobi has no price for this run: it is ${quote.billing}. Ask the person to agree to that before calling genobi_submit with this quoteId, these same inputs and a new idempotencyKey. Do not submit without their agreement.`,
            }
          : {
              next: `Ask the person to agree to about $${quote.estimateUsd.toFixed(2)} before calling genobi_submit with this quoteId, these same inputs and a new idempotencyKey. Do not submit without their agreement.`,
            }),
      };
    },
  },
  {
    name: "genobi_submit",
    title: "Genobi submit",
    description:
      "Start a paid generation. This spends the person's money: call it only with a quoteId from genobi_quote whose price the person accepted, and exactly the quoted inputs. The idempotencyKey makes it safe to repeat: the same key and inputs replay the first run instead of paying again. It never retries; if the outcome is uncertain it says so, and you resubmit with the same key. Poll the job with genobi_job.",
    inputSchema: {
      quoteId: quoteIdField,
      idempotencyKey: idempotencyKeyField,
      ...generationShape,
    },
    paid: true,
    tags: ["agents", "mcp", "backend"],
    docs: [
      "docs/agent-approvals.md",
      "docs/architecture.md",
      "plugins/genobi/README.md",
    ],
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async run(api, args) {
      const quoteId = quoteIdField.parse(args.quoteId);
      const idempotencyKey = idempotencyKeyField.parse(args.idempotencyKey);
      let job: Job;
      try {
        // One request, never repeated here: a second attempt could pay twice
        // if the first was reserved and its answer lost.
        ({ job } = await api.post<{ job: Job }>(
          "/api/jobs",
          generationBody(args),
          { "Idempotency-Key": idempotencyKey, "Quote-Id": quoteId },
        ));
      } catch (error) {
        if (error instanceof StudioNoAnswer)
          throw uncertain(quoteId, idempotencyKey, error.message);
        if (error instanceof StudioError && error.status >= 500)
          throw uncertain(
            quoteId,
            idempotencyKey,
            `Genobi answered ${error.status}: ${error.message}`,
          );
        throw refusal(error);
      }
      return {
        ...jobSummary(job),
        quoteId,
        idempotencyKey,
        next:
          job.status === "Error"
            ? "The run failed; its error says whether anything was charged. Do not resubmit with a new idempotencyKey without the person's agreement."
            : `Poll genobi_job with id ${job.id} until it is Ready, then read its take with genobi_take.`,
      };
    },
  },
  {
    name: "genobi_take",
    title: "Genobi take",
    description:
      "Read a finished job's take: the recipe that ran, input hashes, output asset ids and the receipt (estimate and confirmed cost). Never submits or pays.",
    inputSchema: {
      id: z.string().regex(JOB_ID).describe("Job id from genobi_submit"),
    },
    tags: ["agents", "mcp", "backend"],
    docs: ["docs/architecture.md", "docs/hermes-runs.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api, args) {
      const id = String(args.id);
      try {
        const { take } = await api.get<{ take: Take }>(
          `/api/takes/${encodeURIComponent(id)}`,
        );
        return take;
      } catch (error) {
        if (error instanceof StudioError && error.code === "take_not_ready")
          throw new Error(
            `Job ${id} has no take yet: a take exists once the job is Ready and its output is saved. Check it with genobi_job; a failed or expired job never gets one.`,
            { cause: error },
          );
        if (error instanceof StudioError && error.code === "take_missing")
          throw new Error(
            `Job ${id} ran before takes were recorded, so it has no take. genobi_job still shows its result and cost.`,
            { cause: error },
          );
        throw error;
      }
    },
  },
];
