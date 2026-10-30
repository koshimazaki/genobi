// The setup dialog is landscape at desktop widths again: Genobi and the step
// progress in a column beside the step, header and footer across both, wider
// than tall. Phones keep the single column.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StartupConfigurator from "../src/setup/StartupConfigurator";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  // A first visit in the studio's own window: the dialog opens.
  const page = new EventTarget() as EventTarget & { parent?: unknown };
  page.parent = page;
  vi.stubGlobal("window", page);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Rendering must not call the server");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const css = readFileSync("src/setup/setup.css", "utf8");
/** The rules inside one `@media (…)` block. */
const media = (query: string) => {
  const start = css.indexOf(`@media (${query})`);
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index++) {
    if (css[index] === "{") depth++;
    if (css[index] === "}" && --depth === 0) return css.slice(start, index);
  }
  return "";
};

it("renders the companion and progress in an aside beside the step", () => {
  const html = renderToStaticMarkup(<StartupConfigurator />);
  expect(html).toMatch(/^<dialog class="genobi-setup"/);
  const order = [
    'class="setup-header"',
    'class="setup-aside"',
    'class="setup-character"',
    'class="setup-step"',
    'class="setup-footer"',
  ].map((needle) => html.indexOf(needle));
  expect(order.every((index) => index > -1)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  // The character sits inside the aside, the step outside it.
  const aside = html.slice(order[1], order[3]);
  expect(aside).toContain("setup-halo");
  expect(fetch).not.toHaveBeenCalled();
});

it("is wider than tall at desktop widths, in two columns", () => {
  const desktop = media("min-width: 860px");
  expect(desktop).toContain(".genobi-setup[open]");
  expect(desktop).toContain("width: min(940px, calc(100vw - 48px))");
  expect(desktop).toContain("max-height: min(720px, calc(100svh - 48px))");
  expect(desktop).toContain("grid-template-columns: 200px minmax(0, 1fr)");
  expect(desktop).toMatch(
    /grid-template-areas:\s*"header header"\s*"aside step"\s*"footer footer"/,
  );
  // Only an open dialog becomes a grid; a closed one stays hidden.
  expect(css).not.toMatch(/^\.genobi-setup\s*\{[^}]*display:/m);
});

it("keeps the phone layout: one column, the narrow width and padding", () => {
  expect(css).toContain("width: min(540px, calc(100vw - 24px))");
  const phone = media("max-width: 420px");
  expect(phone).toContain("padding: 18px");
  expect(phone).not.toContain("grid-template-columns");
});
