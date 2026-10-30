import { z } from "zod";
import type { PartSetView } from "../shared/upscale-parts";
import {
  UPSCALE_MAX_SECONDS,
  UPSCALE_SPLIT_MAX_SECONDS,
} from "../shared/upscale-parts";
import { jobSummary, type ToolDefinition } from "./definition";
import { generationBody, generationShape, quoteIdField } from "./inputs";

// Split upscales for agents: thin clients of the local server's
// /api/upscale-parts routes (server/upscale-parts.ts). The plan and every read
// are free; the two confirm tools spend, each only with a quote the person
// accepted. The hosted studio has no ffmpeg and no such routes.

const DOCS = ["docs/upscaling.md", "docs/seedvr2-upscale.md"];
const TAGS = ["agents", "mcp", "backend"];
const setId = z
  .string()
  .uuid()
  .describe("The setId genobi_upscale_parts_plan answered with");
const partSeconds = z
  .number()
  .min(0)
  .max(UPSCALE_SPLIT_MAX_SECONDS)
  .optional()
  .describe(
    `SeedVR2 on a local ComfyUI only: the length each part is cut to, 1 to ${UPSCALE_SPLIT_MAX_SECONDS} seconds, or 0 for the whole clip in one part. VRAM is the limit: start at 19 (the default) and raise it if it fits. FLUX Video Upscale and Comfy Cloud take 19 s parts and refuse any other value.`,
  );
const part = z
  .number()
  .int()
  .min(1)
  .max(7)
  .describe("The part's number, from 1, as the set lists it");
const path = (id: unknown, rest = "") =>
  `/api/upscale-parts/${encodeURIComponent(String(id))}${rest}` as const;
const WRITE = {
  readOnlyHint: false,
  idempotentHint: false,
  destructiveHint: false,
} as const;

/** The set as an agent needs it: plan, price, each part's run, the result. */
function summary(set: PartSetView) {
  return {
    setId: set.id,
    status: set.status,
    quoteId: set.quoteId,
    partSeconds: set.partSeconds,
    estimateUsd: set.estimateUsd,
    expiresAt: set.expiresAt,
    confirmed: set.confirmed,
    fps: set.plan.fps,
    frames: set.plan.frames,
    parts: set.parts.map((p) => ({
      part: p.index + 1,
      frames: `${p.startFrame}–${p.startFrame + p.frames - 1}`,
      seconds: `${p.start.toFixed(3)}–${(p.start + p.duration).toFixed(3)}`,
      ...(p.job ? { job: jobSummary(p.job) } : {}),
      ...(p.uncertain ? { uncertain: true } : {}),
      ...(p.refused ? { refused: p.refused } : {}),
      ...(p.retryQuote
        ? {
            retryQuoteId: p.retryQuote.id,
            retryEstimateUsd: p.retryQuote.estimateUsd,
          }
        : {}),
    })),
    ...(set.joined
      ? {
          joined: {
            sourceId: set.joined.id,
            label: set.joined.label,
            url: set.joined.url,
            width: set.joined.width,
            height: set.joined.height,
            duration: set.joined.duration,
            frames: set.plan.frames,
            sound: "the source clip's own",
          },
        }
      : {}),
    ...(set.joinError ? { joinError: set.joinError } : {}),
  };
}

const next = (set: PartSetView) =>
  set.status === "declined"
    ? "The person declined this set. Nothing of it runs; plan again only if they ask."
    : set.confirmed
      ? set.status === "joined"
        ? "Joined. Report joined (size, frames, sound) and each part's status to the person; genobi_take_to_project with joined.sourceId places it in a linked Director project."
        : set.status === "failed"
          ? "A part failed. Tell the person which; never resend it on your own. An uncertain part may already have been charged: say so. genobi_upscale_parts_retry quotes that part alone; only the person's agreement to that quote lets it run."
          : "Running. Read the set again with genobi_upscale_parts in a minute; it joins the parts once every one is ready."
      : `The combined price is about $${set.estimateUsd.toFixed(2)} for ${set.parts.length} part(s). In a studio agent session this plan is already one step waiting for the person's approval: tell them, then read the set until it runs. Otherwise ask the person, and only after they agree call genobi_upscale_parts_confirm with this setId and quoteId.`;

