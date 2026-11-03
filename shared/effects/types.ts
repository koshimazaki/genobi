import type { Parameters, Project } from "../director/types";

export type EffectControl = {
  key: string;
  label: string;
  description?: string;
} & (
  | {
      type: "number";
      min: number;
      max: number;
      step: number;
      integer?: boolean;
    }
  | { type: "color" }
  | { type: "text"; maxLength: number }
  | { type: "select"; options: string[] }
  | { type: "boolean" }
);

export interface EffectPresetLayer {
  key: string;
  name: string;
  moduleId: string;
  /** Fractions of the inserted duration; never wall-clock timers. */
  start: number;
  duration: number;
  parameters: Parameters;
  /** Module parameter name to exposed control name. */
  bindings: Record<string, string>;
}

export interface EffectPreset {
  schemaVersion: "genobi.effect-preset.v1";
  id: string;
  version: number;
  name: string;
  family:
    "Poster & Temporal" | "Cinematic / HUD" | "Kinetic" | "Fluid & Distortion";
  description: string;
  note: string;
  readiness: "editable";
  input: "none" | "composite-below";
  durationSeconds: number;
  controls: EffectControl[];
  defaults: Parameters;
  layers: EffectPresetLayer[];
  moduleHashes: Record<string, string>;
  credits: { name: string; licence: string; url: string }[];
}

/** Portable configuration only. Sources are always trusted, pinned modules. */
export interface EffectVariant {
  schemaVersion: "genobi.effect-variant.v1";
  presetId: string;
  presetVersion: number;
  name: string;
  parameters: Parameters;
  moduleHashes: Record<string, string>;
}

export interface ApplyEffectInput {
  presetId: string;
  /** A fresh caller-generated id keeps server/browser command replay identical. */
  instanceId: string;
  expectedRevision: number;
  startFrame: number;
  durationFrames: number;
  parameters?: Parameters;
  variant?: EffectVariant;
  /** Optional checked source; filters still treat the composition below. */
  sourceLayerId?: string;
}

export interface EffectInsertion {
  project: Project;
  instanceId: string;
  layerIds: string[];
  presetId: string;
  presetVersion: number;
  family: EffectPreset["family"];
  /** Stable configuration identity; not a cryptographic integrity check. */
  fingerprint: string;
}

export type ApplyEffectCommand = {
  op: "apply-effect-preset";
} & ApplyEffectInput;
