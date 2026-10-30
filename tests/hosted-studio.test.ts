import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HOSTED_RUN_LOCATION } from "../shared/comfy/run-location";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it.each([true, false])(
  "retry never clears a confirmed hosted answer (%s)",
  async (fixed) => {
    const request = vi.fn(async () =>
      Response.json({ ...HOSTED_RUN_LOCATION, fixed }),
    );
    vi.stubGlobal("fetch", request);
    const { readHostedStudio, retryHostedStudio } =
      await import("../src/hosted-studio");
    const confirmed = readHostedStudio();
    expect(await confirmed).toBe(fixed);
    expect(retryHostedStudio()).toBe(confirmed);
    expect(await readHostedStudio()).toBe(fixed);
    expect(request).toHaveBeenCalledOnce();
  },
);

it("retry shares a pending read instead of starting a second one", async () => {
  let resolve!: (response: Response) => void;
  const request = vi.fn(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("fetch", request);
  const { readHostedStudio, retryHostedStudio } =
    await import("../src/hosted-studio");
  const pending = readHostedStudio();
  expect(retryHostedStudio()).toBe(pending);
  resolve(Response.json(HOSTED_RUN_LOCATION));
  expect(await pending).toBe(true);
  expect(request).toHaveBeenCalledOnce();
});

it.each(["network", "invalid"])(
  "retry clears only a failed/undefined answer (%s)",
  async (failure) => {
    const request = vi
      .fn()
      .mockResolvedValue(Response.json(HOSTED_RUN_LOCATION));
    if (failure === "network")
      request.mockRejectedValueOnce(new Error("Offline"));
    else request.mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal("fetch", request);
    const { readHostedStudio, retryHostedStudio } =
      await import("../src/hosted-studio");
    const failed = readHostedStudio();
    expect(await failed).toBeUndefined();
    expect(readHostedStudio()).toBe(failed);
    expect(request).toHaveBeenCalledOnce();
    const retry = retryHostedStudio();
    expect(readHostedStudio()).toBe(retry);
    expect(await retry).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  },
);
