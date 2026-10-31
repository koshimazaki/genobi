import { afterEach, expect, it, vi } from "vitest";

// Hosted detection that never answers, as when the health read stalls.
vi.mock("../src/hosted-studio", () => ({
  readHostedStudio: () => new Promise<boolean | undefined>(() => {}),
}));

const { setupRequest } = await import("../src/voice/setup-api");

afterEach(() => vi.useRealTimers());

it("times out a setup read whose hosted check stalls", async () => {
  vi.useFakeTimers();
  const read = setupRequest("");
  const settled = expect(read).rejects.toThrow("Voice setup check timed out");
  await vi.advanceTimersByTimeAsync(20_000);
  await settled;
});

it("honours the caller's abort while the hosted check stalls", async () => {
  const controller = new AbortController();
  const read = setupRequest("", "GET", undefined, controller.signal);
  controller.abort(new Error("closed"));
  await expect(read).rejects.toThrow();
});
