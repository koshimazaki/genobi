import { describe, expect, it, vi } from "vitest";
import { BflClient } from "../server/bfl";

const url = "https://api.bfl.ai/v1/get_result?id=fixture-task";
describe("BFL terminal errors over HTTP 500", () => {
  it("recognizes an Error for the requested task without exposing provider details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          id: "fixture-task",
          status: "Error",
          result: null,
          progress: null,
          details: { private: "do not expose" },
          cost: 30,
        },
        { status: 500 },
      ),
    );
    expect(await new BflClient(fetcher).poll(url, "test-only-key")).toEqual({
      id: "fixture-task",
      status: "Error",
      cost: 30,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([
    { status: "Error" },
    { id: "different-task", status: "Error" },
    { id: "fixture-task", status: "Generating" },
    { error: "upstream unavailable" },
    null,
  ])(
    "keeps generic or unrelated server failures retryable: %j",
    async (body) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(body, { status: 500 }));
      await expect(
        new BflClient(fetcher).poll(url, "test-only-key"),
      ).rejects.toMatchObject({ code: "provider_500" });
    },
  );
  it("does not interpret HTML outage responses as terminal jobs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("<html>Unavailable</html>", { status: 503 }),
      );
    await expect(
      new BflClient(fetcher).poll(url, "test-only-key"),
    ).rejects.toThrow("BFL could not complete");
  });
});
