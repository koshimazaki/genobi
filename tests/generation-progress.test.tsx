import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { generationProgress } from "../src/generation-progress";
import JobMedia from "../src/components/JobMedia";
import type { Job } from "../shared/types";

const job = (progress?: number) =>
  ({
    id: "job-1",
    status: "Generating",
    description: "A chair in a cabin",
    generator: "video",
    createdAt: new Date().toISOString(),
    ...(progress === undefined ? {} : { progress }),
  }) as unknown as Job;

describe("provider progress", () => {
  it("accepts either the 0-1 fraction or the 0-100 percentage BFL may send", () => {
    expect(generationProgress(job(0.42))).toBeCloseTo(0.42);
    expect(generationProgress(job(42))).toBeCloseTo(0.42);
  });

  it("reports nothing rather than inventing a number", () => {
    for (const value of [
      undefined,
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ])
      expect(generationProgress(job(value))).toBeUndefined();
  });

  it("holds short of complete while the job is still running", () => {
    expect(generationProgress(job(1))).toBe(0.99);
    expect(generationProgress(job(100))).toBe(0.99);
  });

  it("renders a real bar when the provider reports one", () => {
    const markup = renderToStaticMarkup(<JobMedia job={job(0.42)} />);
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="42"');
    expect(markup).toContain("42%");
  });

  it("falls back to elapsed time when it does not", () => {
    const markup = renderToStaticMarkup(<JobMedia job={job()} />);
    expect(markup).not.toContain("progressbar");
    expect(markup).toContain("s elapsed");
  });
});
