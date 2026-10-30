import { describe, expect, it, vi } from "vitest";
import { ComfyRouter, durationEstimate } from "../shared/comfy/router";
import { estimateText, jobProgressLine } from "../shared/progress-line";
import type { Job } from "../shared/types";

const key = "comfyui-fixture-private-key";
const statusUrl =
  "https://api.comfy.org/v2/models/ltx/ltx-2-5-fast/requests/req_1/status";
const read = (headers: Record<string, string>) =>
  Response.json({ status: "IN_PROGRESS" }, { headers });

describe("Router's duration estimate", () => {
  it("reads the median, the 90th percentile and where they came from", () => {
    expect(
      durationEstimate(
        read({
          "X-Comfy-Estimated-Duration-Seconds": "38",
          "X-Comfy-Estimated-Duration-P90-Seconds": "61",
          "X-Comfy-Estimate-Source": "historical",
        }),
      ),
    ).toEqual({ seconds: 38, p90Seconds: 61, source: "historical" });
    expect(
      durationEstimate(read({ "X-Comfy-Estimated-Duration-Seconds": "45" })),
    ).toEqual({ seconds: 45, source: "default" });
  });

  it("gives nothing for an absent, malformed or nonsensical estimate", () => {
    expect(durationEstimate(read({}))).toBeUndefined();
    for (const bad of ["", "-3", "0", "4.5", "12s", "9999999"])
      expect(
        durationEstimate(read({ "X-Comfy-Estimated-Duration-Seconds": bad })),
        bad,
      ).toBeUndefined();
    // A 90th percentile below the median is dropped, the median kept.
    expect(
      durationEstimate(
        read({
          "X-Comfy-Estimated-Duration-Seconds": "40",
          "X-Comfy-Estimated-Duration-P90-Seconds": "20",
        }),
      ),
    ).toEqual({ seconds: 40, source: "default" });
  });

  it("travels with an in-progress poll", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { request_id: "req_1", status: "IN_PROGRESS" },
        {
          headers: {
            "X-Comfy-Estimated-Duration-Seconds": "38",
            "X-Comfy-Estimate-Source": "historical",
          },
        },
      ),
    );
    expect(await new ComfyRouter(fetcher).poll(statusUrl, key)).toEqual({
      id: "req_1",
      status: "Generating",
      estimate: { seconds: 38, source: "historical" },
    });
  });
});

describe("the progress line with an estimate", () => {
  const job = (extra: Partial<Job>) =>
    ({
      status: "Generating",
      generator: "video",
      model: "ltx-2.5",
      createdAt: "2026-10-25T10:00:00.000Z",
      ...extra,
    }) as Job;
  const now = Date.parse("2026-10-25T10:00:12.000Z");

  it("adds the estimate in words beside the elapsed seconds, never a bar", () => {
    expect(
      jobProgressLine(
        job({
          estimate: { seconds: 38, p90Seconds: 61, source: "historical" },
        }),
        now,
      ),
    ).toBe("GENERATING LTX VIDEO  12s · ~38s typical, p90 61s");
    expect(
      jobProgressLine(
        job({ estimate: { seconds: 45, source: "default" } }),
        now,
      ),
    ).toBe("GENERATING LTX VIDEO  12s · ~45s default estimate");
  });

  it("prefers real progress and stays plain without an estimate", () => {
    expect(
      jobProgressLine(
        job({ progress: 50, estimate: { seconds: 38, source: "historical" } }),
        now,
      ),
    ).not.toContain("typical");
    expect(jobProgressLine(job({}), now)).toBe("GENERATING LTX VIDEO  12s");
    expect(estimateText(undefined)).toBeUndefined();
  });
});
