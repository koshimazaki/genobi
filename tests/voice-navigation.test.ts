import { describe, expect, it, vi } from "vitest";
import { voiceNavigation } from "../shared/voice-navigation";
import {
  applyVoiceNavigation,
  navigationFor,
  VOICE_WORKSPACES,
} from "../src/voice/voice-navigation-target";
import { presets } from "../src/studio/presets";

describe("voice navigation", () => {
  it.each([
    ["Open the director", "director"],
    ["open director.", "director"],
    ["Show camera", "camera"],
    ["show me the camera", "camera"],
    ["Go to the editor", "editor"],
    ["go to the 3D", "world"],
    ["Open World Builder", "world"],
    ["switch to the gallery please", "gallery"],
    ["Hey Genobi, go back to the gallery", "gallery"],
    ["Can you open the scrolls workspace?", "scrolls"],
    ["take me to dual swords", "dual"],
    ["OPEN PROJECT TOOLS", "tools"],
    ["bring up the ninja view", "ninja"],
  ])("%s → %s", (words, id) => {
    expect(navigationFor(words)).toBe(id);
  });

  it.each([
    "open a door in the director scene",
    "show the camera move",
    "go to the editor and trim the second clip",
    "director",
    "make the director cut louder",
    "open the fridge",
    "I want to generate an image of a gallery",
    "show me a camera orbiting a penguin",
    "open the director ".repeat(10),
    "",
  ])("leaves %j to the agent", (words) => {
    expect(navigationFor(words)).toBeNull();
  });

  it("answers to every workspace the studio's navigation lists", () => {
    expect(VOICE_WORKSPACES.map((w) => w.id)).toEqual(presets.map((p) => p.id));
    for (const p of presets)
      expect(navigationFor(`open the ${p.label}`)).toBe(p.id);
  });

  it("treats names as text, not patterns", () => {
    expect(voiceNavigation("open a.b", [{ id: "x", names: ["a.b"] }])).toBe(
      "x",
    );
    expect(voiceNavigation("open axb", [{ id: "x", names: ["a.b"] }])).toBe(
      null,
    );
  });

  it("switches through the shell's select, and only with a shell", () => {
    const select = vi.fn();
    expect(applyVoiceNavigation("open the director", { select })).toBe(
      "Director",
    );
    expect(select).toHaveBeenCalledWith("director");
    expect(
      applyVoiceNavigation("open a door in the director", { select }),
    ).toBeNull();
    expect(applyVoiceNavigation("open the director", null)).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });
});
