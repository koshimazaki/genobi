// "Send to Genobi" from World Builder (issues #18, #23): a bounded summary of
// the set, the message the agent receives, and the agent context that says
// World Builder is open. Fakes only: nothing starts, captures or spends.
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgentMessageRequest,
  AgentSession,
} from "../shared/agent-session";
import { AGENT_PROMPT_MAX, parseAgentMessage } from "../shared/agent-session";
import { parseWorld, WORLD_SUMMARY_MAX } from "../shared/agent-context-world";
import { contextBlock, parseAgentContext } from "../shared/agent-context";
import { scopedContext } from "../server/agent-scope";
import { presetRecipe, type Recipe } from "../src/world-builder/recipe";
import {
  MESSAGE_PROMPT_MAX,
  sceneSummary,
  worldMessage,
  worldRoom,
} from "../src/world-builder/world-agent";
import { NO_DIRECTION, sendWorldScene } from "../src/world-builder/world-send";
import {
  currentWorld,
  forgetWorldPreset,
  noteWorld,
  noteWorldPreset,
  resetWorldContext,
} from "../src/agent/world-context";
import { resetStudioContext, studioContext } from "../src/agent/studio-context";

const RUNNING: AgentSession = {
  id: "11111111-1111-4111-8111-111111111111",
  runner: "hermes",
  status: "running",
  prompt: "Build the set",
  startedAt: "2026-10-29T12:00:00.000Z",
  lines: [],
  live: true,
};

function crowded(): Recipe {
  const base = presetRecipe("Cathedral");
  const extra = Array.from({ length: 24 - base.objects.length }, (_, i) => ({
    ...base.objects[0],
    id: `${"x".repeat(44)}-${String(i).padStart(2, "0")}`,
  }));
  return { ...base, objects: [...base.objects, ...extra] };
}

afterEach(() => {
  resetWorldContext();
  resetStudioContext();
});

describe("the scene summary", () => {
  it("names the room, character, shot, frames and object ids", () => {
    const recipe = presetRecipe("Cathedral");
    expect(worldRoom(recipe)).toBe("Cathedral");
    const line = sceneSummary(recipe, "Cathedral");
    expect(line).toContain("preset Cathedral");
    expect(line).toContain("room Cathedral");
    expect(line).toContain(`camera shot ${recipe.cameraShot}`);
    expect(line).toContain(`${recipe.frames} frames`);
    expect(line).toContain("room-floor, room-north");
  });

  it("calls a moved floor a custom room and a bare stage no room", () => {
    const recipe = presetRecipe("Cathedral");
    const moved = {
      ...recipe,
      objects: recipe.objects.map((o) =>
        o.id === "room-floor" ? { ...o, scale: o.scale + 1 } : o,
      ),
    };
    expect(worldRoom(moved)).toBe("custom room");
    expect(sceneSummary(presetRecipe("Studio"))).toContain("room none (stage)");
  });

  it("stays within its bound with 24 long ids and a hostile preset name", () => {
    const line = sceneSummary(crowded(), "Evil\n\x07preset\u0000".repeat(9));
    expect(line.length).toBeLessThanOrEqual(WORLD_SUMMARY_MAX);
    expect(line).toMatch(/and \d+ more$/);
    expect(line).not.toMatch(/[\x00-\x1f\x7f]/);
  });
});

