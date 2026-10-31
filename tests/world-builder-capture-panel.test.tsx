import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { presetRecipe, validateRecipe } from "../src/world-builder/recipe";
import { CaptureControls } from "../src/world-builder/CaptureControls";
import { CaptureTiming } from "../src/world-builder/CaptureFormat";
import { SegmentedBank } from "../src/world-builder/CapturePrimitives";
import {
  CAPTURE_ASPECTS,
  DURATION_BANK,
  aspectFor,
  bankChoice,
  captureBadge,
  snapSide,
} from "../src/world-builder/capture-panel";
import { framesForSeconds } from "../src/world-builder/take-duration";
import { TakeLength, commitTypedLength } from "../src/world-builder/TakeLength";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { BuilderAssets } from "../src/world-builder/useBuilderAssets";

function session(patch: Partial<BuilderSession> = {}) {
  return {
    ready: true,
    busy: false,
    playing: false,
    capturing: false,
    recipe: presetRecipe("Playground"),
    take: null,
    error: "",
    progress: 0,
    audioName: "",
    change: vi.fn(),
    ...patch,
  } as unknown as BuilderSession;
}
const assets = (patch: Partial<BuilderAssets> = {}) =>
  ({ saving: "", result: "", ...patch }) as unknown as BuilderAssets;
