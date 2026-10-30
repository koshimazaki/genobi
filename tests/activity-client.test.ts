import { afterEach, beforeEach, expect, it, vi } from "vitest";
beforeEach(() => {
  vi.resetModules();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("no-voice / no-logging still executes local tools without any log request", async () => {
  vi.stubGlobal("fetch", vi.fn());
  const { withBrowserActivity, activityState } =
    await import("../src/activity/store");
  expect(activityState()).toMatchObject({ enabled: false, showBubble: false });
  await expect(withBrowserActivity("director", async () => 42)).resolves.toBe(
    42,
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("hosted mode keeps opted-in local tool history without a server route", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 404 })),
  );
  const s = await import("../src/activity/store");
  await s.refreshActivity();
  await s.setActivityLogging(true);
  await s.withBrowserActivity("scene", async () => "done");
  expect(s.activityState().events[0]).toMatchObject({
    tool: "scene",
    phase: "succeeded",
  });
  s.setBubbleVisibility(false);
  expect(s.activityState().enabled).toBe(true);
  await s.setActivityLogging(false);
  expect(s.activityState().events).toEqual([]);
});
it("failed opt-out is explicit and refresh cannot silently re-enable local capture", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ enabled: true, events: [] }))
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce(Response.json({ enabled: true, events: [] }));
  vi.stubGlobal("fetch", fetcher);
  const s = await import("../src/activity/store");
  await s.refreshActivity();
  await s.setActivityLogging(false);
  expect(s.activityState().warning).toContain("not changed yet");
  await s.refreshActivity();
  expect(s.activityState()).toMatchObject({
    enabled: false,
    events: [],
    preferencePending: true,
  });
  vi.resetModules();
  const reopened = await import("../src/activity/store");
  expect(reopened.activityState().warning).toContain("not changed yet");
  expect(reopened.activityState().enabled).toBe(false);
});

it("serializes rapid preference changes and never lets an old opt-in undo opt-out", async () => {
  let finishEnable!: (r: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishEnable = resolve;
        }),
    )
    .mockResolvedValueOnce(Response.json({ enabled: false, events: [] }));
  vi.stubGlobal("fetch", fetcher);
  const s = await import("../src/activity/store");
  const enable = s.setActivityLogging(true);
  await Promise.resolve();
  const disable = s.setActivityLogging(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  finishEnable(Response.json({ enabled: true, events: [] }));
  await enable;
  expect(s.activityState().enabled).toBe(false);
  await disable;
  expect(
    fetcher.mock.calls.map(([, init]) => JSON.parse(init.body).enabled),
  ).toEqual([true, false]);
  expect(s.activityState()).toMatchObject({
    enabled: false,
    preferencePending: false,
  });
});

it("a refresh begun before opt-out cannot restore old server history", async () => {
  let finishRead!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishRead = resolve;
          }),
      )
      .mockResolvedValueOnce(Response.json({ enabled: false, events: [] })),
  );
  const s = await import("../src/activity/store");
  const read = s.refreshActivity();
  await s.setActivityLogging(false);
  finishRead(Response.json({ enabled: true, events: [] }));
  await read;
  expect(s.activityState().enabled).toBe(false);
});
