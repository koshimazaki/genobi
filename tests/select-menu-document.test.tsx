// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import SelectMenu from "../src/components/SelectMenu";

// A popped-out World Builder panel is a React portal into a second window's
// document (Document Picture-in-Picture). Its select popover must open, size
// and close against that window, while the main document behaves as before.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function mount(target: HTMLElement) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const select = (
    <SelectMenu
      id="move"
      label="Camera move"
      value="a"
      onChange={() => {}}
      options={options}
      portal
    />
  );
  act(() =>
    root!.render(
      target === document.body ? select : createPortal(select, target),
    ),
  );
}
const trigger = (doc: Document) =>
  doc.querySelector<HTMLButtonElement>("#move")!;
const listbox = (doc: Document) => doc.querySelector('[role="listbox"]');

describe("SelectMenu across documents", () => {
  it("opens in the main document as before", () => {
    mount(document.body);
    act(() => trigger(document).click());
    expect(listbox(document)?.parentElement).toBe(document.body);
    act(() =>
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      ),
    );
    expect(listbox(document)).toBeNull();
  });

  it("portals, sizes and closes within a second window's document", () => {
    const pip = new JSDOM("<!doctype html><body></body>").window;
    Object.defineProperty(pip, "innerWidth", { value: 240 });
    Object.defineProperty(pip, "innerHeight", { value: 400 });
    const mountPoint = pip.document.createElement("div");
    pip.document.body.append(mountPoint);
    mount(mountPoint as unknown as HTMLElement);

    act(() => trigger(pip.document as unknown as Document).click());
    const list = listbox(pip.document as unknown as Document) as HTMLElement;
    expect(list).not.toBeNull();
    expect(list.parentElement).toBe(pip.document.body);
    expect(listbox(document)).toBeNull();
    // Sized to the PiP window (240 wide), not the main one.
    expect(parseFloat(list.style.width)).toBeLessThanOrEqual(240 - 24);

    // A click elsewhere in the PiP window closes it; one in the main page,
    // which the PiP never sees, does not.
    act(() =>
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      ),
    );
    expect(listbox(pip.document as unknown as Document)).not.toBeNull();
    act(() =>
      pip.document.body.dispatchEvent(
        new pip.PointerEvent("pointerdown", { bubbles: true }),
      ),
    );
    expect(listbox(pip.document as unknown as Document)).toBeNull();
    pip.close();
  });
});
