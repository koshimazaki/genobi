import { afterAll, beforeAll, expect, it } from "vitest";
import { POPOVER_PROPS } from "../src/director/RegenerateAction";
import { directorShortcut } from "../src/director/shortcuts";

// Regenerate's field is portalled to <body>, outside every panel, where the
// Director owns the timeline keys. Its role keeps Space, Backspace, C and S
// on its own Close and Send buttons. Node has no DOM: a small element tree
// whose `closest` reads tag names and attribute selectors, enough for the
// selectors `timelineCommand` asks about.
class Node {
  parent: Node | null = null;
  constructor(
    readonly tagName: string,
    readonly attrs: Record<string, string> = {},
    children: Node[] = [],
  ) {
    for (const child of children) child.parent = this;
  }
  /** One compound selector, `:not(…)` ignored: `tag[attr="v"][attr]`. */
  private one(part: string) {
    const head = part.trim().replace(/:not\(.*\)$/, "");
    const tag = /^[a-z]+/.exec(head)?.[0];
    if (tag && tag !== this.tagName.toLowerCase()) return false;
    const attrs = [...head.matchAll(/\[([a-z-]+)(?:="([^"]*)")?\]/g)];
    if (!tag && !attrs.length) return false;
    return attrs.every(([, name, value]) =>
      value === undefined ? name in this.attrs : this.attrs[name] === value,
    );
  }
  matches(selector: string) {
    // Split on the commas outside parentheses.
    let depth = 0,
      start = 0;
    const parts: string[] = [];
    for (let i = 0; i < selector.length; i++) {
      if (selector[i] === "(") depth++;
      if (selector[i] === ")") depth--;
      if (selector[i] === "," && !depth) {
        parts.push(selector.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(selector.slice(start));
    return parts.some((part) => this.one(part));
  }
  closest(selector: string): Node | null {
    if (this.matches(selector)) return this;
    return this.parent ? this.parent.closest(selector) : null;
  }
  get dataset() {
    return { panel: this.attrs["data-panel"] };
  }
}
const original = globalThis.Element;
beforeAll(() => {
  globalThis.Element = Node as unknown as typeof Element;
});
afterAll(() => {
  globalThis.Element = original;
});

/** A button in a popover portalled to <body>, with these attributes. */
function button(popover: Record<string, string>) {
  const send = new Node("BUTTON", { type: "submit" });
  new Node("BODY", {}, [new Node("FORM", popover, [send])]);
  return send;
}
const key = (target: Node, code: string, key: string) =>
  ({
    code,
    key,
    target,
    defaultPrevented: false,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
  }) as unknown as KeyboardEvent;

it("keeps the timeline's keys off a button in the Regenerate field", () => {
  const { className, ...rest } = POPOVER_PROPS;
  const send = button({ ...rest, class: className });
  expect(directorShortcut(key(send, "Backspace", "Backspace"))).toBe(undefined);
  expect(directorShortcut(key(send, "Delete", "Delete"))).toBe(undefined);
  expect(directorShortcut(key(send, "Space", " "))).toBe(undefined);
  expect(directorShortcut(key(send, "KeyS", "s"))).toBe(undefined);
});

it("would hand them to the Director without the dialog role", () => {
  // The same button with no role: the regression the role prevents.
  const send = button({ class: POPOVER_PROPS.className });
  expect(directorShortcut(key(send, "Backspace", "Backspace"))).toBe("delete");
  expect(directorShortcut(key(send, "Space", " "))).toBe("play");
});
