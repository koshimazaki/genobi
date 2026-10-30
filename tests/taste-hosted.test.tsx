// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { tasteDemos } from "../src/licensing/taste-demos";
import { tasteLibraries } from "../shared/licensing/report";
import { tasteSources } from "../shared/licensing/taste-shelf";
import { HOSTED_RUN_LOCATION } from "../shared/comfy/run-location";

vi.mock("../src/licensing/AsciiStudy", () => ({ default: () => null }));

let root: Root;
let host: HTMLDivElement;
let settings: () => Promise<Response>;
const observers = new Map<
  Element,
  (entries: { isIntersecting: boolean }[]) => void
>();
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
const profile = {
  revision: 0,
  preferences: [],
  shelf: { excluded: [], custom: [] },
};
const server = vi.fn(async (url: string, init?: RequestInit) => {
  if (url === "/api/settings/run-location") return settings();
  if (url === "/api/memory/taste") return json(profile);
  if (url === "/api/memory/taste/shelf")
    return json({
      ...profile,
      revision: 1,
      shelf: JSON.parse(String(init?.body)).shelf,
    });
  throw new Error(`Unexpected request: ${url}`);
});
const memoryCalls = () =>
  server.mock.calls.filter(([url]) => url.startsWith("/api/memory"));

beforeEach(() => {
  vi.resetModules();
  server.mockClear();
  observers.clear();
  settings = async () => json(HOSTED_RUN_LOCATION);
  vi.stubGlobal("fetch", server);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(
        private callback: (entries: { isIntersecting: boolean }[]) => void,
      ) {}
      observe(node: Element) {
        observers.set(node, this.callback);
      }
      disconnect() {}
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
async function render() {
  const { default: TastePanel } = await import("../src/licensing/TastePanel");
  await act(async () => root.render(<TastePanel />));
}

it("renders the public hosted shelf and working demo frames without memory reads or writes", async () => {
  await render();
  expect(host.textContent).toContain(
    `${tasteSources.length} public references`,
  );
  expect(host.textContent).toContain(
    "Your own taste profile and project memory live in the local studio",
  );
  expect(host.querySelector('a[href$="#run-locally"]')).not.toBeNull();
  for (const { id } of tasteLibraries)
    expect(host.querySelector(`#taste-library-${id}`)).not.toBeNull();
  expect(host.textContent).not.toContain("My reusable taste");
  expect(host.textContent).not.toContain("Add your own references");
  expect(host.querySelector("#setup")).toBeNull();
  const writes = host.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  expect(writes.length).toBeGreaterThan(0);
  await act(async () => {
    writes.forEach((input) => {
      expect(input.disabled).toBe(true);
      input.click();
    });
    host.querySelectorAll("details").forEach((details) => {
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });
    for (const id of ["alien-js", "space-js", "p5-brush"]) {
      const stage = host.querySelector(`#taste-library-${id} .taste-preview`)!;
      observers.get(stage)!([{ isIntersecting: true }]);
    }
  });
  for (const id of ["alien-js", "space-js", "p5-brush"])
    expect(
      host.querySelector<HTMLIFrameElement>(`#taste-library-${id} iframe`)?.src,
    ).toBe(tasteDemos[id].url);
  expect(memoryCalls()).toEqual([]);
});

it("waits for hosted detection before allowing any local-only request", async () => {
  let resolve!: (response: Response) => void;
  settings = () =>
    new Promise((done) => {
      resolve = done;
    });
  await render();
  expect(host.textContent).toContain("public references");
  expect(memoryCalls()).toEqual([]);
  await act(async () => resolve(json(HOSTED_RUN_LOCATION)));
  expect(memoryCalls()).toEqual([]);
});

it.each(["offline", "unrecognised"])(
  "keeps the public shelf read-only when detection is %s",
  async (kind) => {
    settings = async () => {
      if (kind === "offline") throw new Error("Offline");
      return json({});
    };
    await render();
    expect(host.textContent).toContain("public references");
    expect(host.querySelector("#setup")).toBeNull();
    expect(memoryCalls()).toEqual([]);
  },
);

it("reads and saves the personal shelf in confirmed local mode", async () => {
  settings = async () => json({ ...HOSTED_RUN_LOCATION, fixed: false });
  await render();
  expect(memoryCalls().map(([url]) => url)).toEqual(["/api/memory/taste"]);
  expect(host.textContent).toContain("My reusable taste");
  expect(host.textContent).toContain("Add your own references");
  expect(host.querySelector("#setup")).not.toBeNull();
  const include = host.querySelector<HTMLInputElement>(
    '#taste-library-three input[type="checkbox"]',
  )!;
  expect(include.disabled).toBe(false);
  await act(async () => include.click());
  const write = memoryCalls().find(([url]) => url.endsWith("/shelf"));
  expect(write?.[1]?.method).toBe("POST");
  expect(JSON.parse(String(write?.[1]?.body))).toEqual({
    revision: 0,
    shelf: { excluded: ["three"], custom: [] },
  });
  expect(include.checked).toBe(false);
  const preferences = host.querySelector<HTMLDetailsElement>(".memory-panel")!;
  await act(async () => {
    preferences.open = true;
    preferences.dispatchEvent(new Event("toggle"));
  });
  expect(
    memoryCalls().filter(([url]) => url === "/api/memory/taste").length,
  ).toBeGreaterThan(1);
});

it("permits every curated remote demo origin in the Pages frame CSP", () => {
  const headers = readFileSync("public/_headers", "utf8");
  const origins = headers.match(/frame-src ([^;]+);/)![1].split(/\s+/);
  for (const { url } of Object.values(tasteDemos))
    expect(origins).toContain(new URL(url).origin);
});
