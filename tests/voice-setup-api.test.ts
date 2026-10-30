import { afterEach, expect, it, vi } from "vitest";
import { readVoiceSetup, setupRequest } from "../src/voice/setup-api";
const info = {
  token: "test",
  model: "Qwen3-ASR",
  bytes: 100,
  folder: "/tmp/test",
  supported: true,
  browse: false,
  state: { phase: "idle", busy: false, bytes: 0 },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("reads prerequisites without starting installation and permits a fresh retry", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ error: "Offline" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json(info));
  vi.stubGlobal("fetch", request);
  await expect(readVoiceSetup()).rejects.toThrow("Offline");
  await expect(readVoiceSetup()).resolves.toEqual(info);
  expect(request.mock.calls.every(([, init]) => init.method === "GET")).toBe(
    true,
  );
});
it.each([{}, null, { ...info, state: {} }])(
  "rejects malformed successful setup replies: %j",
  async (value) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(value)));
    await expect(readVoiceSetup()).rejects.toThrow("unreadable status");
  },
);
it("bounds a stalled read and aborts it without retrying", async () => {
  vi.useFakeTimers();
  const request = vi.fn(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );
  vi.stubGlobal("fetch", request);
  const result = expect(readVoiceSetup()).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(20_000);
  await result;
  expect(request).toHaveBeenCalledTimes(1);
});
it("does not impose the read timeout on an installation POST", async () => {
  vi.useFakeTimers();
  let finish!: (response: Response) => void;
  const request = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", request);
  const pending = setupRequest("", "POST", { confirmed: true });
  await vi.advanceTimersByTimeAsync(25_000);
  expect(request.mock.calls).toHaveLength(1);
  finish(Response.json({ phase: "environment" }));
  await expect(pending).resolves.toEqual({ phase: "environment" });
});
