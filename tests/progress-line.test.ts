import { describe, expect, it } from "vitest";
import {
  brailleBar,
  jobProgressLine,
  jobStage,
  progressLine,
} from "../shared/progress-line";
import { jobSummary } from "../mcp/definition";
import type { Job } from "../shared/types";

const job = (extra: Partial<Job> = {}) =>
  ({
    id: "j",
    status: "Generating",
    generator: "image",
    model: "flux-3-klein",
    prompt: "a chair",
    createdAt: "2026-10-24T10:00:00.000Z",
    ...extra,
  }) as Job;

describe("the progress line", () => {
  it("names the stage in the studio's words", () => {
    expect(jobStage(job())).toBe("GENERATING KLEIN IMAGE");
    expect(jobStage(job({ generator: "video", model: "ltx-2.5" }))).toBe(
      "GENERATING LTX VIDEO",
    );
    expect(jobStage(job({ status: "Pending", generator: "upscale" }))).toBe(
      "QUEUED UPSCALE",
    );
  });

  it("draws the bar only for real progress, elapsed seconds otherwise", () => {
    const now = Date.parse("2026-10-24T10:00:12.500Z");
    expect(jobProgressLine(job({ progress: 73 }), now)).toBe(
      `GENERATING KLEIN IMAGE  73% ${brailleBar(0.73)}`,
    );
    expect(jobProgressLine(job(), now)).toBe("GENERATING KLEIN IMAGE  12s");
    expect(progressLine("FINDING THE SUBJECT")).toBe("FINDING THE SUBJECT");
    expect(progressLine("X", 0.5, undefined, 4)).toBe("X  50% ⣿⣿⣀⣀");
  });

  it("reaches agents in every job summary", () => {
    expect(jobSummary(job({ progress: 0.42 })).progressLine).toMatch(
      /^GENERATING KLEIN IMAGE {2}42% [⣀-⣿]{28}$/,
    );
  });
});
