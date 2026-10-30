import { describeProbe, readMachineProbe } from "../shared/machine";
import { planMachine, summarisePlan } from "../shared/machine-plan";
import type { ToolDefinition } from "./definition";

/**
 * The machine check for agents: what this computer has and, per capability,
 * whether it runs here or on Comfy Cloud. The studio's answer is read back
 * through the shared validator and planned again here, so the plan always
 * matches the probe it returns. Reads only; never downloads, installs or pays.
 */
export const machineTools: ToolDefinition[] = [
  {
    name: "genobi_machine",
    title: "Genobi machine check",
    description:
      "Check the machine the studio runs on (memory, free disk, Apple silicon chip or NVIDIA GPU and VRAM) and plan which models run locally and which on Comfy Cloud: listening, vision, Klein, LTX and the upscaler, each with its reason and documented source, plus voice mode's transcription, which always runs locally. For listening it picks the largest model that fits. Reads only; never downloads, installs or pays.",
    inputSchema: {},
    tags: ["agents", "mcp", "models"],
    docs: ["docs/machine-check.md"],
    annotations: { readOnlyHint: true, idempotentHint: true },
    async run(api) {
      const answer = await api.get<{ probe: unknown }>("/api/machine");
      const probe = readMachineProbe(answer.probe);
      const plan = planMachine(probe);
      return {
        machine: describeProbe(probe),
        summary: summarisePlan(plan),
        plan,
        probe,
      };
    },
  },
];
