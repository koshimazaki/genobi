import { describe, expect, it } from "vitest";
import { applyRoom } from "../src/world-builder/apply-room";

// Apply room: the take's WAV is uploaded, Space puts the room on all of it,
// and the result is added to the project's assets. Never a paid route.
describe("Apply room", () => {
  it("uploads the WAV, runs Space over its length and adds the result", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.startsWith("/api/uploads"))
        return Response.json(
          { source: { id: "up-1", duration: 6.0417 } },
          { status: 201 },
        );
      if (url === "/api/media/space")
        return Response.json({ source: { id: "sp-1" } }, { status: 201 });
      return new Response(new Uint8Array([82, 73, 70, 70]));
    }) as typeof fetch;
    const added: { filename: string; use: string; size: number }[] = [];
    const result = await applyRoom(
      new Blob([new Uint8Array(8)], { type: "audio/wav" }),
      "take-1",
      { preset: "cathedral", label: "Cathedral" },
      async (media) => {
        added.push({
          filename: media.filename,
          use: media.use,
          size: media.blob.size,
        });
        return {
          assetId: "a1",
          added: true,
          use: media.use,
          filename: media.filename,
        };
      },
      fetcher,
    );
    expect(calls.map((c) => c.url)).toEqual([
      "/api/uploads?filename=take-1.wav",
      "/api/media/space",
      "/api/clips/sp-1",
    ]);
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      sourceId: "up-1",
      segments: [{ start: 0, end: 6.04, preset: "cathedral", level: "mid" }],
    });
    expect(added).toEqual([
      { filename: "take-1-cathedral.wav", use: "production", size: 4 },
    ]);
    expect(result.assetId).toBe("a1");
  });

  it("says the local server is needed when Space is not there", async () => {
    const fetcher = (async () =>
      new Response("<html>", { status: 404 })) as unknown as typeof fetch;
    await expect(
      applyRoom(
        new Blob([]),
        "t",
        { preset: "cathedral", label: "Cathedral" },
        async () => {
          throw new Error("not reached");
        },
        fetcher,
      ),
    ).rejects.toThrow("local studio server");
  });
});