/** A page that is its own parent: not embedded in an iframe. */
function topLevel(embedded = false) {
  const page: { parent?: unknown } = {};
  page.parent = embedded ? {} : page;
  vi.stubGlobal("window", page);
}
const blob = new Blob([]);
const take = {
  name: "world-take",
  video: blob,
  first: blob,
  depth: blob,
  manifest: blob,
  audio: blob,
};
/** Every button in the markup, by its text or aria-label, with its state. */
function buttons(html: string) {
  return [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(
    ([, attrs, inner]) => ({
      name:
        /aria-label="([^"]*)"/.exec(attrs)?.[1] ??
        inner.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"),
      disabled: /\sdisabled=""/.test(attrs),
      attrs,
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Capture badge", () => {
  const base = {
    capturing: false,
    progress: 0,
    frames: 97,
    take: null,
    liveRecording: false,
  };
  it("is ARMED with nothing held", () => {
    expect(captureBadge(base)).toEqual({
      tone: "armed",
      label: "ARMED",
      pulse: false,
    });
  });
  it("pulses REC with the rendered frames while a take captures", () => {
    expect(
      captureBadge({ ...base, capturing: true, progress: 12, take: {} }),
    ).toEqual({ tone: "rec", label: "REC 12/97", pulse: true });
  });
  it("pulses REC LIVE while Record live runs", () => {
    expect(captureBadge({ ...base, liveRecording: true })).toMatchObject({
      tone: "rec",
      label: "REC LIVE",
      pulse: true,
    });
  });
  it("is READY once a take or a live clip is held", () => {
    expect(captureBadge({ ...base, take: { mode: "fixed" } }).label).toBe(
      "READY · TAKE",
    );
    expect(captureBadge({ ...base, take: { mode: "live" } }).label).toBe(
      "READY · LIVE CLIP",
    );
  });
  it("renders the state into the panel's status strip", () => {
    topLevel();
    const html = renderToStaticMarkup(
      <CaptureControls
        s={session({ capturing: true, busy: true, progress: 12 })}
        a={assets()}
        shot
      />,
    );
    expect(html).toMatch(
      /class="wb-badge" data-tone="rec" data-dot="true" data-pulse="true">REC 12\/97</,
    );
  });
});

describe("Duration bank", () => {
  it("maps each quick length onto the 8k + 1 frame grid", () => {
    const frames = DURATION_BANK.map(framesForSeconds);
    expect(frames).toEqual([25, 49, 73, 97, 121, 193, 241]);
    for (const f of frames) expect((f - 1) % 8).toBe(0);
  });
  it("marks the entry the take's frames land on, and none off the bank", () => {
    expect(bankChoice(97)).toBe(4);
    expect(bankChoice(241)).toBe(10);
    expect(bankChoice(105)).toBeNull();
  });
  it("sets Move seconds, which the recipe turns into the grid's frames", () => {
    const s = session();
    const tree = CaptureTiming({ s, idle: true, setEditable: true });
    const bank = find<Parameters<typeof SegmentedBank>[0]>(tree, SegmentedBank);
    expect(bank.props.value).toBe("4");
    bank.props.onChange("8");
    expect(s.change).toHaveBeenCalledWith({ seconds: 8 });
    const next = validateRecipe({ ...s.recipe, seconds: 8 });
    expect(next.frames).toBe(193);
  });
});

describe("Aspect selection", () => {
  it("keeps every preset divisible by 64 and recognises it", () => {
    for (const a of CAPTURE_ASPECTS) {
      expect(a.width % 64 || a.height % 64).toBe(0);
      expect(aspectFor(a.width, a.height)).toBe(a.key);
    }
    expect(aspectFor(1280, 768)).toBe("custom");
  });
  it("snaps a custom side to 64 within the recipe's range", () => {
    expect(snapSide(1000, "width")).toBe(1024);
    expect(snapSide(90, "height")).toBe(256);
    expect(snapSide(5000, "height")).toBe(1920);
  });
  it("presses the tile for the recipe's size and locks it during a capture", () => {
    topLevel();
    const recipe = { ...presetRecipe("Playground"), width: 704, height: 1280 };
    const idle = buttons(
      renderToStaticMarkup(
        <CaptureControls s={session({ recipe })} a={assets()} shot />,
      ),
    );
    expect(idle.find((b) => b.name === "9:16")?.attrs).toContain(
      'aria-pressed="true"',
    );
    expect(idle.find((b) => b.name === "16:9")?.attrs).toContain(
      'aria-pressed="false"',
    );
    const html = renderToStaticMarkup(
      <CaptureControls
        s={session({ recipe, capturing: true, busy: true })}
        a={assets()}
        shot
      />,
    );
    // The Format fieldset is disabled; Cancel capture stays live.
    expect(html).toMatch(/<fieldset class="wb-capture-column" disabled="">/);
    expect(buttons(html).find((b) => b.name === "Cancel capture")).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });
});

describe("Every existing capture action is still there", () => {
  it("keeps output ahead of optional mounted capture settings", () => {
    topLevel();
    const html = renderToStaticMarkup(
      <CaptureControls s={session()} a={assets()} shot />,
    );
    expect(html.indexOf('aria-label="Output"')).toBeLessThan(
      html.indexOf("Capture settings"),
    );
    expect(html).toMatch(
      /<details class="wb-fold">\s*<summary>Capture settings/,
    );
    expect(html).toContain('aria-label="Quick take length"');
    expect(html).toContain('aria-label="Passes and sync"');
  });
  it("offers capture, still, hand-offs and every export", () => {
    topLevel(true);
    const html = renderToStaticMarkup(
      <CaptureControls
        s={session({ take, audioName: "signal.wav" } as never)}
        a={assets({
          canSend: true,
          toAssets: true,
          room: { label: "Space" },
        } as never)}
        shot
      />,
    );
    const names = buttons(html).map((b) => b.name);
    for (const label of [
      "Capture take",
      "Save PNG",
      "Send first frame to Director",
      "Send take to Comfy",
      "Apply room · Space",
      "Add take to project assets",
      "Video · WebM",
      "First frame",
      "Depth · WebM",
      "Capture receipt",
      "Matching audio · WAV",
      "360° loop · 2 s",
      "Shorter take",
      "Longer take",
    ])
      expect(names).toContain(label);
    expect(html).toContain("Seamless loop");
    expect(html).toContain("Move seconds");
    expect(html).toContain("Export take");
  });
  it("keeps Cancel adding the take while an MP4 encodes", () => {
    topLevel();
    const html = renderToStaticMarkup(
      <CaptureControls s={session()} a={assets({ saving: "take" })} shot />,
    );
    expect(buttons(html).map((b) => b.name)).toContain(
      "Cancel adding the take",
    );
    expect(buttons(html).find((b) => b.name === "Capture take")?.disabled).toBe(
      true,
    );
  });
  it("shows the take length as a typeable seconds field beside its frames", () => {
    const html = renderToStaticMarkup(<TakeLength s={session()} />);
    expect(html).toMatch(
      /<input type="text" inputMode="decimal" aria-label="Take length in seconds, 0.375 to 10.04"[^>]*value="4.04"/,
    );
    expect(html).toContain(">97 f</output>");
  });
  it("puts the recipe's seconds back when a typed length is not taken", async () => {
    const run = vi.fn(async (work: () => Promise<unknown>) =>
      work().then(
        () => true,
        () => false,
      ),
    );
    const taken = { run, change: vi.fn(async () => true) };
    expect(await commitTypedLength("10", 97, taken)).toBeUndefined();
    expect(taken.change).toHaveBeenCalledWith({ frames: 241 });
    const rejected = { run, change: vi.fn(async () => false) };
    expect(await commitTypedLength("10", 97, rejected)).toBe("4.04");
    expect(await commitTypedLength("abc", 97, rejected)).toBe("4.04");
    expect(run).toHaveBeenCalledTimes(1);
    expect(await commitTypedLength("4", 97, rejected)).toBe("4.04");
    expect(rejected.change).toHaveBeenCalledTimes(1);
  });
  it("hides Send take to Comfy outside an iframe", () => {
    topLevel();
    const html = renderToStaticMarkup(
      <CaptureControls s={session()} a={assets()} shot />,
    );
    expect(buttons(html).map((b) => b.name)).not.toContain(
      "Send take to Comfy",
    );
  });
});

/** The first element of `type` in a rendered (hook-free) tree. */
function find<P>(node: ReactNode, type: unknown): ReactElement<P> {
  const stack: ReactNode[] = [node];
  while (stack.length) {
    const next = stack.pop();
    if (Array.isArray(next)) stack.push(...next);
    else if (isValidElement(next)) {
      if (next.type === type) return next as ReactElement<P>;
      stack.push((next.props as { children?: ReactNode }).children);
    }
  }
  throw new Error("Not found");
}
