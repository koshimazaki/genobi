/**
 * A mechanical template's Generate (docs/template-gallery.md): the person's
 * files swapped into the recipe and run in place, through the Camera's paid
 * path and no other. One quote (`POST /api/quotes`, as Scrolls and agents
 * quote), the person confirms the price, then one submission through the
 * Camera's own `generate` (`useJobs`, reached through the generation bridge)
 * with that quote's id and the idempotency key made when it was quoted. The
 * server reserves the run under that key before it calls the provider. The
 * key is recorded (in memory and this tab's sessionStorage, `pending-runs.ts`)
 * before the request leaves, and an uncertain answer is
 * reported, never retried.
 */
import type { Quote } from "../../shared/quote";
import { checkPicks, TEMPLATE_IMAGE } from "../../shared/templates/intake";
import {
  mechanicalInput,
  type MechanicalRecipe,
} from "../../shared/templates/mechanical";
import type { HouseTemplate } from "../../shared/templates/types";
import type { GenerateInput, Job } from "../../shared/types";
import { readReference } from "../image-files";
import { expectedHeaders } from "../settings-store";
import { addServedMediaToProjectAssets } from "../studio/project-assets";
import { studioStore } from "../studio/store";
import { request } from "../useJobs";
import { openTemplate, type TemplatePicks } from "./open-template";
import { pendingRuns, type PendingRun } from "./pending-runs";

/** A quoted run waiting for the person's confirmation. */
export interface MechanicalApproval {
  templateId: string;
  quote: Quote;
  input: GenerateInput;
  /** Made once, when quoted; the submission sends exactly this key. */
  idempotency: string;
}

/** A submission, recorded before its request leaves (`pending-runs.ts`). */
export type { PendingRun };
export { pendingRuns };

type Approval = { quoteId: string; idempotency: string };
export interface RunDeps {
  /** The page's own key, sent in a header only; never kept. */
  key: string;
  /** The Camera's submission (`useJobs().generate`). */
  generate: (input: GenerateInput, approval: Approval) => Promise<Job>;
  record: (run: PendingRun) => void;
  quote?: (input: GenerateInput, key: string) => Promise<Quote>;
  /** A reference's file as the data URL the Camera's tray makes. */
  readImage?: (file: File) => Promise<string>;
  fetchExample?: (url: string) => Promise<Blob>;
}

const MIME = Object.fromEntries(
  Object.entries(TEMPLATE_IMAGE).map(([type, ext]) => [ext, type]),
) as Record<string, string>;

/** The Camera's quote: the same route, headers and body as a submission. */
async function quoteRoute(input: GenerateInput, key: string) {
  const { quote } = await request<{ quote: Quote }>("/api/quotes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "x-byo-key": key } : {}),
      ...expectedHeaders(input),
    },
    body: JSON.stringify(input),
  });
  return quote;
}

async function exampleBlob(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The example image is unavailable.");
  return response.blob();
}

/**
 * The shot's references in the order it names them, each read as the Camera
 * reads a tray image (`readReference`: PNG, JPEG or WebP, 5 MB, 256 px a
 * side): the person's dropped file, or the template's example.
 */
export async function referenceUrls(
  template: HouseTemplate,
  chosen: TemplatePicks,
  readImage: (file: File) => Promise<string> = readReference,
  fetchExample: (url: string) => Promise<Blob> = exampleBlob,
) {
  checkPicks(template, chosen.picks);
  const [shot] = template.shots;
  const urls: string[] = [];
  for (const id of shot.references) {
    const ref = template.references.find((r) => r.id === id)!;
    const state = chosen.picks[id] ?? "example";
    let file: File;
    if (state === "yours") {
      const media = chosen.dropped[id]?.[0];
      if (!media)
        throw new Error(`${ref.label}: drop a file, or keep the example.`);
      file = new File([media.bytes], `${id}.${media.ext}`, {
        type: MIME[media.ext],
      });
    } else if (state === "example" && ref.example) {
      const blob = await fetchExample(ref.example);
      file = new File([blob], ref.example.split("/").pop()!, {
        type: blob.type || "image/png",
      });
    } else
      throw new Error(
        `${ref.label} is required; drop one or keep the example.`,
      );
    try {
      urls.push(await readImage(file));
    } catch (error) {
      throw new Error(`${ref.label}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }
  return urls;
}

/**
 * Generate: the request with the person's references, and one quote for it.
 * Nothing is submitted; the person confirms the price first.
 */
export async function quoteMechanical(
  template: HouseTemplate,
  chosen: TemplatePicks,
  recipe: MechanicalRecipe,
  deps: Pick<RunDeps, "key" | "quote" | "readImage" | "fetchExample">,
): Promise<MechanicalApproval> {
  const refs = await referenceUrls(
    template,
    chosen,
    deps.readImage,
    deps.fetchExample,
  );
  const input = mechanicalInput(template, recipe, refs);
  const quote = await (deps.quote ?? quoteRoute)(input, deps.key);
  return {
    templateId: template.id,
    quote,
    input,
    idempotency: crypto.randomUUID(),
  };
}

/** Said with any failed submission: it may have started. */
export const UNCERTAIN =
  "The run may have started. No automatic retry was made. Check Camera's generation history before generating again.";

/**
 * Confirm: exactly the quoted request, with the quote's id and its key,
 * submitted once. The key is recorded first, so an uncertain answer is
 * reported against it rather than lost; nothing is retried.
 */
export async function submitMechanical(
  approval: MechanicalApproval,
  deps: Pick<RunDeps, "generate" | "record">,
  now = Date.now(),
): Promise<Job> {
  if (Date.parse(approval.quote.expiresAt) <= now)
    throw new Error("The quote expired. Generate again for a new quote.");
  const pending: PendingRun = {
    templateId: approval.templateId,
    idempotency: approval.idempotency,
    quoteId: approval.quote.id,
    state: "submitting",
  };
  deps.record(pending);
  let job: Job;
  try {
    job = await deps.generate(approval.input, {
      quoteId: approval.quote.id,
      idempotency: approval.idempotency,
    });
  } catch (error) {
    deps.record({ ...pending, state: "uncertain" });
    throw new Error(`${(error as Error).message} ${UNCERTAIN}`, {
      cause: error,
    });
  }
  deps.record({ ...pending, state: "started", jobId: job.id });
  return job;
}

/**
 * Add to project assets: the finished clip, read through its owner-checked
 * route, into the open project through the one path every output takes.
 * With no project open, the template's project opens first; a generation
 * card has no project, so it asks for one to be open.
 */
export async function addResultToAssets(
  template: HouseTemplate,
  chosen: TemplatePicks,
  job: Job,
  deps = {
    open: openTemplate,
    add: addServedMediaToProjectAssets,
    store: studioStore,
  },
) {
  if (job.status !== "Ready" || !job.resultUrl || job.mediaAvailable === false)
    throw new Error("The result is not available to add.");
  if (!deps.store.getState().director.bundle) {
    if (template.generation)
      throw new Error(
        "Open a project in Director first. The result stays in Camera history.",
      );
    await deps.open(template.id, chosen);
  }
  return deps.add(
    job.resultUrl,
    `${template.id}-${job.id.slice(0, 8)}.mp4`,
    "production",
  );
}
