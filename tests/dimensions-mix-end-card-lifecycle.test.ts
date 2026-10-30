// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as card from "../docs/director-bundle/example/graphics/mix-end-card.mjs";
import { dimensionsMix } from "../shared/templates/dimensions-mix";

// The end card's own lifecycle, without the effect: the frame it builds is
// a hidden iframe, so a host that disposes the layer mid-build must not
// leave one behind (an inspector edit recreates the layer each time).
const parameters = dimensionsMix.mix!.cut.layers.find(
  (l) => l.id === "end-card",
)!.parameters;
const { createLayer } = card;
// The recipe's own helper; the shared *.mjs declaration names createLayer only.
const { wellFormed } = card as unknown as {
  wellFormed: (p: Record<string, unknown>) => Record<string, unknown>;
};
const frames = () => document.querySelectorAll("iframe").length;

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("the end card's frame", () => {
  it("leaves no frame behind when disposed while a build is pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => "",
        blob: async () => new Blob(["x"]),
      })),
    );
    const canvas = document.createElement("canvas");
    const layer = await createLayer({
      canvas,
      width: 960,
      height: 540,
      parameters,
      libraries: {},
      renderer: undefined as never,
    });
    const pending = layer.render({ timeSeconds: 1 });
    // The build has put its frame in the page and waits for it to load.
    await vi.waitFor(() => expect(frames()).toBe(1));
    layer.dispose();
    await expect(pending).resolves.toBeUndefined();
    expect(frames()).toBe(0);
    // A render after disposal builds nothing.
    await layer.render({ timeSeconds: 2 });
    expect(frames()).toBe(0);
  });
});

describe("the end card's words", () => {
  it("draws a lone surrogate as U+FFFD, so the frame can still be encoded", () => {
    const out = wellFormed({
      ...parameters,
      title: "GENOBI\udc00",
      credit2: "A\ud800B",
    });
    expect(out.title).toBe("GENOBI�");
    expect(out.credit2).toBe("A�B");
    expect(() => encodeURIComponent(String(out.title))).not.toThrow();
    // Pairs and other values are left alone.
    expect(wellFormed({ title: "🎵 MIX", duration: 2.6 })).toEqual({
      title: "🎵 MIX",
      duration: 2.6,
    });
  });
});
