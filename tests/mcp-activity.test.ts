import { expect, it, vi } from "vitest";
import { trackedTool } from "../mcp/activity";
import { StudioNoAnswer, type GenobiApi } from "../mcp/api";
it("records pure and remote tools through the same wrapper without arguments", async () => {
  const activity = vi.fn().mockResolvedValue({ recorded: true });
  const api = { activity } as unknown as GenobiApi;
  const result = await trackedTool(
    api,
    "genobi_scene",
    { prompt: "private" },
    async () => ({ revision: 3 }),
  );
  expect(result.result).toEqual({ revision: 3 });
  expect(activity.mock.calls.map(([v]) => v.event.phase)).toEqual([
    "started",
    "succeeded",
  ]);
  expect(JSON.stringify(activity.mock.calls)).not.toContain("private");
});
it("attributes later tools to the linked project, with an explicit copy taking precedence", async () => {
  const activity = vi.fn().mockResolvedValue({ recorded: true });
  const api = { activity } as unknown as GenobiApi;
  await trackedTool(api, "genobi_link_project", {}, async () => ({
    copyId: "project.abcdefghij",
  }));
  await trackedTool(api, "genobi_scene", {}, async () => ({}));
  expect(activity.mock.lastCall![0].copyId).toBe("project.abcdefghij");
  await trackedTool(
    api,
    "genobi_project",
    { copyId: "other.abcdefghij" },
    async () => ({}),
  );
  expect(activity.mock.lastCall![0].copyId).toBe("other.abcdefghij");
});
it("records failure once without retrying the tool", async () => {
  const activity = vi.fn().mockResolvedValue({});
  const run = vi.fn().mockRejectedValue(new Error("Operation failed"));
  await expect(
    trackedTool({ activity } as unknown as GenobiApi, "genobi_submit", {}, run),
  ).rejects.toThrow("Operation failed");
  expect(run).toHaveBeenCalledTimes(1);
  expect(activity.mock.lastCall![0].event.phase).toBe("failed");
});
it("a logging failure does not turn a completed paid tool into a failure", async () => {
  const activity = vi.fn().mockRejectedValue(new Error("Disk offline"));
  const run = vi.fn().mockResolvedValue({ job: "result" });
  const result = await trackedTool(
    { activity } as unknown as GenobiApi,
    "genobi_submit",
    {},
    run,
  );
  expect(run).toHaveBeenCalledTimes(1);
  expect(result.result).toEqual({ job: "result" });
  expect(result.warning).toContain("do not repeat");
});

it("an uncertain submission remains unknown, without retry", async () => {
  const activity = vi.fn().mockResolvedValue({});
  const run = vi.fn().mockRejectedValue(new StudioNoAnswer("Response lost"));
  await expect(
    trackedTool({ activity } as unknown as GenobiApi, "genobi_submit", {}, run),
  ).rejects.toThrow("Response lost");
  expect(run).toHaveBeenCalledTimes(1);
  expect(activity.mock.lastCall![0].event.phase).toBe("unknown");
});
