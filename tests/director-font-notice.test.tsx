// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { resolveFontStack } from "../shared/director/fonts";

// This page "has" only the fonts listed here; jsdom has no canvas to measure.
const installed = new Set<string>();
vi.mock("../src/director/font-registry", async (actual) => ({
  ...(await actual<typeof import("../src/director/font-registry")>()),
  resolveFont: async (stack: string) =>
    resolveFontStack(stack, (f) => installed.has(f)),
}));
const { default: FontNotice } = await import("../src/director/FontNotice");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  installed.clear();
});
async function show(
  parameters: Record<string, unknown>,
  schema?: { properties?: Record<string, { enum?: unknown[] }> },
) {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  await act(async () => {
    root!.render(<FontNotice parameters={parameters} schema={schema} />);
  });
  await act(async () => {});
  return host.querySelector(".dir-font-notice");
}
const TITLE = '"Explorers", "Instrument Sans Variable", sans-serif';

it("names a font this page cannot draw and the face shown instead", async () => {
  const p = await show({ font: TITLE, weight: 400, text: "SUPERNATURAL" });
  expect(p?.textContent).toBe(
    "Font 'Explorers' isn't available here; showing Instrument Sans Variable.",
  );
  expect(p?.getAttribute("role")).toBe("status");
  expect(p?.getAttribute("data-warn")).toBe("true");
});

it("says a local face is not portable when this page has it", async () => {
  installed.add("Explorers");
  const p = await show({ font: TITLE });
  expect(p?.textContent).toMatch(
    /^Showing Explorers, installed on this computer but not bundled/,
  );
});

it("updates when the font changes in the inspector", async () => {
  await show({ font: TITLE });
  await act(async () => {
    root!.render(
      <FontNotice parameters={{ font: '"Pixelify Sans", monospace' }} />,
    );
  });
  await act(async () => {});
  const p = host.querySelector(".dir-font-notice");
  expect(p?.textContent).toBe("Showing Pixelify Sans (bundled).");
  expect(p?.getAttribute("data-warn")).toBe("false");
});

it("stays out of recipes whose font is an enum key or absent", async () => {
  const schema = { properties: { font: { enum: ["Instrument Sans"] } } };
  expect(await show({ font: "Instrument Sans" }, schema)).toBeNull();
  act(() => root?.unmount());
  expect(await show({ text: "HUD" })).toBeNull();
});
