import { deploymentPlan } from "./deployments";
import {
  requireExpectedPlan,
  type Expectation,
} from "../shared/comfy/expectation";
import { isH3, takesVideoReferences } from "../shared/h3";
import { isSwap } from "../shared/openjutsu";
import { isSeedvr2, requireSeedvr2Fit } from "../shared/comfy/seedvr2";
import { isImage } from "../shared/image";
import { isMusic } from "../shared/music";
import { isComfyKey, requireRoute, type Provider } from "../shared/provider";
import {
  estimateRunUsd,
  newQuote,
  publicQuote,
  type Quote,
  type QuoteRecord,
} from "../shared/quote";
import { sha256Hex, startTake } from "../shared/take";
import { isVideoSource, type GenerateInput } from "../shared/types";
import { AppError } from "../server/errors";
import {
  defaultProviders,
  providerFor,
  type Providers,
} from "../server/providers";
import { inspectObject, resolveSource } from "./storage";

/** Persisted replay state holds reference fingerprints, never the bytes. */
export async function hashReferences(input: GenerateInput) {
  if (!isImage(input.generator) && !takesVideoReferences(input.model))
    return input;
  const refs = await Promise.all((input.imageReferences ?? []).map(sha256Hex));
  return { ...input, imageReferences: refs };
}

/**
 * The checks and price a submission and a quote share, so a quote can never
 * promise a run the submission would refuse or price differently.
 */
export async function price(
  env: Env,
  input: GenerateInput,
  session: string,
  key: string,
  provider: Provider,
  expected?: Expectation,
) {
  const { plan, values: deploymentValues } = await deploymentPlan(
    env,
    session,
    input,
  );
  requireExpectedPlan(plan, expected);
  // The swap needs a custom node pack only its own Comfy deployment holds;
  // the hosted studio does not run it.
  if (isSwap(input.model))
    throw new AppError(
      400,
      "The character swap runs from the local studio only, on its own Comfy deployment.",
      "unsupported_model",
    );
  // The hosted copy step stores MP4s and stills only; until it measures and
  // serves audio, a song is refused here, before any quote or reservation.
  if (isMusic(input.generator))
    throw new AppError(
      501,
      "Music runs in the local studio for now; the hosted studio cannot save a song yet. Nothing was sent or charged.",
      "audio_local_only",
    );
  if (
    isImage(input.generator) &&
    input.model === "flux-3" &&
    input.imageProvider &&
    input.imageProvider !== "auto" &&
    (isComfyKey(key) ? "comfy" : "bfl") !== input.imageProvider
  )
    throw new AppError(400, "This run selected a different provider from the connected API key. Connect the matching key.", "invalid_key");
  requireRoute(input.generator, input.model ?? "flux-3", key);
  const source =
    input.generator === "upscale" || isH3(input.model)
      ? await resolveSource(env, input.sourceId!, session)
      : undefined;
  if (source && !isVideoSource(source.source))
    throw new AppError(400, "Choose a video to upscale.");
  // A library clip was measured when the catalogue loaded; a session clip is
  // measured from its own stored bytes. Neither figure comes from the browser.
  const metadata = source
    ? source.kind === "library"
      ? source.source
      : (await inspectObject(env, source.key, true)).metadata
    : undefined;
  if (metadata && isSeedvr2(input.model))
    requireSeedvr2Fit(metadata, input.upscaleFactor);
  const estimate = plan.deployment ? 0 : estimateRunUsd(input, metadata);
  const balance = plan.deployment
    ? { usdCents: null }
    : await provider.balance(key);
  if (balance.usdCents !== null && balance.usdCents / 100 < estimate)
    throw new AppError(402, "Your balance is below this estimate.");
  const sha256 = source?.kind === "session" ? source.sha256 : undefined;
  return {
    source,
    estimate,
    take: await startTake(input, isComfyKey(key), sha256, plan),
    deploymentValues,
  };
}

export async function quote(
  env: Env,
  input: GenerateInput,
  session: string,
  key: string,
  providers: Providers = defaultProviders(),
  expected?: Expectation,
) {
  input = await hashReferences(input);
  const { estimate, take } = await price(
    env,
    input,
    session,
    key,
    providerFor(key, providers),
    expected,
  );
  const record = newQuote(take, estimate);
  await saveQuote(env, record, session);
  return publicQuote(record);
}

interface QuoteRow {
  data: string;
  settings: string;
  expires: number;
  job: string | null;
}

export async function saveQuote(env: Env, quote: QuoteRecord, session: string) {
  await env.DB.prepare(
    "INSERT INTO quotes (id,session,settings,data,expires) VALUES (?,?,?,?,?)",
  )
    .bind(
      quote.id,
      session,
      quote.settings,
      JSON.stringify(publicQuote(quote)),
      Date.parse(quote.expiresAt),
    )
    .run();
}

/** Within the session only, so another visitor's id reads as missing. */
export async function findQuote(
  env: Env,
  id: string,
  session: string,
): Promise<QuoteRecord | undefined> {
  const row = await env.DB.prepare(
    "SELECT data, settings, expires, job FROM quotes WHERE id=? AND session=?",
  )
    .bind(id, session)
    .first<QuoteRow>();
  if (!row) return undefined;
  return {
    ...(JSON.parse(row.data) as Quote),
    // The columns the spending transaction checks are the authority.
    expiresAt: new Date(row.expires).toISOString(),
    settings: row.settings,
    ...(row.job ? { jobId: row.job } : {}),
  };
}

/**
 * Spends the quote and reserves the run in one D1 transaction. The quote is
 * claimed only while unspent, unexpired, for these settings, and while no run
 * holds this request id; the run is inserted only if this job claimed it. A
 * concurrent replay therefore finds the first run, and a second run can never
 * spend the same quote.
 */
export async function spendQuoteAndReserve(
  env: Env,
  quote: QuoteRecord,
  session: string,
  idempotency: string,
  row: {
    id: string;
    input: string;
    data: string;
    take: string;
    createdAt: number;
  },
) {
  const [, reservation] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE quotes SET job=? WHERE id=? AND session=? AND job IS NULL
      AND expires>? AND settings=?
      AND NOT EXISTS (SELECT 1 FROM jobs WHERE session=? AND idempotency=?)`,
    ).bind(
      row.id,
      quote.id,
      session,
      row.createdAt,
      quote.settings,
      session,
      idempotency,
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO jobs (id,session,idempotency,input,data,take,created_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM quotes WHERE id=? AND job=?)`,
    ).bind(
      row.id,
      session,
      idempotency,
      row.input,
      row.data,
      row.take,
      row.createdAt,
      quote.id,
      row.id,
    ),
  ]);
  return reservation;
}
