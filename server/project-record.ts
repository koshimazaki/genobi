import type { Project } from "../shared/director/types";
import type { PromptBrief } from "../src/director/prompt-brief";
import type { ProjectMemory } from "../shared/memory/schema";
export interface CopyRecord {
  id: string;
  /**
   * The copy's own handle, `<project id>.<ten random characters>`. Templates
   * reuse fixed project ids, so two owners can hold the same id; a linked
   * session reads and commands by this handle, never by the bare id.
   */
  copyId: string;
  /** The owner: the studio session that pushes the project. */
  sessionId: string;
  /** Sessions the owner linked with a one-use code: they read and command. */
  agents: string[];
  revision: number;
  project: Project;
  brief: PromptBrief | null;
  updatedAt: string;
  memory?: ProjectMemory;
}
