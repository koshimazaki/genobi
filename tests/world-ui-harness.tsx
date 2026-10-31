import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((close) => close()));

export function mountWorldControl(children: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (content: ReactNode) => act(() => root.render(content));
  render(children);
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { host, render };
}

export function controlInput(host: HTMLElement, label: string) {
  const input = host.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  );
  if (!input) throw new Error(`Missing ${label} input`);
  return input;
}

export function setControlInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function setControlSelect(
  host: HTMLElement,
  label: string,
  value: string,
) {
  const select = host.querySelector<HTMLSelectElement>(
    `select[aria-label="${label}"]`,
  );
  if (!select) throw new Error(`Missing ${label} select`);
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export function controlButton(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll("button")].find(
    (item) =>
      item.textContent?.trim() === text ||
      item.getAttribute("aria-label") === text,
  );
  if (!button) throw new Error(`Missing ${text} button`);
  return button;
}
