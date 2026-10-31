// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SegmentedBank } from "../src/world-builder/CapturePrimitives";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((close) => close()));

it("changes take length with arrow keys, Home and End through one tab stop", () => {
  const changed = vi.fn();
  let disabled = false;
  function Control() {
    const [value, setValue] = useState("2");
    return (
      <SegmentedBank
        label="Quick take length"
        value={value}
        options={[1, 2, 3].map((seconds) => ({
          value: String(seconds),
          label: `${seconds}s`,
        }))}
        disabled={disabled}
        onChange={(next) => {
          changed(next);
          setValue(next);
        }}
      />
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = () => act(() => root.render(<Control />));
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  render();
  const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];
  const press = (button: HTMLButtonElement, key: string) =>
    act(() => {
      button.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
    });
  expect(buttons.map((button) => button.tabIndex)).toEqual([-1, 0, -1]);
  buttons[1].focus();
  press(buttons[1], "ArrowRight");
  expect(changed).toHaveBeenLastCalledWith("3");
  expect(document.activeElement).toBe(buttons[2]);
  expect(buttons.map((button) => button.tabIndex)).toEqual([-1, -1, 0]);
  press(buttons[2], "ArrowDown");
  expect(changed).toHaveBeenLastCalledWith("1");
  expect(document.activeElement).toBe(buttons[0]);
  press(buttons[0], "End");
  expect(changed).toHaveBeenLastCalledWith("3");
  press(buttons[2], "Home");
  expect(changed).toHaveBeenLastCalledWith("1");
  press(buttons[0], "ArrowLeft");
  expect(changed).toHaveBeenLastCalledWith("3");
  expect(buttons[2].getAttribute("aria-checked")).toBe("true");
  disabled = true;
  render();
  changed.mockClear();
  press(buttons[2], "ArrowUp");
  expect(changed).not.toHaveBeenCalled();
  expect(buttons.every((button) => button.disabled)).toBe(true);
});
