import { cameraClauses, isH3CameraModel, isLtxModel } from "./camera";
import { h3Paragraph } from "./camera-h3";
import { acousticCaption, appendAcoustic } from "./acoustic";
import { presets } from "./legacy-camera";
import { isImage } from "./image";
import { readLayout } from "./image-layout";
export { presets } from "./legacy-camera";
import type { GenerateInput, Source, VideoResolution } from "./types";

export function composePrompt(
  input: Pick<
    GenerateInput,
    | "generator"
    | "model"
    | "description"
    | "cameraEnabled"
    | "presetId"
    | "cameraText"
    | "camera"
    | "cameraEdits"
    | "upscalePrompt"
    | "acoustic"
    | "ltxPrompt"
  >,
): string {
  if (input.generator === "upscale") return input.upscalePrompt?.trim() ?? "";
  // A song's prompt is its caption; the lyrics travel in their own slot.
  if (input.generator === "audio") return input.description.trim();
  if (isImage(input.generator)) return stillPrompt(input);
  // Composed in the browser in the LTX guide's order, with the camera
  // sentences and the AKUSPACE caption already in place.
  if (input.ltxPrompt && isLtxModel(input.model))
    return input.description.trim();
  // The AKUSPACE treatment closes the prompt, joined as the node joins it.
  const visual = visualPrompt(input);
  return input.acoustic
    ? appendAcoustic(visual, acousticCaption(input.acoustic))
    : visual;
}

function visualPrompt(input: Parameters<typeof composePrompt>[0]): string {
  const description = input.description.trim();
  if (!input.cameraEnabled) return description;
  // LTX's guide asks for one flowing paragraph; BFL's clauses stand as lines.
  const ltx = isLtxModel(input.model);
  if (input.camera) {
    const clauses = cameraClauses(
      input.camera,
      input.cameraEdits,
      input.model,
    ).map(({ section, text }) => ({ section: section.id, text: text.trim() }));
    // H3 opens the shot with its composition and ends it with the move.
    if (isH3CameraModel(input.model)) {
      const of = (id: string) =>
        clauses.find(({ section }) => section === id)?.text ?? "";
      return h3Paragraph({
        shot: of("shot-sizes"),
        angle: of("angles"),
        main: description,
        movement: of("movements"),
      });
    }
    return [description, ...clauses.map(({ text }) => text)]
      .filter(Boolean)
      .join(ltx ? " " : "\n\n");
  }
  // The legacy presets are BFL wording from before H3 took the camera.
  if (isH3CameraModel(input.model)) return description;
  const preset = presets.find((item) => item.id === input.presetId);
  const cameraText =
    input.cameraText === undefined ? preset?.clause : input.cameraText;
  return [description, cameraText].filter(Boolean).join("\n\n");
}

/**
 * A still keeps the camera's framing, shot size and angle, as BFL-style lines
 * after the caption, and drops movement, which a still cannot hold. Layout
 * rows stay last, where BFL's format puts them. Without the camera, or for an
 * entry that does not take it (the request validator turns it off), the
 * description is the prompt, rows and all.
 */
function stillPrompt(input: Parameters<typeof composePrompt>[0]): string {
  const description = input.description.trim();
  if (!input.cameraEnabled || !input.camera) return description;
  const lines = cameraClauses(input.camera, input.cameraEdits, input.model)
    .filter(({ section }) => section.id !== "movements")
    .map(({ text }) => text.trim())
    .filter(Boolean);
  if (!lines.length) return description;
  let layout;
  try {
    layout = readLayout(description, Number.MAX_SAFE_INTEGER);
  } catch {
    // Unchecked rows are refused before a prompt is composed; read as text.
    layout = { caption: description, json: "" };
  }
  const caption = [layout.caption, ...lines].join("\n\n");
  return layout.json ? `${caption} ${layout.json}` : caption;
}

export function estimateVideoUsd(
  draft = false,
  duration = 5,
  resolution: VideoResolution = "hd",
) {
  const centsPerSecond: Record<VideoResolution, number> = {
    hd: 17,
    fhd: 29,
    qhd: 40,
    uhd: 80,
  };
  return (duration * (draft ? 6 : centsPerSecond[resolution])) / 100;
}

export function estimateUpscaleOutput(
  source: Pick<Source, "width" | "height">,
  factor = 2,
) {
  const sourcePixels = source.width * source.height;
  const requestedPixels = sourcePixels * factor * factor;
  const pixels = Math.min(requestedPixels, 13.75 * 1048576);
  const effectiveFactor =
    pixels < requestedPixels ? Math.sqrt(pixels / sourcePixels) : factor;
  return {
    width: Math.floor(source.width * effectiveFactor),
    height: Math.floor(source.height * effectiveFactor),
    effectiveFactor,
    capped: pixels < requestedPixels,
    megapixels: pixels / 1048576,
  };
}

export function estimateUpscaleUsd(
  source: Pick<Source, "width" | "height" | "duration">,
  factor = 2,
  creativity: 0 | 1 = 0,
): number {
  const { megapixels } = estimateUpscaleOutput(source, factor);
  const rate = creativity === 1 ? 0.1 : 0.07;
  // Reserve a whole cent without promoting floating-point noise to another cent.
  return Math.ceil(megapixels * source.duration * rate * 100 - 1e-9) / 100;
}
