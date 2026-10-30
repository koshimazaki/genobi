import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Job } from "../shared/types";
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", {
    getItem: () =>
      JSON.stringify({ enabled: true, showBubble: false, events: [] }),
    setItem: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());
it.each([
  ["router", undefined, "router"],
  ["bfl", undefined, "bfl"],
  ["workflow", "local", "local"],
  ["workflow", "cloud", "cloud"],
] as const)(
  "records a completed %s / %s take's actual backend",
  async (route, location, backend) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) =>
        String(url).includes("/takes/")
          ? Response.json({ take: { recipe: { route, location } } })
          : new Response("", { status: 404 }),
      ),
    );
    const s = await import("../src/activity/store");
    await s.refreshActivity();
    const { recordJobActivity } = await import("../src/activity/jobs");
    await recordJobActivity({ id: "one", status: "Ready" } as Job);
    expect(s.activityState().events[0]).toMatchObject({
      phase: "succeeded",
      backend,
    });
  },
);
it("a queued submission remains started and never reads a take", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
  vi.stubGlobal("fetch", fetcher);
  const s = await import("../src/activity/store");
  await s.refreshActivity();
  fetcher.mockClear();
  const { recordJobActivity } = await import("../src/activity/jobs");
  await recordJobActivity({ id: "one", status: "Generating" } as Job);
  expect(s.activityState().events[0]).toMatchObject({ phase: "started" });
  expect(fetcher).not.toHaveBeenCalled();
});
