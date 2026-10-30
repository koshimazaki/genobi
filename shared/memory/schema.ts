import { z } from "zod";
import type { TasteShelf } from "../licensing/taste-shelf";

export const memoryId = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[\x00-\x08\x0b-\x1f\x7f]/.test(s));
export const scopeSchema = z.strictObject({
  medium: text(40),
  useCase: text(80),
});
export type TasteScope = z.infer<typeof scopeSchema>;
export const decisionSchema = z.strictObject({
  id: memoryId,
  baseRevision: z.number().int().min(1),
  memoryRevision: z.number().int().min(0),
  kind: z.enum(["kept", "rejected", "rerun", "undo", "preference", "note"]),
  objectIds: z.array(memoryId).max(16),
  reason: text(500).optional(),
  source: z.enum(["explicit-user", "ui-action", "interpretation"]),
  supersedes: memoryId.optional(),
  priorAttempt: memoryId.optional(),
  guidance: z.strictObject({ topic: text(80), value: text(500) }).optional(),
  preferenceIds: z.array(memoryId).max(16).optional(),
});
export type DecisionInput = z.infer<typeof decisionSchema>;
export interface MemoryEvent extends Omit<
  DecisionInput,
  "baseRevision" | "memoryRevision"
> {
  schema: 1;
  projectId: string;
  revision: number;
  cursor: number;
  at: string;
  actor: "owner" | "agent" | "system";
  sessionId?: string;
  /** Canonical input for retry comparison, private to the store. */
  receipt?: string;
  operational?: boolean;
}
export const checkpointSchema = z.strictObject({
  id: memoryId,
  baseRevision: z.number().int().min(1),
  memoryRevision: z.number().int().min(0),
  sessionId: memoryId,
  coveredCursor: z.number().int().min(0),
  summary: text(2000),
  eventIds: z.array(memoryId).max(40),
  unresolved: z.array(text(300)).max(16),
  nextSteps: z.array(text(300)).max(16),
  status: z.enum(["done", "stopped", "failed", "waiting"]).optional(),
});
export type CheckpointInput = z.infer<typeof checkpointSchema>;
export interface MemoryCheckpoint extends Omit<
  CheckpointInput,
  "memoryRevision" | "baseRevision"
> {
  revision: number;
  at: string;
  receipt: string;
}
export interface MemorySession {
  id: string;
  runner: string;
  goal: string;
  startedAt: string;
  /** One-way owner-session digest for access checks; never a browser credential. */
  principal: string;
  status: "running" | "done" | "failed" | "stopped" | "waiting" | "interrupted";
  checkpoint?: MemoryCheckpoint;
  /** Last observed progress, not a claim of completed work. */
  progress?: string;
  summary?: string;
}
export const referenceSchema = z
  .strictObject({
    id: memoryId,
    baseRevision: z.number().int().min(1),
    memoryRevision: z.number().int().min(0),
    assetId: memoryId.optional(),
    url: z
      .string()
      .max(2000)
      .refine((value) => {
        try {
          return /^https?:\/\/[^\s/@?#]+(?:[/?#][^\s]*)?$/.test(value);
        } catch {
          return false;
        }
      })
      .optional(),
    purpose: z.enum([
      "style",
      "motion",
      "camera",
      "timing",
      "audio",
      "element",
    ]),
    observation: text(500),
    author: text(120).optional(),
    licence: text(200).optional(),
    revision: text(100).optional(),
  })
  .refine((v) => !!v.assetId !== !!v.url, "Choose an asset or URL.");
export interface MemoryReference extends Omit<
  z.infer<typeof referenceSchema>,
  "baseRevision" | "memoryRevision"
> {
  inspected: false;
  receipt: string;
}
export interface ProjectMemory {
  schema: 1;
  revision: number;
  cursor: number;
  events: MemoryEvent[];
  sessions: MemorySession[];
  references: MemoryReference[];
}
export const preferenceSchema = z.strictObject({
  id: memoryId,
  topic: text(80),
  value: text(500),
  scope: scopeSchema,
  evidence: z
    .array(z.strictObject({ copyId: z.string().max(160), eventId: memoryId }))
    .min(1)
    .max(16),
  supersedes: memoryId.optional(),
});
export type PreferenceInput = z.infer<typeof preferenceSchema>;
export interface TastePreference extends PreferenceInput {
  author: "owner" | "agent";
  status: "proposed" | "active" | "disabled";
}
export interface TasteProfile {
  schema: 1;
  revision: number;
  preferences: TastePreference[];
  shelf?: TasteShelf;
}
export const emptyMemory = (): ProjectMemory => ({
  schema: 1,
  revision: 0,
  cursor: 0,
  events: [],
  sessions: [],
  references: [],
});
export const emptyProfile = (): TasteProfile => ({
  schema: 1,
  revision: 0,
  preferences: [],
});
