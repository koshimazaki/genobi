import { randomUUID } from "node:crypto";
import { StudioNoAnswer, type GenobiApi } from "./api";
import type { ActivityEvent } from "../shared/activity";
const linked = new WeakMap<GenobiApi, string>();
/** All registered MCP tools, including pure local transforms, pass this boundary. */
export async function trackedTool<T>(
  api: GenobiApi,
  tool: string,
  args: Record<string, unknown>,
  run: () => Promise<T>,
) {
  const id = randomUUID();
  let warning: string | undefined;
  let jobId: string | undefined;
  let copyId = typeof args.copyId === "string" ? args.copyId : linked.get(api);
  async function record(phase: ActivityEvent["phase"]) {
    try {
      await api.activity({
        event: { id, at: new Date().toISOString(), tool, phase, source: "mcp" },
        ...(copyId ? { copyId } : {}),
        ...(jobId ? { jobId } : {}),
      });
    } catch {
      warning =
        "Tool activity could not be saved; do not repeat completed work to recover a log.";
    }
  }
  await record("started");
  try {
    const result = await run();
    if (
      ["genobi_submit", "genobi_job", "genobi_take"].includes(tool) &&
      result &&
      typeof result === "object"
    ) {
      const value = result as {
        id?: unknown;
        operationId?: unknown;
        take?: { operationId?: unknown };
        status?: unknown;
      };
      const id = value.id ?? value.operationId ?? value.take?.operationId;
      if (typeof id === "string") jobId = id;
    }
    if (
      tool === "genobi_link_project" &&
      result &&
      typeof result === "object" &&
      "copyId" in result &&
      typeof result.copyId === "string"
    ) {
      copyId = result.copyId;
      linked.set(api, copyId);
    }
    await record(
      result &&
        typeof result === "object" &&
        "status" in result &&
        result.status === "Error"
        ? "failed"
        : "succeeded",
    );
    return { result, warning };
  } catch (error) {
    await record(error instanceof StudioNoAnswer ? "unknown" : "failed");
    throw error;
  }
}
