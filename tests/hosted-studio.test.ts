import { afterEach, beforeEach, expect, it, vi } from "vitest";
const HOSTED_HEALTH = { ok: true, hasServerKey: false, hosted: true };

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it.each([true, false])(
  "retry never clears a confirmed hosted answer (%s)",
  async (fixed) => {
    const request = vi.fn(async () =>
      Response.json({ ...HOSTED_HEALTH, hosted: fixed }),
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
  resolve(Response.json(HOSTED_HEALTH));
  expect(await pending).toBe(true);
  expect(request).toHaveBeenCalledOnce();
});

it.each(["network", "invalid"])(
  "retry clears only a failed/undefined answer (%s)",
  async (failure) => {
    const request = vi.fn().mockResolvedValue(Response.json(HOSTED_HEALTH));
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

it("uses health identity even when hosted deployment settings are editable", async () => {
  const request = vi.fn(async (url: string) =>
    Response.json(
      url === "/api/health"
        ? HOSTED_HEALTH
        : {
            revision: 3,
            location: "deployment",
            fixed: false,
            choices: ["cloud", "deployment"],
          },
    ),
  );
  vi.stubGlobal("fetch", request);
  const { readHostedStudio } = await import("../src/hosted-studio");
  expect(await readHostedStudio()).toBe(true);
  expect(request).toHaveBeenCalledExactlyOnceWith("/api/health", {
    cache: "no-store",
  });
});

it("recognises a valid local health response without a hosted field", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ ok: true, hasServerKey: true, keysRevision: 4 }),
    ),
  );
  const { readHostedStudio } = await import("../src/hosted-studio");
  expect(await readHostedStudio()).toBe(false);
});

it("reads a hosted answer that names the build it serves", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ...HOSTED_HEALTH, commit: "e1b7144" })),
  );
  const { readHostedStudio } = await import("../src/hosted-studio");
  expect(await readHostedStudio()).toBe(true);
});

it.each([
  { ok: true },
  { ok: false, hasServerKey: false },
  { ok: true, hasServerKey: false, hosted: "true" },
])("does not infer a local server from malformed health %#", async (health) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(health)),
  );
  const { readHostedStudio } = await import("../src/hosted-studio");
  expect(await readHostedStudio()).toBeUndefined();
});
