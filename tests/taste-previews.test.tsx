// @vitest-environment jsdom
import { act } from "react";
import { renderToString } from "react-dom/server";
import TastePanel from "../src/licensing/TastePanel";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TastePreview from "../src/licensing/TastePreview";
import { localDemos, tasteDemos } from "../src/licensing/taste-demos";
import { tasteMedia } from "../src/licensing/taste-media";
import { tasteLibraries } from "../shared/licensing/report";
import { tasteInspirations } from "../shared/licensing/taste-shelf";
import { tasteShelfContext } from "../shared/licensing/taste-shelf";

let root: Root;
let host: HTMLDivElement;
let intersect: (entries: { isIntersecting: boolean }[]) => void;
let reduced = false;
const disconnect = vi.fn();
beforeEach(() => {
  reduced = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: reduced,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof intersect) {
        intersect = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = async (id = "paper-shaders", url = "https://example.com/") => {
  await act(async () =>
    root.render(<TastePreview id={id} name="Sample" url={url} />),
  );
};
const visible = async (isIntersecting: boolean) => {
  await act(async () => intersect([{ isIntersecting }]));
};
it("starts the real demo in view, releases it off screen, and honours an explicit stop", async () => {
  await render();
  expect(host.querySelector("iframe")).toBeNull();
  await visible(true);
  expect(host.querySelector("iframe")?.src).toContain(
    "paper-shaders-dithering/",
  );
  expect(host.querySelector("iframe")?.getAttribute("sandbox")).toBe(
    "allow-scripts allow-same-origin",
  );
  await visible(false);
  expect(host.querySelector("iframe")).toBeNull();
  await visible(true);
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Stop Sample example"]',
      )!
      .click(),
  );
  expect(host.querySelector("iframe")).toBeNull();
  await visible(false);
  await visible(true);
  expect(host.querySelector("iframe")).toBeNull();
});
it("requires Play under reduced motion and never embeds an arbitrary reference URL", async () => {
  reduced = true;
  await render();
  await visible(true);
  expect(host.querySelector("iframe")).toBeNull();
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Play Sample example"]',
      )!
      .click(),
  );
  expect(host.querySelector("iframe")).not.toBeNull();
  await render("custom-reference", "https://example.com/private");
  expect(host.querySelector("iframe")).toBeNull();
  expect(host.querySelector("a")?.href).toBe("https://example.com/private");
});
it("includes Andrew Zellinger for agents by default and respects opting out", () => {
  expect(tasteShelfContext().references).toContainEqual(
    expect.objectContaining({
      id: "andrew-zellinger",
      name: "Andrew Zellinger",
      url: "https://github.com/a2z2k26",
    }),
  );
  expect(
    tasteShelfContext({
      excluded: ["andrew-zellinger"],
      custom: [],
    }).references.some((r) => r.id === "andrew-zellinger"),
  ).toBe(false);
});

it("gives every library and creator a demo, artwork or explained workflow", () => {
  const missing = [...tasteLibraries, ...tasteInspirations].filter(
    ({ id }) => !tasteDemos[id] && !localDemos[id] && !tasteMedia[id],
  );
  expect(missing.map(({ id }) => id)).toEqual([]);
});
it("shows upstream media and keeps a source link when that media fails", async () => {
  await render(
    "three-plotter-renderer",
    "https://github.com/neurofuzzy/three-plotter-renderer",
  );
  await visible(true);
  const img = host.querySelector("img");
  expect(img?.src).toContain("examples/output/complex.svg");
  await act(async () => img!.dispatchEvent(new Event("error")));
  expect(host.textContent).toContain("Preview unavailable");
  expect(host.querySelector("a")?.href).toBe(
    "https://github.com/neurofuzzy/three-plotter-renderer",
  );
});

// p5's addon modules check the browser's global `p5` before attaching methods.
// An element named p5 becomes window.p5 and makes that import crash.
it("does not expose a named DOM global that breaks the p5 module import", () => {
  host.innerHTML = renderToString(<TastePanel />);
  expect(host.querySelector("#taste-library-p5")).not.toBeNull();
  expect(Reflect.get(window, "p5")).toBeUndefined();
  host.innerHTML = "";
});
