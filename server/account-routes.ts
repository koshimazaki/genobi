// The studio's connection, account and budget reads: whether the server
// holds a key (and which key changes the page has seen), the balance of the
// key a run would spend, and who pays an agent's recipe. Reads only.
import express from "express";
import { AppError, requireKey } from "./errors";
import { KEY_KINDS, type ServerKeys } from "./keys";
import { providerFor, type Providers } from "./providers";
import { BUDGET_USD, SESSION_LIMIT, type JobService } from "./jobs";
import type { BudgetReport } from "../shared/budget";
import { keySlots, keysRevision } from "../shared/keys";
import type { RateBucket } from "../shared/limits";

/** Each held server slot's balance, or the reason it could not be read. */
async function slotBalances(keys: ServerKeys, providers: Providers) {
  const held = KEY_KINDS.filter((kind) => keys.key(kind));
  return Promise.all(
    held.map(async (kind) => {
      try {
        const key = requireKey(keys.key(kind));
        const balance = await providerFor(key, providers).balance(key);
        return {
          provider: kind,
          credits: balance.usdCents,
          checkedAt: balance.checkedAt,
        };
      } catch (error) {
        // Provider errors are already written for the page; anything else
        // is not repeated, as the route's own error handler would not.
        return {
          provider: kind,
          error:
            error instanceof AppError
              ? error.message
              : "Could not check the balance. Try again.",
        };
      }
    }),
  );
}

export function accountRouter(
  service: JobService,
  keys: ServerKeys,
  providers: Providers,
  limit: (bucket: RateBucket, id: string) => void,
) {
  const router = express.Router();
  router.get("/health", (_request, response) =>
    response.json({
      ok: true,
      hasServerKey: service.hasServerKey,
      // Local only: which key changes the page has seen (`shared/keys.ts`).
      keysRevision: keysRevision(keys.status()),
      // Which slots are held, never the keys: the header shows a balance for
      // each, and the composer names the one a run spends (`chooseKeyKind`).
      keySlots: keySlots(keys.status()),
      budgetUsd: BUDGET_USD,
      sessionLimit: SESSION_LIMIT,
    }),
  );
  router.get("/credits", async (request, response) => {
    limit("credits", response.locals.sessionId);
    // A named slot reads that slot only, so a Comfy readout never shows the
    // BFL account; unnamed, the server's Comfy key, else its BFL key.
    const provider = request.query.provider;
    // Both server accounts in one read, so a pair of readouts spends one
    // `credits` allowance, not two. Each slot answers or fails on its own;
    // a visit's key still reads only that key, below.
    if (provider === "all" && !request.headers["x-byo-key"]) {
      response.json({ balances: await slotBalances(keys, providers) });
      return;
    }
    const key = requireKey(
      request.headers["x-byo-key"] ??
        (provider === "bfl" || provider === "comfy"
          ? keys.key(provider)
          : (keys.key("comfy") ?? keys.key("bfl"))),
    );
    const balance = await providerFor(key, providers).balance(key);
    response.json({
      credits: balance.usdCents,
      checkedAt: balance.checkedAt,
      provider: providerFor(key, providers).id,
    });
  });
  // Local only, like the media tools: who pays, and what the demo budget
  // leaves this session today, so an agent can refuse a recipe before its
  // first quote (`shared/budget.ts`).
  router.get("/budget", (_request, response) => {
    limit("history", response.locals.sessionId);
    const payer = keys.payer();
    const report: BudgetReport = {
      hasServerKey: service.hasServerKey,
      payer,
      uncapped: payer === "owner",
      ...service.budget(response.locals.sessionId),
    };
    response.json(report);
  });
  return router;
}
