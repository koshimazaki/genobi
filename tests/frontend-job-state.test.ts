import { describe, expect, it } from "vitest";
import type { Job } from "../shared/types";
import { parseHiddenJobIds } from "../src/useHiddenJobs";
import { preserveStoppedJobs } from "../src/useJobs";

const job = (id: string, status: Job["status"]): Job => ({ id, status }) as Job;

describe("browser-local gallery hiding", () => {
  it("accepts only non-empty string ids from stored JSON", () => {
    expect([...parseHiddenJobIds('["ready","",4,"stopped"]')]).toEqual([
      "ready",
      "stopped",
    ]);
    expect([...parseHiddenJobIds("not json")]).toEqual([]);
    expect([...parseHiddenJobIds('{"id":"ready"}')]).toEqual([]);
  });
});

describe("stopped job response ordering", () => {
  it("does not let stale poll or history data restart a locally stopped job", () => {
    const current = [job("one", "stopped"), job("two", "Generating")];
    const stale = [job("two", "Ready"), job("one", "Generating")];
    expect(
      preserveStoppedJobs(current, stale).map(({ id, status }) => [id, status]),
    ).toEqual([
      ["two", "Ready"],
      ["one", "stopped"],
    ]);
    expect(preserveStoppedJobs(current, [job("two", "Ready")])).toContainEqual(
      current[0],
    );
  });
});
