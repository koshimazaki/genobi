import {
  DEPLOY_ENDPOINTS,
  type DeployModel,
  isDeployModel,
} from "../shared/comfy/deploy-catalogue";
import { isH3 } from "../shared/h3";
import { isH3Router } from "../shared/comfy/h3-router";
import type { Generator, VideoModel } from "../shared/types";
import { entryFor, entryLabel, readyEntry } from "../shared/registry";
import { isLtx } from "../shared/comfy/ltx";
import { isKlein } from "../shared/image";

/**
 * The generators, named once.
 *
 * The model menu, the mode badge above the prompt and the composer foot all
 * read from here, and here reads `shared/registry.ts`, so their wording cannot
 * drift apart. The names follow BFL's own: `FLUX 3` for the `/v1/flux-3-video`
 * endpoint, whose body mode is `"t2v"`, and `FLUX Video Upscale` for
 * `/v1/flux-tools/video-upscale-v1`, which BFL documents under that name. The
 * icon is an `Icon` name so each caller can size it for its own row.
 */
const named = (id: string, icon: string) => {
  const entry = readyEntry(id)!;
  return { model: entry.label, label: entryLabel(entry), icon };
};
export const generators: Record<
  Generator,
  { model: string; label: string; icon: string }
> = {
  video: named("flux-3-video", "camera"),
  image: named("flux-3-image", "image"),
  edit: named("flux-3-edit", "image"),
  upscale: named("flux-video-upscale", "expand"),
  audio: named("minimax-music-3", "sound"),
};

/**
 * The video models, named once as well, from the same registry entries. LTX
 * names follow Comfy Router's route ids (`ltx-2-5-fast`, `ltx-2-5-pro`); FLUX
 * keeps BFL's name. Every video model generates its own audio, and every
 * request asks for it.
 */
const video = (model: VideoModel) => {
  const entry = entryFor("video", model);
  const icon =
    entry.controls.kind === "video" && entry.controls.acoustic
      ? "acoustic"
      : "camera";
  return { ...named(entry.id, icon), open: entry.open };
};
export const videoModels: Record<
  Exclude<
    VideoModel,
    "flux-3-klein" | "flux-3-klein-api" | "minimax-music-3" | "seedvr2-upscale"
  >,
  { model: string; label: string; icon: string; open: boolean }
> = {
  ...(Object.fromEntries(
    DEPLOY_ENDPOINTS.map((name) => [
      `ltx-deploy-${name}`,
      video(`ltx-deploy-${name}`),
    ]),
  ) as Record<DeployModel, ReturnType<typeof video>>),
  "ltx-2.5": video("ltx-2.5"),
  "ltx-2.5-pro": video("ltx-2.5-pro"),
  "ltx-2.5-open": video("ltx-2.5-open"),
  "ltx-2.5-akuspace": video("ltx-2.5-akuspace"),
  "flux-3": video("flux-3"),
  "flux-3-i2v": video("flux-3-i2v"),
  "minimax-h3": video("minimax-h3"),
  "minimax-h3-canny": video("minimax-h3-canny"),
  "minimax-h3-depth": video("minimax-h3-depth"),
  "minimax-h3-combined": video("minimax-h3-combined"),
  "openjutsu-swap": video("openjutsu-swap"),
  "minimax-h3-router": video("minimax-h3-router"),
};

/**
 * The badge above the prompt: the held entry's menu name. Without a model, or
 * for FLUX Video Upscale, the generator's own name.
 */
export function modeName(generator: Generator, model?: VideoModel) {
  if (
    !model ||
    (generator === "upscale" &&
      entryFor(generator, model).id === "flux-video-upscale")
  )
    return generators[generator];
  const entry = entryFor(generator, model);
  const icon =
    generator === "audio"
      ? "sound"
      : generator === "upscale"
        ? "expand"
        : generator !== "video"
          ? "image"
          : entry.controls.kind === "video" && entry.controls.acoustic
            ? "acoustic"
            : "camera";
  return { model: entry.label, label: entryLabel(entry), icon };
}

/**
 * The composer foot's line for whichever generator is selected: the same name
 * the menu and the badge show, plus what the run carries, and whether its
 * weights are open. Audio is always on, so every video model says so. A still
 * says whether it runs as an open workflow or a paid API.
 */
export function generatorFoot(
  generator: Generator,
  upscaleMode: "Precise" | "Creative",
  model: VideoModel = "flux-3",
): string {
  const entry = entryFor(generator, model);
  const line =
    generator === "video"
      ? `${entry.label} · native audio`
      : generator === "upscale"
        ? entry.route === "workflow"
          ? `${entryLabel(entry)} · open workflow`
          : `${generators.upscale.label} · ${upscaleMode.toLowerCase()}`
        : `${entryLabel(entry)} · ${entry.route === "workflow" ? "open workflow" : "paid API"}`;
  // A licence's required name leads, so a narrow foot never cuts it off.
  const credited = entry.credit ? `${entry.credit} · ${line}` : line;
  return entry.open ? `${credited} · open weights` : credited;
}

/**
 * The gallery's signature for a run: which model made it, from the job's own
 * `generator` and `model`. A run recorded before the model switch is FLUX 3,
 * as `validateInput` reads it. The title carries the full menu name.
 */
export function modelSignature(job: {
  generator: Generator;
  model?: VideoModel;
}): { tag: string; title: string } {
  const entry = entryFor(job.generator, job.model);
  const tag =
    job.generator === "upscale"
      ? "UPSCALE"
      : job.generator === "audio"
        ? "MUSIC"
        : isH3(job.model) || isH3Router(job.model)
          ? "H3"
          : isLtx(job.model) || isDeployModel(job.model)
            ? "LTX-2.5"
            : isKlein(job.model)
              ? "KLEIN"
              : "FLUX 3";
  return { tag, title: entryLabel(entry) };
}
