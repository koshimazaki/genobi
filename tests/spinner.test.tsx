import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import spinners from "cli-spinners";
import { brailleBar, spinnerFrame } from "../src/spinner";
import { busyNow, setBusy } from "../src/busy";
import Spinner from "../src/components/Spinner";
import Wordmark from "../src/components/Wordmark";

describe("terminal spinners", () => {
  it("shows the frame its own interval puts at a time", () => {
    const { frames, interval } = spinners.dots12;
    expect(spinnerFrame("dots12", 0)).toBe(frames[0]);
    expect(spinnerFrame("dots12", interval * 3 + 1)).toBe(frames[3]);
    expect(spinnerFrame("dots12", interval * frames.length)).toBe(frames[0]);
    expect(spinnerFrame("sand", -5)).toBe(spinners.sand.frames[0]);
  });

  it("renders a decorative first frame on the server", () => {
    const markup = renderToStaticMarkup(<Spinner name="sand" />);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain(spinners.sand.frames[0]);
  });
});

describe("the braille bar", () => {
  it("fills full cells and part-fills the edge", () => {
    expect(brailleBar(0, 4)).toBe("⣀⣀⣀⣀");
    expect(brailleBar(1, 4)).toBe("⣿⣿⣿⣿");
    expect(brailleBar(0.5, 4)).toBe("⣿⣿⣀⣀");
    expect(brailleBar(0.73, 28)).toMatch(/^⣿{20}[⣄⣤⣦⣶⣷]⣀{7}$/);
  });

  it("clamps and survives bad numbers", () => {
    expect(brailleBar(2, 3)).toBe("⣿⣿⣿");
    expect(brailleBar(-1, 3)).toBe("⣀⣀⣀");
    expect(brailleBar(Number.NaN, 3)).toBe("⣀⣀⣀");
    expect(brailleBar(0.4)).toHaveLength(28);
  });
});

describe("the busy signal", () => {
  it("is busy while any worker is marked, and idle when the last clears", () => {
    expect(busyNow()).toBe(false);
    setBusy("a", true);
    setBusy("b", true);
    setBusy("a", false);
    expect(busyNow()).toBe(true);
    setBusy("b", false);
    expect(busyNow()).toBe(false);
  });

  it("renders the wordmark idle on the server, so hydration matches", () => {
    setBusy("c", true);
    expect(renderToStaticMarkup(<Wordmark />)).not.toContain("brand-busy");
    setBusy("c", false);
  });
});
