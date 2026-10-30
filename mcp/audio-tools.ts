import { z } from "zod";
import type { AudioAnalysisReport, BandOnsets } from "../shared/audio-report";
import { COPY_ID } from "../shared/director/commands";
import { StudioError } from "./api";
import {
  checkAudioPath,
  forgetAudioFile,
  MAX_PATH_LENGTH,
  uploadAudioFile,
} from "./audio-file";
import type { ToolDefinition } from "./definition";

// Audio analysis through the local studio: tempo and a fitted beat grid, a
// downbeat estimate, onsets per band, an intensity curve and key moments.
// Local CPU work, never paid; the hosted studio has no such route. Getting a
// local file in is its own tool, because an upload is a write.

/** Points kept on the intensity curve and onsets per band in a summary. */
const SUMMARY_POINTS = 200;
const SUMMARY_ONSETS = 200;

/**
 * Onsets capped per band, with the counts the report held. `truncated`
 * keeps the report's meaning: the analysis itself stopped at 5,000 per band,
 * so the counts are a floor, not the whole.
 */
function summariseOnsets(onsets: BandOnsets) {
  const { kick, snare, hat, truncated } = onsets;
  const cap = (list: number[]) => list.slice(0, SUMMARY_ONSETS);
  return {
    kick: cap(kick),
    snare: cap(snare),
    hat: cap(hat),
    counts: { kick: kick.length, snare: snare.length, hat: hat.length },
    shownPerBand: SUMMARY_ONSETS,
    truncated,
  };
}

/** The intensity curve thinned to its loudest point per span, onsets capped. */
export function summariseReport(report: AudioAnalysisReport) {
  const { values, stepSeconds } = report.intensity;
  const every = Math.max(1, Math.ceil(values.length / SUMMARY_POINTS));
  const thinned: number[] = [];
  for (let i = 0; i < values.length; i += every)
    thinned.push(Math.max(...values.slice(i, i + every)));
  return {
    ...report,
    onsets: summariseOnsets(report.onsets),
    intensity: {
      ...report.intensity,
      stepSeconds: Math.round(stepSeconds * every * 100) / 100,
      values: thinned,
    },
    librosa: report.librosa.onsets
      ? { ...report.librosa, onsets: summariseOnsets(report.librosa.onsets) }
      : report.librosa,
  };
}

const SOURCE_ID = /^[a-zA-Z0-9_-]{1,80}$/;

export const audioTools: ToolDefinition[] = [
  {
    name: "genobi_audio_upload",
    title: "Genobi audio upload",
    description:
      "Bring a local WAV, FLAC or MP3 into this agent's Genobi session, for genobi_audio_analysis. filePath is an absolute path on this machine; the file is checked here (at most 50 MB and 20 minutes, a readable WAV, FLAC or MP3 header) and only its bytes are sent. Returns its sourceId; the same file again returns the same id. Stores a copy in the studio; never paid.",
    inputSchema: {
      filePath: z
        .string()
        .min(1)
        .max(MAX_PATH_LENGTH)
        .describe("Absolute path to a local WAV, FLAC or MP3 file"),
    },
    // Stores a file and a source record, so not read-only; repeat-safe.
    tags: ["agents", "mcp", "sound"],
    docs: ["docs/audio-analysis.md"],
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
    },
    async run(api, args) {
      return {
        sourceId: await uploadAudioFile(api, checkAudioPath(args.filePath)),
      };
    },
  },
  {
    name: "genobi_audio_analysis",
    title: "Genobi audio analysis",
    description:
      "Analyse audio on the local studio: tempo and a fitted straight beat grid, a downbeat estimate the person should confirm, onsets per band (kick, snare, hat), an intensity curve and key moments (build-ups, crescendos, drops). beatFound is false, and grid and composition null, when no beat lands on an onset. `composition` holds bpm, beatOffsetSeconds and beatsPerBar to copy onto a Director composition. Name an audio source this session owns (sourceId, from genobi_audio_upload) or an audio asset of a linked project (copyId and assetId). librosa: true adds the optional librosa worker's view when the studio has it set up; otherwise the report says it was unavailable. Reads only; never paid.",
    inputSchema: {
      sourceId: z
        .string()
        .regex(SOURCE_ID)
        .optional()
        .describe("An audio source id from genobi_audio_upload"),
      copyId: z
        .string()
        .regex(COPY_ID)
        .optional()
        .describe("A linked project's copyId from genobi_projects"),
      assetId: z
        .string()
        .regex(/^[a-z][a-z0-9-]{0,63}$/)
        .optional()
        .describe("An audio asset id from genobi_project's assets"),
      librosa: z
        .boolean()
        .optional()
        .describe("Also run the optional librosa worker, if set up"),
      detail: z
        .enum(["summary", "full"])
        .optional()
        .describe(
          "full (default): the whole report; summary: 200 onsets per band and a 200-point curve",
        ),
    },
    // CPU work on the person's machine; the report is cached, nothing changes.
    tags: ["agents", "mcp", "sound"],
    docs: ["docs/audio-analysis.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api, args) {
      const bySource = args.sourceId !== undefined;
      const byAsset = args.copyId !== undefined && args.assetId !== undefined;
      const named = [args.sourceId, args.copyId, args.assetId].filter(
        (v) => v !== undefined,
      ).length;
      if (!(bySource && named === 1) && !(byAsset && named === 2))
        throw new Error(
          "Name one audio input: sourceId, or copyId with assetId.",
        );
      let report: AudioAnalysisReport;
      try {
        ({ report } = await api.post<{ report: AudioAnalysisReport }>(
          "/api/audio/analyze",
          {
            ...(bySource
              ? { sourceId: args.sourceId }
              : { copyId: args.copyId, assetId: args.assetId }),
            ...(args.librosa ? { librosa: true } : {}),
          },
        ));
      } catch (error) {
        // The studio restarted or let the upload go: the next upload of the
        // same file sends it again rather than returning this id.
        if (bySource && error instanceof StudioError && error.status === 404)
          forgetAudioFile(api, String(args.sourceId));
        throw error;
      }
      return args.detail === "summary" ? summariseReport(report) : report;
    },
  },
];
