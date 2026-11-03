// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useWorldShortcuts } from "../src/world-builder/useWorldShortcuts";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { WorldEditor } from "../src/world-builder/useWorldEditor";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
it("keeps Space for a focused settings button, while canvas Space still plays", () => {
  const s = {
    ready: true,
    busy: false,
    playing: false,
    audioURL: "blob:control",
    setPlaying: vi.fn(),
  } as unknown as BuilderSession;
  const e = { mode: "shot" } as WorldEditor;
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  function Harness() {
    const surface = useRef<HTMLDivElement>(null);
    useWorldShortcuts(s, e, true, surface);
    return (
      <div ref={surface}>
        <button>Prepare room sound</button>
        <canvas tabIndex={0} />
      </div>
    );
  }
  try {
    act(() => root.render(<Harness />));
    const press = (element: Element) =>
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          key: " ",
          bubbles: true,
          cancelable: true,
        }),
      );
    expect(press(host.querySelector("button")!)).toBe(true);
    expect(s.setPlaying).not.toHaveBeenCalled();
    act(() => {
      expect(press(host.querySelector("canvas")!)).toBe(false);
    });
    expect(s.setPlaying).toHaveBeenCalledWith(true);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
