// Picks and context (issue #23): the composer's settings in the studio
// context are the request it would send, so an agent quoting "these
// settings" sends what the server accepts. Each state below, plus a
// description, passes the server's own validateInput.
import { afterEach, describe, expect, it } from "vitest";
import { parseAgentContext } from "../shared/agent-context";
import { validateInput } from "../server/validation";
import {
  composerSettings,
  noteSettings,
  resetStudioContext,
  studioContext,
} from "../src/agent/studio-context";
import { useSettingsStore } from "../src/settings-store";
import {
  composerReducer,
  initialComposer,
  upscaleSource,
  type ComposerState,
} from "../src/useComposer";
import type { Job, Source } from "../shared/types";

afterEach(() => {
  resetStudioContext();
  useSettingsStore.setState({ location: undefined });
});

const update = (state: ComposerState, patch: Partial<ComposerState>) =>
  composerReducer(state, { type: "update", patch });
const room = { mode: "room", preset: "empty_club", level: "high" } as const;
const ltx = update(initialComposer, {
  generator: "video",
  model: "ltx-2.5",
  duration: 6,
});
const states: Record<string, ComposerState> = {
  flux: update(initialComposer, { generator: "video", model: "flux-3" }),
  "Klein still": update(initialComposer, {
    generator: "image",
    model: "flux-3-klein",
    imageResolution: "1.5k",
  }),
  ltx,
  "LTX with AKUSPACE": update(ltx, {
    model: "ltx-2.5-akuspace",
    acoustic: { ...room },
  }),
  "Upscale after LTX": update(ltx, {
    generator: "upscale",
    sourceId: "clip-1",
    upscaleFactor: 2,
  }),
};

/** The context's settings as a request: what the agent would quote. */
function request(state: ComposerState, sourceId?: string) {
  noteSettings(composerSettings(state, sourceId));
  const settings = studioContext()?.settings;
  expect(settings).toBeDefined();
  const { runLocation: _r, light: _l, gaps: _g, ...fields } = settings!;
  return { fields, settings: settings! };
}

describe("the context's settings are a valid request", () => {
  it.each(Object.entries(states))("%s", (_name, state) => {
    const { fields } = request(state);
    const valid = validateInput({ ...fields, description: "A vessel." });
    expect(valid.generator).toBe(fields.generator);
    expect(valid.model ?? "flux-3").toBe(fields.model);
  });

  it("Upscale with no source chosen: the latest Ready video, as Generate resolves it", () => {
    const state = update(ltx, { generator: "upscale", sourceId: "" });
    const ready = {
      id: "job-ready",
      generator: "video",
      status: "Ready",
      createdAt: "2026-10-22T12:00:00Z",
    } as Job;
    const clip = {
      id: "job-ready",
      label: "Harbour",
      url: "/media/job-ready.mp4",
      width: 1280,
      height: 720,
      duration: 5,
      origin: "generated",
      mediaType: "video",
    } as Source;
    const resolved = upscaleSource(state.sourceId, [ready], [clip]);
    expect(resolved?.id).toBe("job-ready");
    const { fields, settings } = request(state, resolved?.id);
    expect(settings.sourceId).toBe("job-ready");
    expect(
      validateInput({ ...fields, description: "A vessel." }).sourceId,
    ).toBe("job-ready");
  });

  it("with the run location Local", () => {
    useSettingsStore.setState({ location: "local" });
    const { fields, settings } = request(states["LTX with AKUSPACE"]);
    expect(settings.runLocation).toBe("local");
    expect(() =>
      validateInput({ ...fields, description: "A vessel." }),
    ).not.toThrow();
  });

  it("names the upscale model and its source after LTX", () => {
    const { settings } = request(states["Upscale after LTX"]);
    expect(settings).toMatchObject({
      generator: "upscale",
      model: "flux-3",
      sourceId: "clip-1",
      upscaleFactor: 2,
    });
    expect(settings).not.toHaveProperty("light");
  });

  it("carries the Acoustic Space treatment, validated", () => {
    const { fields, settings } = request(states["LTX with AKUSPACE"]);
    expect(settings.acoustic).toEqual(room);
    expect(
      validateInput({ ...fields, description: "A vessel." }).acoustic,
    ).toEqual(room);
    // The shared parser holds it to the node's spaces and the wording limit.
    const bad = (acoustic: object) => () =>
      parseAgentContext({
        picks: [],
        settings: { ...settings, acoustic },
      });
    expect(bad({ ...room, level: "loud" })).toThrow(/acoustic/);
    expect(bad({ ...room, text: "x".repeat(601) })).toThrow(/acoustic/);
    expect(
      parseAgentContext({
        picks: [],
        settings: { ...settings, acoustic: { ...room, text: "Wet stone." } },
      }).settings?.acoustic,
    ).toEqual({ ...room, text: "Wet stone." });
  });
});
