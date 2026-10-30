import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PROGRAMS, frameText, copper } from "../shared/ascii/programs";
import {
  activityNow,
  jobActivity,
  publishActivity,
  setActivity,
  setBusy,
} from "../src/busy";
import AsciiScreen, { frameRuns } from "../src/deck/AsciiScreen";
import GenobiDeck from "../src/deck/GenobiDeck";

describe("Genobi's ASCII programs", () => {
  it("fill every cell with one width-1 character and a colour", () => {
    for (const [name, program] of Object.entries(PROGRAMS)) {
      const f = program(20, 5, 1234);
      expect(f.cells.length, name).toBe(20 * 5 * 3);
      for (let i = 0; i < f.cells.length; i += 3) {
        expect(f.cells[i], name).toBeGreaterThanOrEqual(0x20);
        expect(f.cells[i], name).toBeLessThan(0x10000);
      }
      expect(frameText(f).split("\n")).toHaveLength(5);
    }
  });

  it("move with time and repeat for the same time", () => {
    const a = frameText(PROGRAMS.metaballs(24, 4, 1000));
    expect(frameText(PROGRAMS.metaballs(24, 4, 1000))).toBe(a);
    expect(frameText(PROGRAMS.metaballs(24, 4, 4000))).not.toBe(a);
  });

  it("draw as coloured runs, neighbours of one colour sharing a span", () => {
    const runs = frameRuns(copper(10, 2, 0));
    expect(runs).toHaveLength(2);
    expect(runs[0].map((r) => r.text).join("")).toHaveLength(10);
    expect(runs[0].length).toBeLessThanOrEqual(10);
    const markup = renderToStaticMarkup(
      <AsciiScreen program="rain" columns={12} rows={3} />,
    );
    expect(markup).toContain('aria-hidden="true"');
  });
});

describe("the activity store", () => {
  it("keeps one current line per worker", () => {
    setActivity("job-1", "GENERATING KLEIN IMAGE  12s");
    setActivity("job-1", "GENERATING KLEIN IMAGE  13s");
    setBusy("swap", true, "DIRECTOR SWAP");
    expect(activityNow().map((a) => a.line)).toEqual([
      "GENERATING KLEIN IMAGE  13s",
      "DIRECTOR SWAP",
    ]);
    setActivity("job-1", undefined);
    setBusy("swap", false);
    expect(activityNow()).toEqual([]);
  });
});

describe("the deck", () => {
  it("renders closed and ready on the server, with its bar as the toggle", () => {
    const markup = renderToStaticMarkup(<GenobiDeck />);
    expect(markup).toContain('aria-label="Genobi terminal"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("GENOBI");
    expect(markup).toContain("READY");
    expect(markup).not.toContain("deck-body");
  });
});

describe("activity owned by pollers", () => {
  const job = (id: string, status: string) =>
    ({
      id,
      status,
      generator: "video",
      model: "ltx-2.5",
      createdAt: "2026-10-24T10:00:00.000Z",
    }) as never;

  it("keeps a job listed while any owner holds it running", () => {
    const now = Date.parse("2026-10-24T10:00:05.000Z");
    publishActivity("app", jobActivity([job("a", "Generating")], now));
    publishActivity("swap", jobActivity([job("a", "Generating")], now));
    // One view stops holding it: the job is still running for the other.
    publishActivity("swap", new Map());
    expect(activityNow().map((a) => a.id)).toEqual(["job-a"]);
    expect(activityNow()[0].line).toBe("GENERATING LTX VIDEO  5s");
    publishActivity("app", jobActivity([job("a", "Ready")], now));
    expect(activityNow()).toEqual([]);
  });

  it("lists only running jobs, one entry per job", () => {
    const lines = jobActivity(
      [job("a", "Pending"), job("b", "Ready"), job("c", "Generating")],
      Date.parse("2026-10-24T10:00:00.000Z"),
    );
    expect([...lines.keys()]).toEqual(["job-a", "job-c"]);
  });
});
