import { describe, expect, it, vi } from "vitest";
import { BflClient } from "../server/bfl";

describe("BFL account balance", () => {
  it("uses the documented read-only endpoint, accepts zero and never puts the key in the URL", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ credits: 0 }));
    expect(await new BflClient(fetcher).credits("fixture-private-key")).toBe(0);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.bfl.ai/v1/credits",
      expect.objectContaining({
        headers: { "x-key": "fixture-private-key", accept: "application/json" },
        redirect: "manual",
        cache: "no-store",
      }),
    );
  });
  it.each([null, {}, { credits: "500" }, { credits: -1 }])(
    "rejects an invalid balance: %j",
    async (payload) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(payload));
      await expect(
        new BflClient(fetcher).credits("fixture-private-key"),
      ).rejects.toThrow("invalid credit balance");
    },
  );
  it("does not expose provider error bodies or credentials", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("fixture-private-key", { status: 401 }));
    await expect(
      new BflClient(fetcher).credits("fixture-private-key"),
    ).rejects.toThrow("The API key was not accepted.");
  });
  it("makes network failure retryable without claiming a zero balance", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("fixture-private-key"));
    await expect(
      new BflClient(fetcher).credits("fixture-private-key"),
    ).rejects.toThrow("Could not check the BFL balance. Try again.");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

it("refuses a redirect without forwarding the key to its destination", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: "https://untrusted.example/" },
    }),
  );
  await expect(
    new BflClient(fetcher).credits("fixture-private-key"),
  ).rejects.toThrow("BFL could not complete the request.");
  expect(fetcher).toHaveBeenCalledOnce();
});
