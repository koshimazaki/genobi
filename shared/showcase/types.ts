/**
 * A showcase record (`docs/director-bundle/showcase/<project>/memory.json`,
 * schema `docs/director-bundle/schema/showcase.schema.json`): how a project
 * was made, version by version. Each version is a Director project bundle
 * (`project-v<N>.json`) built by `scripts/showcase-versions.mjs` from the
 * template, cut and `mixProject` at that version's commit; `media` says
 * where each file it uses is served, or where git keeps one the studio no
 * longer ships. See docs/director-bundle/showcase/README.md.
 */
export interface ShowcaseVersion {
  version: number;
  commit?: string;
  pr?: number;
  date: string;
  by: ("owner" | "agent")[];
  title: string;
  summary: string;
  changes: string[];
  eventIds: string[];
  file: string;
  projectId: string;
  layers: number;
  durationFrames: number;
  /** Recipes it is built on today's bytes of; its own were replaced. */
  rebased?: string[];
}
export interface ShowcaseMedia {
  /** The file's path inside the version's bundle. */
  path: string;
  url?: string;
  git?: { commit: string; path: string };
  shipped?: false;
  reason?: string;
}
export interface ShowcaseEvent {
  id: string;
  kind: "kept" | "rejected" | "rerun" | "undo" | "preference" | "note";
  objectIds: string[];
  reason: string;
  source: "explicit-user" | "ui-action" | "interpretation";
  supersedes?: string;
  guidance?: { topic: string; value: string };
  actor: "owner" | "agent" | "system";
  at: string;
  version: number;
}
export interface ShowcaseCheckpoint {
  id: string;
  sessionId: string;
  summary: string;
  eventIds: string[];
  unresolved: string[];
  nextSteps: string[];
  status: "done" | "stopped" | "failed" | "waiting";
  at: string;
  version: number;
}
export interface ShowcaseRecord {
  schema: "genobi.showcase.v1";
  project: string;
  name: string;
  /** The mix template whose gallery card lists these versions. */
  template: string;
  summary: string;
  versions: ShowcaseVersion[];
  pending?: {
    version: number;
    branch: string;
    summary: string;
    steps: string[];
  }[];
  /** New recipe parameters' values for versions built on today's recipes. */
  recipeDefaults?: Record<string, Record<string, string | number | boolean>>;
  /** Copy media a later version replaced, so every version opens. */
  archive?: boolean;
  /** By SHA-256: the same path can hold other bytes in another version. */
  media: Record<string, ShowcaseMedia>;
  memory: { events: ShowcaseEvent[]; checkpoints: ShowcaseCheckpoint[] };
}

/** Opens one version in the Editor as its own, editable project. */
export const showcaseLink = (project: string, version: number) =>
  `/director?showcase=${encodeURIComponent(project)}&version=${version}&workspace=editor`;
