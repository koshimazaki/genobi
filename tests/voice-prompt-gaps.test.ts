// Dictation with an LTX gap open (#81): the Tool prompt destination fills the
// gap on screen, names it, and ends on the priced Generate; a spoken request
// still writes its subject into the main prompt. A minimal DOM stands in for
// the page: the router only reads ids, visibility and the value setter.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptySlots } from "../shared/ltx-prompt";
import { gapFieldId } from "../src/ltx-composer";
import {
  composerReducer,
  initialComposer,
  markEdit,
  type ComposerState,
} from "../src/useComposer";
import {
  applyVoiceIntent,
  composerIntentTarget,
  onVoiceIntent,
} from "../src/voice/voice-intent-target";

class FakeTextArea {
  maxLength = 1200;
  disabled = false;
  readOnly = false;
  visible = true;
  events: string[] = [];
  focused = false;
  #value = "";
  constructor(public id: string) {}
  get value() {
    return this.#value;
  }
  set value(text: string) {
    this.#value = text;
  }
  checkVisibility() {
    return this.visible;
  }
  dispatchEvent(event: Event) {
    this.events.push(event.type);
    return true;
  }
  focus() {
    this.focused = true;
  }
}

let fields: Map<string, FakeTextArea>;
let listeners: Map<string, (event: unknown) => void>;
const generate = {
  disabled: false,
  focused: false,
  focus() {
    this.focused = true;
  },
};

/** The page with the composer showing these field ids. */
function page(...ids: string[]) {
  fields = new Map(ids.map((id) => [id, new FakeTextArea(id)]));
  return fields;
}

beforeEach(() => {
  vi.resetModules();
  listeners = new Map();
  generate.disabled = false;
  generate.focused = false;
  vi.stubGlobal("HTMLTextAreaElement", FakeTextArea);
  vi.stubGlobal("HTMLDivElement", class {});
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => run());
  vi.stubGlobal("document", {
    getElementById: (id: string) => fields.get(id) ?? null,
    querySelector: (selector: string) =>
      selector === ".composer .generate-button"
        ? generate
        : ([...fields.values()].find((f) => selector.includes(`#${f.id}`)) ??
          null),
    addEventListener: (type: string, run: (event: unknown) => void) =>
      listeners.set(type, run),
    removeEventListener: (type: string) => listeners.delete(type),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("dictation with an LTX gap open", () => {
  it("fills the gap on screen, names it and ends on Generate", async () => {
    const target = await import("../src/voice/prompt-target");
    // The Action tab is open: the main prompt's field is not rendered.
    page(gapFieldId("action"));
    const field = target.fillPrompt("She lifts the lamp");
    const action = fields.get("prompt-action")!;
    expect(field).toBe(action);
    expect(action.value).toBe("She lifts the lamp");
    expect(action.events).toEqual(["input"]);
    expect(target.promptLabel(field)).toBe("Action gap");
    expect(target.isComposerPrompt(field!)).toBe(true);
    // Focus is handed to the priced Generate, so Escape there closes Voice.
    const handed = vi.fn();
    target.focusGenerate(field as never, handed);
    expect(generate.focused).toBe(true);
    expect(handed).toHaveBeenCalledWith(generate);
    // A Generate that cannot run yet leaves focus on the gap.
    generate.disabled = true;
    target.focusGenerate(field as never, handed);
    expect(action.focused).toBe(true);
    expect(handed).toHaveBeenLastCalledWith(action);
  });

  it("updates the same gap, and follows the gap the person last worked in", async () => {
    const target = await import("../src/voice/prompt-target");
    page("description", gapFieldId("scene"), gapFieldId("audio"));
    expect(target.promptById("prompt-audio")).toBe(fields.get("prompt-audio"));
    const stop = target.trackPromptFocus();
    listeners.get("focusin")!({ target: fields.get("prompt-scene") });
    expect(target.promptTarget()).toBe(fields.get("prompt-scene"));
    // The gap's tab closed: the prompt on screen takes the words instead.
    fields.get("prompt-scene")!.visible = false;
    expect(target.promptTarget()).toBe(fields.get("description"));
    stop();
    for (const slot of ["scene", "character", "action", "audio"] as const)
      expect(
        target.promptLabel(new FakeTextArea(gapFieldId(slot)) as never),
      ).toMatch(/ gap$/);
  });

  it("keeps a spoken request's subject in the main prompt, not a gap", () => {
    let state: ComposerState = {
      ...initialComposer,
      model: "ltx-2.5",
      slots: { ...emptySlots, action: "She lifts the lamp" },
    };
    const edited = { current: false };
    const stop = onVoiceIntent(
      composerIntentTarget(
        () => state,
        (patch) =>
          markEdit((a) => (state = composerReducer(state, a)), edited, patch),
      ),
    );
    const applied = applyVoiceIntent("make a video with LTX of a lighthouse");
    stop();
    expect(applied?.subject).toBe("a lighthouse");
    expect(state.description).toBe("a lighthouse");
    expect(state.slots).toEqual({
      ...emptySlots,
      action: "She lifts the lamp",
    });
  });
});
