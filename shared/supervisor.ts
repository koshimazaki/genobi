import { z } from "zod";

const line = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !/[\x00-\x1f\x7f]/.test(value));

/** Read-only presence. This contract grants no editing or spending authority. */
export const supervisorSnapshot = z.strictObject({
  type: z.literal("genobi.supervisor.snapshot"),
  channel: z.string().uuid(),
  actors: z
    .array(
      z.strictObject({
        id: line(120),
        role: line(60),
        runtime: z.enum(["Hermes", "Codex", "Claude Code"]),
        model: line(120),
        state: z.enum([
          "connected",
          "working",
          "waiting",
          "finished",
          "stopped",
        ]),
        summary: line(600),
      }),
    )
    .max(8),
});
export type SupervisorActor = z.infer<
  typeof supervisorSnapshot
>["actors"][number];
