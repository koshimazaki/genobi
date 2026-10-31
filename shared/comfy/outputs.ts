import type { WorkflowOutput } from "./workflow";

/** Only the graph's declared outputs can become a take, on every destination. */
export function selectWorkflowOutputs<
  T extends { nodeId: string; type: string },
>(
  outputs: T[],
  expected: WorkflowOutput,
):
  | {
      ok: true;
      primary: T;
      companions: { nodeId: string; label: string; output: T }[];
    }
  | { ok: false; error: string } {
  const primary = outputs.find(
    (output) =>
      output.nodeId === expected.nodeId && output.type === expected.media,
  );
  if (!primary)
    return {
      ok: false,
      error: `The workflow completed without its expected ${expected.media} output. Check the workflow output nodes.`,
    };
  const companions: { nodeId: string; label: string; output: T }[] = [];
  for (const { nodeId, label } of expected.companions ?? []) {
    const output = outputs.find(
      (candidate) => candidate.nodeId === nodeId && candidate.type === "audio",
    );
    if (!output)
      return {
        ok: false,
        error:
          "The workflow completed without all required audio outputs. Check the workflow output nodes.",
      };
    companions.push({ nodeId, label, output });
  }
  return { ok: true, primary, companions };
}
