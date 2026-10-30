import { afterAll, beforeAll, expect, it } from "vitest";
import { directorShortcut } from "../src/director/shortcuts";
import { timelineCommand } from "../src/timeline-keys";

// Node has no DOM: a minimal Element that answers `closest` from a fixed map.
class FakeElement {
  constructor(
    readonly tagName: string,
    private matches: {
      text?: boolean;
      panel?: string;
      dialog?: "host" | "other";
    } = {},
  ) {}
  closest(selector: string) {
    if (selector === "[data-panel]")
      return this.matches.panel
        ? { dataset: { panel: this.matches.panel } }
        : null;
    if (selector.startsWith("dialog"))
      return this.matches.dialog === "other" ? this : null;
    return this.matches.text ? this : null;
  }
}
const original = globalThis.Element;
beforeAll(() => {
  globalThis.Element = FakeElement as unknown as typeof Element;
});
afterAll(() => {
  globalThis.Element = original;
});
const key = (target: FakeElement, code = "Space", extra = {}) =>
  ({
    code,
    key:
      code === "Space"
        ? " "
        : code.startsWith("Key")
          ? code.slice(3).toLowerCase()
          : code,
    target,
    defaultPrevented: false,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...extra,
  }) as unknown as KeyboardEvent;

it("plays from a focused button or slider in a Director panel", () => {
  expect(directorShortcut(key(new FakeElement("BUTTON")))).toBe("play");
  expect(
    directorShortcut(key(new FakeElement("INPUT", { panel: "timeline" }))),
  ).toBe("play");
  expect(directorShortcut(key(new FakeElement("DIV"), "KeyC"))).toBe("split");
});

it("leaves text entry, modifiers and other tools' panels alone", () => {
  expect(
    directorShortcut(key(new FakeElement("TEXTAREA", { text: true }))),
  ).toBe(undefined);
  expect(
    directorShortcut(key(new FakeElement("DIV"), "Space", { metaKey: true })),
  ).toBe(undefined);
  expect(
    directorShortcut(key(new FakeElement("BUTTON", { panel: "dual" }))),
  ).toBe(undefined);
});

it("uses the panel last clicked when nothing has focus", () => {
  const body = new FakeElement("BODY");
  expect(
    directorShortcut(key(body), new FakeElement("DIV") as unknown as Element),
  ).toBe("play");
  expect(
    directorShortcut(
      key(body),
      new FakeElement("CANVAS", { panel: "dual" }) as unknown as Element,
    ),
  ).toBe(undefined);
  expect(
    directorShortcut(
      key(body),
      new FakeElement("CANVAS", { panel: "stage" }) as unknown as Element,
    ),
  ).toBe("play");
});

it("deletes the selected clip with Delete or Backspace", () => {
  expect(directorShortcut(key(new FakeElement("DIV"), "Delete"))).toBe(
    "delete",
  );
  expect(directorShortcut(key(new FakeElement("BUTTON"), "Backspace"))).toBe(
    "delete",
  );
  expect(
    directorShortcut(
      key(new FakeElement("INPUT", { text: true }), "Backspace"),
    ),
  ).toBe(undefined);
});

it("gives Dual Swords the same keys inside its own panel only", () => {
  const dual = (panel: string | undefined) => !panel || panel === "dual";
  const inDual = new FakeElement("BUTTON", { panel: "dual" });
  expect(timelineCommand(key(inDual), dual)).toBe("play");
  expect(timelineCommand(key(inDual, "Backspace"), dual)).toBe("delete");
  expect(
    timelineCommand(key(new FakeElement("DIV", { panel: "timeline" })), dual),
  ).toBe(undefined);
});

it("leaves a modal's keys alone unless it hosts the timeline", () => {
  // A button in the key dialog has no panel, like a standalone page.
  const inKeyDialog = new FakeElement("BUTTON", { dialog: "other" });
  expect(directorShortcut(key(inKeyDialog))).toBe(undefined);
  expect(directorShortcut(key(inKeyDialog, "Delete"))).toBe(undefined);
  const inDirectorDialog = new FakeElement("BUTTON", { dialog: "host" });
  expect(directorShortcut(key(inDirectorDialog))).toBe("play");
});