export const upscalePartsTools: ToolDefinition[] = [
  {
    name: "genobi_upscale_parts_plan",
    title: "Genobi split upscale plan",
    description: `Plan and price upscaling a video longer than one upscale takes (${UPSCALE_MAX_SECONDS} s), with the same inputs genobi_quote takes for generator "upscale" (sourceId, model "flux-3" or "seedvr2-upscale", upscaleFactor, optional upscaleCreativity and upscalePrompt) and, for SeedVR2 on a local ComfyUI, partSeconds. The clip is cut on frame boundaries into full 19 s parts plus the remainder (local ffmpeg, free; each cut is a source in this session), and every part is quoted: the answer is the plan, the combined price (the sum) and one quoteId covering the set. The same request again reopens its set instead of cutting twice. In a studio agent session the set becomes ONE step the person approves. Spends nothing.`,
    inputSchema: { ...generationShape, partSeconds },
    tags: TAGS,
    docs: DOCS,
    annotations: WRITE,
    async run(api, args) {
      const { set } = await api.post<{ set: PartSetView }>(
        "/api/upscale-parts",
        {
          ...generationBody(args),
          ...(args.partSeconds === undefined
            ? {}
            : { partSeconds: args.partSeconds }),
        },
      );
      return { ...summary(set), next: next(set) };
    },
  },
  {
    name: "genobi_upscale_parts",
    title: "Genobi split upscale",
    description:
      "Read a split upscale: each part's run and, once every part is ready, the joined clip (the parts in order at the source's frame count, with the source's own sound). Before confirmation a lapsed quote is replaced by a new one under a new quoteId. rejoin: true tries a failed join again. Never submits or pays.",
    inputSchema: {
      setId,
      rejoin: z.boolean().optional().describe("Try a failed join again"),
    },
    tags: TAGS,
    docs: DOCS,
    // Reading can poll a part and join the finished parts: safe to repeat.
    annotations: { ...WRITE, idempotentHint: true },
    async run(api, args) {
      const { set } = args.rejoin
        ? await api.post<{ set: PartSetView }>(path(args.setId, "/join"), {})
        : await api.get<{ set: PartSetView }>(path(args.setId));
      return { ...summary(set), next: next(set) };
    },
  },
  {
    name: "genobi_upscale_parts_confirm",
    title: "Genobi split upscale confirm",
    description:
      "Start every part of a split upscale. This spends the person's money: call it only with the setId and quoteId from genobi_upscale_parts_plan (or a later read) whose combined price the person accepted. Each part is its own reserved run, sent once; repeating the call never sends a part again. Read the set with genobi_upscale_parts.",
    inputSchema: { setId, quoteId: quoteIdField },
    tags: TAGS,
    docs: DOCS,
    paid: true,
    // A repeat replays what the first sent; it never sends a part twice.
    annotations: { ...WRITE, idempotentHint: true },
    async run(api, args) {
      const { set } = await api.post<{ set: PartSetView }>(
        path(args.setId, "/confirm"),
        {},
        { "Quote-Id": quoteIdField.parse(args.quoteId) },
      );
      return { ...summary(set), next: next(set) };
    },
  },
  {
    name: "genobi_upscale_parts_retry",
    title: "Genobi split upscale retry quote",
    description:
      "Quote one failed or refused part of a confirmed split upscale again; the finished parts are kept. Answers with the part's retryQuoteId and price. Spends nothing.",
    inputSchema: { setId, part },
    tags: TAGS,
    docs: DOCS,
    annotations: WRITE,
    async run(api, args) {
      const { set } = await api.post<{ set: PartSetView }>(
        path(args.setId, `/parts/${Number(args.part) - 1}/retry`),
        {},
      );
      return summary(set);
    },
  },
  {
    name: "genobi_upscale_parts_retry_confirm",
    title: "Genobi split upscale retry confirm",
    description:
      "Send one failed part again. This spends the person's money: call it only with that part's retryQuoteId from genobi_upscale_parts_retry whose price the person accepted. Never call it on your own after a failure, and say first when the part was uncertain (it may already have been charged).",
    inputSchema: { setId, part, quoteId: quoteIdField },
    tags: TAGS,
    docs: DOCS,
    paid: true,
    // A repeat replays what the first sent; it never sends a part twice.
    annotations: { ...WRITE, idempotentHint: true },
    async run(api, args) {
      const { set } = await api.post<{ set: PartSetView }>(
        path(args.setId, `/parts/${Number(args.part) - 1}/confirm`),
        {},
        { "Quote-Id": quoteIdField.parse(args.quoteId) },
      );
      return { ...summary(set), next: next(set) };
    },
  },
];
