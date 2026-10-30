// The Openjutsu character swap from a terminal, against the local studio:
// cut the part with ffmpeg, take its first frame, make the first frame with a
// FLUX 3 Image Klein box edit, then run the swap on its Comfy deployment
// (GENOBI_DEPLOYMENT_URL on the server). See
// docs/openjutsu-swap.md for the keys and settings it needs.
//
//   npm run swap -- --clip talk.mp4 --start 3 --seconds 5 --size 480 \
//     --character hero.png --box person:80,300,1000,720:0 --ref hero.png
//
// Without --confirm it only cuts, uploads and quotes: quotes are free and
// nothing is generated. With --confirm it submits each paid step once, under
// an idempotency key it prints first, and never sends one again on its own.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import {
  anchorItems,
  anchorRequest,
  type AnchorBox,
} from "../shared/openjutsu-anchor";
import { randomSwapSeed } from "../shared/openjutsu";

const run = promisify(execFile);
interface StudioJob {
  id: string;
  status: string;
  error?: string;
}
interface StudioAnswer {
  quote: {
    id: string;
    estimateUsd: number;
    billing?: string;
    recipe: { id: string; route: string; location?: string };
  };
  job: StudioJob;
}
const { values: args } = parseArgs({
  options: {
    clip: { type: "string" },
    start: { type: "string", default: "0" },
    seconds: { type: "string", default: "5" },
    size: { type: "string", default: "480" },
    seed: { type: "string" },
    direction: { type: "string", default: "" },
    character: { type: "string" },
    ref: { type: "string", multiple: true, default: [] },
    box: { type: "string", multiple: true, default: [] },
    "no-anchor": { type: "boolean", default: false },
    confirm: { type: "boolean", default: false },
    out: { type: "string" },
    studio: { type: "string", default: "http://127.0.0.1:4317" },
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
const studio = new URL(args.studio!);
if (!["127.0.0.1", "localhost"].includes(studio.hostname))
  fail("--studio must be the local studio, such as http://127.0.0.1:4317.");
if (!args.clip) fail("Name the clip with --clip.");

/** `person:top,left,bottom,right:ref` or `hat:…:1`, the ref an index into --ref. */
function readBox(text: string): AnchorBox {
  const [target, box, reference] = text.split(":");
  const numbers = (box ?? "").split(",").map(Number);
  if (!target || numbers.length !== 4 || reference === undefined)
    fail(`Write --box as target:top,left,bottom,right:ref, not ${text}.`);
  return {
    target,
    box: numbers as AnchorBox["box"],
    reference: Number(reference),
  };
}
const boxes = args.box!.map(readBox);
const items = anchorItems(boxes);

let cookie = "";
async function call(route: string, init: RequestInit = {}) {
  const response = await fetch(new URL(route, studio), {
    ...init,
    headers: { ...(init.headers as object), cookie },
  });
  const set = response.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return response;
}
async function json<T>(route: string, init: RequestInit = {}): Promise<T> {
  const response = await call(route, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    fail(
      `${route}: ${body?.error ?? `the studio answered ${response.status}`}`,
    );
  return body as T;
}
const post = (
  route: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  json<StudioAnswer>(route, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const typeOf = (file: string) =>
  /\.png$/i.test(file)
    ? "image/png"
    : /\.webp$/i.test(file)
      ? "image/webp"
      : "image/jpeg";
const dataUrl = (bytes: Buffer, type: string) =>
  `data:${type};base64,${bytes.toString("base64")}`;
const imageFile = async (file: string) =>
  dataUrl(await readFile(file), typeOf(file));

/** Quotes, then (with --confirm) submits once and waits for the run to end. */
async function paidStep(label: string, body: Record<string, unknown>) {
  const { quote } = await post("/api/quotes", body);
  const price =
    quote.billing ?? `about $${Number(quote.estimateUsd).toFixed(2)}`;
  console.log(
    `${label}: ${price} (${quote.recipe.id}, ${quote.recipe.location ?? quote.recipe.route}).`,
  );
  if (!args.confirm) return undefined;
  const key = `swap-${randomUUID()}`;
  console.log(`${label}: submitting once under idempotency key ${key}.`);
  let job: StudioJob;
  try {
    ({ job } = await post("/api/jobs", body, {
      "Idempotency-Key": key,
      "Quote-Id": quote.id,
    }));
  } catch {
    return fail(
      `${label}: the submission's answer was lost. Check the studio's history before running anything again; resend only with key ${key}.`,
    );
  }
  while (
    ![
      "Ready",
      "Error",
      "expired",
      "stopped",
      "Request Moderated",
      "Content Moderated",
    ].includes(job.status)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    ({ job } = await json<{ job: StudioJob }>(`/api/jobs/${job.id}`));
    process.stdout.write(
      `\r${label}: ${job.status}${job.error ? ` (${job.error})` : ""}   `,
    );
  }
  console.log("");
  if (job.status !== "Ready") {
    console.log(
      `${label}: ended ${job.status}${job.error ? `: ${job.error}` : ""}.`,
    );
    return undefined;
  }
  const result = await call(`/api/clips/${job.id}`);
  return {
    job,
    bytes: Buffer.from(await result.arrayBuffer()),
    type: result.headers.get("content-type") ?? "",
  };
}

const work = await mkdtemp(path.join(os.tmpdir(), "genobi-swap-"));
try {
  // The part alone, at most 768 high: a small upload for the deployment.
  const part = path.join(work, "part.mp4");
  const frame = path.join(work, "frame.jpg");
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-ss",
    args.start!,
    "-i",
    args.clip!,
    "-t",
    args.seconds!,
    "-vf",
    "scale=-2:'min(768,ih)'",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    part,
  ]);
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    part,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    frame,
  ]);
  await json("/api/health");
  const { source } = await json<{ source: { id: string } }>(
    "/api/uploads?filename=part.mp4",
    {
      method: "POST",
      headers: { "Content-Type": "video/mp4" },
      body: await readFile(part),
    },
  );
  console.log(`Uploaded the ${args.seconds} s part as ${source.id}.`);

  const references = await Promise.all(args.ref!.map(imageFile));
  let anchor: string | undefined;
  if (boxes.length && !args["no-anchor"]) {
    const edit = anchorRequest({
      frame: dataUrl(await readFile(frame), "image/jpeg"),
      references,
      boxes,
    });
    const made = await paidStep("First frame (Klein box edit)", edit);
    // Fail soft, as Openjutsu does: the swap runs without a first frame.
    if (made) anchor = dataUrl(made.bytes, made.type || "image/jpeg");
    else if (args.confirm) console.log("The swap runs without a first frame.");
  }
  const person = boxes.find((b) => b.target === "person");
  const character = args.character
    ? await imageFile(args.character)
    : person
      ? references[person.reference]
      : anchor; // Items only: the edited frame is the character to swap in.
  if (!character)
    fail(
      args.confirm
        ? "No character to swap in: give --character, or a person box, or let the item edit finish."
        : "The swap's quote needs --character until the item edit has run.",
    );
  const swap = await paidStep("Character swap", {
    generator: "video",
    model: "openjutsu-swap",
    description: args.direction,
    duration: Number(args.seconds),
    sourceId: source.id,
    imageReferences: anchor ? [character, anchor] : [character],
    swap: {
      start: 0,
      size: Number(args.size),
      seed: args.seed === undefined ? randomSwapSeed() : Number(args.seed),
      ...(items.length ? { items } : {}),
    },
  });
  if (!args.confirm)
    console.log(
      "Quotes only. Add --confirm to run the paid steps above, once each.",
    );
  else if (swap) {
    const out = args.out ?? `swap-${swap.job.id}.mp4`;
    await writeFile(out, swap.bytes);
    console.log(
      `Saved ${out}; the studio holds it as /api/clips/${swap.job.id}.`,
    );
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
