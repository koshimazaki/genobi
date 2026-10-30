import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateInput } from "../server/validation";
import {
  composerInput,
  composerReducer,
  initialComposer,
} from "../src/useComposer";
import { input, setup } from "./server-harness";

// An upscale's length is its source clip's, measured on the server; the
// composer's duration fader belongs to the video and music entries. The
// owner's 99-frame tail of a manual split (4.125 s at 24 fps) and the 19 s
// part were refused with "Choose a whole number of seconds between 5 and 20"
// because the composer still held another family's length (LTX's 4 s, Music
// 3's 120 s) and the allowlist checked it against FLUX's fader.
const tail = path.resolve("tests/fixtures/upscale-part-4s.mp4");
const body = path.resolve("tests/fixtures/upscale-part-19s.mp4");
const upscale = {
  ...input,
  generator: "upscale",
  sourceId: "clip-1",
};

describe("an upscale's duration", () => {
  it.each([
    ["flux-3", 4],
    ["flux-3", 120],
    ["flux-3", 4.125],
    ["seedvr2-upscale", 2],
    ["seedvr2-upscale", 19],
    ["flux-3", undefined],
  ])(
    "%s does not judge the composer's leftover %s s against a fader",
    (model, duration) => {
      const parsed = validateInput({ ...upscale, model, duration });
      // A whole second inside FLUX's 5–20, so a replay of any upscale
      // recorded before this rule hashes the same (`canonicalInput`).
      expect(Number.isInteger(parsed.duration)).toBe(true);
      expect(parsed.duration).toBeGreaterThanOrEqual(5);
      expect(parsed.duration).toBeLessThanOrEqual(20);
    },
  );

  it("keeps a recorded upscale's value as it was, so replays still match", () => {
    for (const duration of [5, 7, 20])
      expect(validateInput({ ...upscale, duration }).duration).toBe(duration);
  });

  it("still refuses a video length outside the entry's own range", () => {
    expect(() => validateInput({ ...input, duration: 4 })).toThrow(
      "Choose a whole number of seconds between 5 and 20.",
    );
    expect(() => validateInput({ ...input, duration: 120 })).toThrow(
      "between 5 and 20",
    );
  });
});

describe("switching families in the composer", () => {
  it("moves Music 3's 120 s to the video entry's range before a request", () => {
    // The studio may open on a clip with no recorded scene, so state one.
    const music = composerReducer(initialComposer, {
      type: "update",
      patch: {
        generator: "audio",
        model: "minimax-music-3",
        duration: 120,
        description: "A creature in a forest.",
      },
    });
    expect(music.duration).toBe(120);
    const video = composerReducer(music, {
      type: "update",
      patch: { generator: "video", model: "flux-3" },
    });
    expect(video.duration).toBe(20);
    expect(() => validateInput(composerInput(video))).not.toThrow();
  });

  it("sends an upscale the server accepts whatever length the composer held", () => {
    const ltx = composerReducer(initialComposer, {
      type: "update",
      patch: { generator: "video", model: "ltx-2.5", duration: 4 },
    });
    expect(ltx.duration).toBe(4);
    const up = composerReducer(ltx, {
      type: "update",
      patch: { generator: "upscale", model: "flux-3", sourceId: "clip-1" },
    });
    expect(() => validateInput(composerInput(up))).not.toThrow();
  });
});

describe("quoting a split's parts on the local server", () => {
  it.each([
    ["the 4.125 s tail", tail],
    ["the 19 s part", body],
  ])(
    "quotes FLUX Video Upscale of %s with a carried-over length",
    async (_label, file) => {
      const app = await setup();
      const uploaded = await fetch(
        `${app.base}/api/uploads?filename=part.mp4`,
        {
          method: "POST",
          headers: { cookie: app.cookie, "Content-Type": "video/mp4" },
          body: new Uint8Array(await readFile(file)),
        },
      );
      expect(uploaded.status).toBe(201);
      const { source } = await uploaded.json();
      for (const duration of [4, 120]) {
        const quoted = await fetch(`${app.base}/api/quotes`, {
          method: "POST",
          headers: { cookie: app.cookie, "Content-Type": "application/json" },
          body: JSON.stringify({ ...upscale, sourceId: source.id, duration }),
        });
        expect(quoted.status, await quoted.clone().text()).toBe(201);
      }
      // A quote prices; it never submits.
      expect(app.bfl.submissions).toBe(0);
    },
  );
});