describe("the Send to Genobi message", () => {
  it("is empty without a direction, and sends nothing", async () => {
    const message = vi.fn();
    const spawn = vi.fn();
    expect(worldMessage("  \n ", presetRecipe("Studio"))).toBe("");
    expect(
      await sendWorldScene(" ", presetRecipe("Studio"), undefined, {
        message,
        spawn,
      }),
    ).toBe(NO_DIRECTION);
    expect(message).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("carries the direction, the set and the tools, bounded and clean", () => {
    const text = worldMessage(
      `A ninja falls\x07 in the nave.\n${"y".repeat(5000)}`,
      crowded(),
      "Cathedral",
    );
    expect(text.length).toBeLessThanOrEqual(AGENT_PROMPT_MAX);
    expect(text).toMatch(
      /^Build this scene in World Builder: A ninja falls in/,
    );
    expect(text).toContain("World Builder is open");
    expect(text).toContain("genobi_world_recipe");
    expect(text).toContain("genobi_world (paired");
    expect(text).toContain("Neither spends or captures");
    expect(text).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f]/);
    expect(text.split("Build this scene")[1].length).toBeGreaterThan(
      MESSAGE_PROMPT_MAX,
    );
    // The server takes it as it stands.
    expect(parseAgentMessage({ prompt: text, source: "typed" }).prompt).toBe(
      text,
    );
  });

  it("goes to the running session as its next message", async () => {
    const message = vi.fn(async () => RUNNING);
    const recipe = { ...presetRecipe("Club"), prompt: "Strobe and haze" };
    const note = await sendWorldScene(recipe.prompt, recipe, "Club", {
      latest: () => RUNNING,
      message,
      show: vi.fn(),
    });
    expect(message).toHaveBeenCalledExactlyOnceWith(RUNNING.id, {
      prompt: worldMessage(recipe.prompt, recipe, "Club"),
      source: "typed",
    });
    expect(note).toMatch(/^Sent to the running Hermes session/);
  });

  it("starts a session with the same words when none runs", async () => {
    const spawn = vi.fn(async (_request: AgentMessageRequest) => ({
      ...RUNNING,
      runner: "claude" as const,
    }));
    const recipe = presetRecipe("Studio");
    const note = await sendWorldScene("Wet floor", recipe, undefined, {
      latest: () => undefined,
      active: async () => undefined,
      spawn,
    });
    expect(spawn.mock.calls[0][0]).toEqual({
      prompt: worldMessage("Wet floor", recipe),
      source: "typed",
    });
    expect(note).toMatch(/^Session started with Claude/);
  });

  it("copies the words when the session takes no message", async () => {
    const copy = vi.fn(async () => true);
    const note = await sendWorldScene("Fog", presetRecipe("Studio"), "", {
      latest: () => ({ ...RUNNING, localSessionUrl: "https://example.test" }),
      show: vi.fn(),
      copy,
    });
    expect(copy).toHaveBeenCalledOnce();
    expect(note).toMatch(/^Copied to the clipboard/);
  });
});

describe("World Builder in the agent context", () => {
  it("is read, validated and explained to the agent", () => {
    expect(
      parseWorld({ open: true, preset: "Club\n", summary: "a\tb" }),
    ).toEqual({ open: true, preset: "Club", summary: "a b" });
    expect(() => parseWorld({ open: false })).toThrow(/world/);
    expect(() => parseWorld({ open: true, recipe: {} })).toThrow(/world/);
    expect(() =>
      parseWorld({ open: true, summary: "z".repeat(WORLD_SUMMARY_MAX * 3) }),
    ).toThrow(/world summary/);
    const context = parseAgentContext({ picks: [], world: { open: true } });
    expect(context.world).toEqual({ open: true });
    expect(contextBlock(context)).toContain("`world`, when present");
    expect(
      scopedContext(context, "me", () => true, undefined).context?.world,
    ).toEqual({ open: true });
  });

  it("is kept only beside the project the session is linked to", () => {
    const context = parseAgentContext({
      picks: [],
      world: { open: true, projectId: "night-drive", summary: "room Club" },
    });
    expect(context.world?.projectId).toBe("night-drive");
    const scope = (linked?: string) =>
      scopedContext(context, "me", () => true, undefined, linked).context
        ?.world;
    expect(scope("night-drive")).toEqual(context.world);
    expect(scope("other-project")).toBeUndefined();
    expect(scope(undefined)).toBeUndefined();
    // No project open beside it: kept for a session linked to none.
    const bare = parseAgentContext({ picks: [], world: { open: true } });
    expect(
      scopedContext(bare, "me", () => true, undefined).context?.world,
    ).toEqual({ open: true });
    expect(
      scopedContext(bare, "me", () => true, undefined, "night-drive").context
        ?.world,
    ).toBeUndefined();
    expect(() => parseWorld({ open: true, projectId: "../x" })).toThrow(
      /world project/,
    );
  });

  it("forgets a preset from another project, or once the page closes", () => {
    noteWorld({ open: true, projectId: "night-drive" });
    noteWorldPreset("Club");
    expect(currentWorld()?.preset).toBe("Club");
    // The project changed under the same page: the preset is not reported.
    noteWorld({ open: true, projectId: "day-walk" });
    expect(currentWorld()?.preset).toBeUndefined();
    noteWorld({ open: true, projectId: "night-drive" });
    expect(currentWorld()?.preset).toBe("Club");
    // What useWorldAgent's cleanup runs on unmount or project change.
    forgetWorldPreset();
    expect(currentWorld()?.preset).toBeUndefined();
  });

  it("follows the open page and its last preset into a session start", () => {
    expect(studioContext()?.world).toBeUndefined();
    noteWorld({ open: true, summary: sceneSummary(presetRecipe("Club")) });
    noteWorldPreset("Club");
    expect(currentWorld()?.preset).toBe("Club");
    const world = studioContext()?.world;
    expect(world?.preset).toBe("Club");
    expect(world?.summary).toContain("room Club");
    noteWorld(undefined);
    expect(studioContext()?.world).toBeUndefined();
  });
});
