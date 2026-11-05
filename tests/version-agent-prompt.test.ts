import { describe, expect, it } from "vitest";
import { AGENT_PROMPT_MAX } from "../shared/agent-session";
import {
  hasVersionAgent,
  versionAgentPrompt,
  VERSION_AGENT_TEMPLATES,
  WITH_WHAT_MAX,
} from "../shared/templates/version-agent";
import { findMixTemplate } from "../shared/templates/catalogue";

const fruits = findMixTemplate("fruits-swap")!;
const asset = {
  id: "asset-2b4c1d2e-0000-4000-8000-000000000001",
  name: "my-pear.png",
  kind: "image" as const,
};

describe("versionAgentPrompt", () => {
  it("names the template, the skill, the asset and the paid-step rule, and quotes the sentence verbatim", () => {
    const prompt = versionAgentPrompt(
      fruits,
      asset,
      "swap the apple with this",
    );
    expect(prompt).toContain(`${fruits.name} template (fruits-swap)`);
    expect(prompt).toContain(
      "Load the skill `fruits-swap` from the Genobi plugin",
    );
    expect(prompt).toContain(
      `the person's reference asset ${asset.id}, file "my-pear.png"`,
    );
    expect(prompt).toContain("as a reference, not a file to swap");
    expect(prompt).toContain('In their words: "swap the apple with this"');
    expect(prompt).toContain("LTX-2.5 Layout-to-Render");
    expect(prompt).toContain("Three.js");
    expect(prompt).toContain(
      "Quote every paid step and wait for the person's approval before you run it",
    );
    expect(prompt).toContain(
      `passes ${asset.id} as an image reference, set allowInspirationAsInput: true`,
    );
    expect(prompt.split("\n")).toHaveLength(7);
  });

  it("names the opt-in only for an image, which is kept as an Inspiration", () => {
    const track = versionAgentPrompt(
      fruits,
      { ...asset, name: "song.mp3", kind: "audio" },
      "use this song",
    );
    expect(track).toContain("as a reference");
    expect(track).not.toContain("allowInspirationAsInput");
    expect(track.split("\n")).toHaveLength(6);
  });

  it("strips control characters and keeps the sentence on one line", () => {
    const prompt = versionAgentPrompt(
      fruits,
      { ...asset, name: "pear\x07\n.png" },
      "  this room\r\ninstead of\x00 the\x1b cathedral\x7f ",
    );
    expect(prompt).toContain('"this room instead of the cathedral"');
    expect(prompt).toContain('file "pear .png"');
    expect(prompt.replace(/\n/g, "")).not.toMatch(/[\x00-\x1f\x7f]/);
  });

  it("refuses an empty or overlong sentence and a strange asset id, and stays within the agent limit", () => {
    expect(() => versionAgentPrompt(fruits, asset, " \x01 ")).toThrow(
      "Say what you want to make.",
    );
    expect(() =>
      versionAgentPrompt(fruits, asset, "a".repeat(WITH_WHAT_MAX + 1)),
    ).toThrow(`under ${WITH_WHAT_MAX}`);
    expect(() =>
      versionAgentPrompt(fruits, { ...asset, id: "../x" }, "use this"),
    ).toThrow("asset id");
    const longest = versionAgentPrompt(
      fruits,
      { ...asset, name: "n".repeat(500) },
      "a".repeat(WITH_WHAT_MAX),
    );
    expect(longest.length).toBeLessThanOrEqual(AGENT_PROMPT_MAX);
    expect(longest).toContain(`"${"n".repeat(120)}"`);
  });
});

it("leaves the reference line out when nothing was dropped", () => {
  const prompt = versionAgentPrompt(
    fruits,
    undefined,
    "make a papaya instead of the apple",
  );
  expect(prompt).toContain("Load the skill `fruits-swap`");
  expect(prompt).toContain(
    'In their words: "make a papaya instead of the apple"',
  );
  expect(prompt).not.toContain("reference");
  expect(prompt).not.toContain("asset-");
  expect(prompt).toContain("Quote every paid step");
});

describe("hasVersionAgent", () => {
  it("is true for the mix templates with a skill and false for others", () => {
    for (const id of VERSION_AGENT_TEMPLATES)
      expect(hasVersionAgent(findMixTemplate(id)!)).toBe(true);
    expect(hasVersionAgent(findMixTemplate("dimensions-mix")!)).toBe(false);
    expect(hasVersionAgent({ id: "fruits-swap" })).toBe(false);
  });
});
