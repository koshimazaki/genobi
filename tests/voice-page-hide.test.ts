// Closing the tab mid-recording frees the prewarm: the page-hide hook and the
// cancel request it sends, without a browser.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelPrewarm, onPageHide } from "../src/voice/api";

afterEach(() => vi.unstubAllGlobals());

describe("a recording on a closing page", () => {
  it("runs the cancel on pagehide, and not after its cleanup", () => {
    const page = new EventTarget();
    const hide = vi.fn();
    const cleanup = onPageHide(page, hide);
    page.dispatchEvent(new Event("pagehide"));
    expect(hide).toHaveBeenCalledTimes(1);
    cleanup();
    page.dispatchEvent(new Event("pagehide"));
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("sends the cancel with keepalive, so it outlives the page", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetch);
    await cancelPrewarm();
    expect(fetch).toHaveBeenCalledWith("/api/voice/prewarm", {
      method: "DELETE",
      keepalive: true,
    });
  });
});

// These fixtures exercise local voice; hosted detection is covered separately.
vi.mock("../src/hosted-studio", () => ({
  readHostedStudio: async () => false,
  useHostedStudio: () => false,
}));
