// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import AnchoredPopover from "../src/components/AnchoredPopover";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

/** The menu a row header opens, re-rendered with a new inline `close`. */
function render(anchor: HTMLElement, frame: number, closed: () => void) {
  act(() =>
    root!.render(
      <AnchoredPopover
        anchor={anchor}
        label="Row actions"
        role="menu"
        close={() => closed()}
      >
        <span data-frame={frame} />
        {["Move up", "Move down", "Remove layer"].map((label) => (
          <button key={label} data-choice>
            {label}
          </button>
        ))}
      </AnchoredPopover>,
    ),
  );
}

it("keeps the keyboard position when its parent re-renders", () => {
  const anchor = document.createElement("button");
  const host = document.createElement("div");
  document.body.append(anchor, host);
  root = createRoot(host);
  let closes = 0;
  render(anchor, 0, () => closes++);
  const menu = document.querySelector('[role="menu"]')!;
  expect(document.activeElement?.textContent).toBe("Move up");
  act(() => {
    menu.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  expect(document.activeElement?.textContent).toBe("Move down");
  // Playback re-renders the parent every frame with a fresh `close`.
  for (let f = 1; f < 5; f++) render(anchor, f, () => closes++);
  expect(document.activeElement?.textContent).toBe("Move down");
  // The latest `close` still runs on an outside pointer.
  act(() => {
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
  expect(closes).toBe(1);
});

it("lines its right edge up with the anchor's only when asked", () => {
  const anchor = document.createElement("button");
  anchor.getBoundingClientRect = () =>
    ({ left: 900, right: 955, top: 500, bottom: 544 }) as DOMRect;
  const host = document.createElement("div");
  document.body.append(anchor, host);
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: 1440,
  });
  root = createRoot(host);
  const place = (align?: "start" | "end") => {
    act(() =>
      root!.render(
        <AnchoredPopover
          anchor={anchor}
          label="Panel"
          width={300}
          align={align}
          close={() => {}}
        >
          <button data-choice>Choice</button>
        </AnchoredPopover>,
      ),
    );
    return parseFloat(
      document.querySelector<HTMLElement>('[role="dialog"]')!.style.left,
    );
  };
  try {
    expect(place()).toBe(900);
    expect(place("end")).toBe(955 - 300);
  } finally {
    Reflect.deleteProperty(document.documentElement, "clientWidth");
  }
});
