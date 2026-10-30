import { z } from "zod";
import {
  developmentRunner,
  type DevelopmentRunner,
} from "./development-session";

/** The two native terminal roles; Hermes runs each in its own profile. */
export const developmentRole = z.enum(["developer", "creative"]);
export type DevelopmentRole = z.infer<typeof developmentRole>;
export const terminalRequest = z
  .strictObject({
    runner: developmentRunner,
    /** One terminal per role, in this order; omitted means Developer only. */
    roles: z.array(developmentRole).min(1).max(2).optional(),
    previous: z.string().uuid().optional(),
    resumePicker: z.boolean().optional(),
    handover: z.string().max(8000).optional(),
  })
  .refine((value) => !(value.previous && value.resumePicker))
  .refine(
    (value) =>
      !value.roles ||
      (new Set(value.roles).size === value.roles.length &&
        !((value.previous || value.resumePicker) && value.roles.length > 1)),
    { message: "Resume one role at a time." },
  );
export type TerminalRequest = z.infer<typeof terminalRequest>;
export interface TerminalSession {
  id: string;
  runner: DevelopmentRunner;
  role: DevelopmentRole;
  startedAt: string;
  status: "opened" | "closed" | "failed";
  resumable: boolean;
}
export interface TerminalState {
  supported: boolean;
  runners: {
    runner: DevelopmentRunner;
    /** The Developer (supervisor) terminal can open. */
    available: boolean;
    /** The Creative terminal can open (Hermes needs its hermes-creative profile). */
    creative: boolean;
  }[];
  sessions: TerminalSession[];
}
