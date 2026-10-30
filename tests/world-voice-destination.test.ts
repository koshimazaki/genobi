// World Builder's scene direction as a voice destination (issues #18, #23):
// registered while the page is open, filled through the session's change,
// within the recipe's limit, and never read as a Camera request there.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fillWorldPrompt,
  onWorldPrompt,
  WORLD_PROMPT_ID,
  WORLD_PROMPT_MAX,
  worldPromptOpen,
} from "../src/voice/world-prompt-target";
import {
  isComposerPrompt,
  promptLabel,
  readsAsCameraRequest,
  type PromptField,
} from "../src/voice/prompt-target";

const field = (id: string) => ({ id }) as PromptField;
let unmount = () => {};
afterEach(() => unmount());

describe("the World Builder voice destination", () => {
  it("takes nothing while World Builder is closed", () => {
    expect(worldPromptOpen()).toBe(false);
    expect(fillWorldPrompt("a cathedral at dusk")).toBe(false);
  });

  it("writes the words through the registered change, within the recipe's limit", () => {
    const change = vi.fn();
    unmount = onWorldPrompt(change);
    expect(worldPromptOpen()).toBe(true);
    expect(fillWorldPrompt("a ninja falls in the cathedral")).toBe(true);
    expect(change).toHaveBeenCalledExactlyOnceWith(
      "a ninja falls in the cathedral",
    );
    fillWorldPrompt("x".repeat(WORLD_PROMPT_MAX + 50));
    expect(change.mock.calls[1][0]).toHaveLength(WORLD_PROMPT_MAX);
  });

  it("the newest registration wins, and an old cleanup leaves it in place", () => {
    const first = vi.fn();
    const second = vi.fn();
    const dropFirst = onWorldPrompt(first);
    unmount = onWorldPrompt(second);
    dropFirst();
    expect(worldPromptOpen()).toBe(true);
    fillWorldPrompt("rain on the club floor");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    unmount();
    expect(worldPromptOpen()).toBe(false);
  });

  it("is a named prompt that ends on no Generate button", () => {
    expect(promptLabel(field(WORLD_PROMPT_ID) as HTMLTextAreaElement)).toBe(
      "World Builder scene direction",
    );
    expect(isComposerPrompt(field(WORLD_PROMPT_ID))).toBe(false);
    expect(isComposerPrompt(field("description"))).toBe(true);
  });

  it("keeps a spoken scene a scene direction while World Builder takes it", () => {
    expect(readsAsCameraRequest(field(WORLD_PROMPT_ID), false)).toBe(false);
    expect(readsAsCameraRequest(field("scroll-prompt"), false)).toBe(false);
    // Scene panel closed, World Builder open: the registration takes it.
    expect(readsAsCameraRequest(undefined, true)).toBe(false);
    // A Camera prompt on screen beside World Builder still reads requests.
    expect(readsAsCameraRequest(field("description"), true)).toBe(true);
    expect(readsAsCameraRequest(undefined, false)).toBe(true);
  });
});
