// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFile } from "node:fs/promises";
import spinners from "cli-spinners";
import { afterEach, expect, it } from "vitest";
import Wordmark from "../src/components/Wordmark";
import { setActivity } from "../src/busy";
import { headerProgress } from "../src/components/LoadProgress";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  setActivity("template-media-test", undefined);
  setActivity("job-test", undefined);
  document.body.replaceChildren();
});

function mount() {
  const host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  act(() => root!.render(<Wordmark />));
  return host;
}

it("shows a progress bar beside the name while a load reports a percent", async () => {
  const host = mount();
  expect(host.querySelector('[role="progressbar"]')).toBeNull();
  act(() =>
    setActivity(
      "template-media-test",
      "LOADING ACOUSTIC SPACES V2  36% ⣿⣀⣀⣀  24 / 66 MB",
    ),
  );
  const bar = host.querySelector('[role="progressbar"]')!;
  expect(bar.getAttribute("aria-valuenow")).toBe("36");
  expect(bar.getAttribute("aria-label")).toBe("LOADING ACOUSTIC SPACES V2");
  // round(0.36 × 7) = 3 of the aesthetic spinner's 7 cells, then the percent.
  expect(bar.querySelector(".brand-progress-filled")?.textContent).toBe("▰▰▰");
  expect(bar.querySelector(".brand-progress-empty")?.textContent).toBe("▱▱▱▱");
  expect(bar.querySelector(".brand-progress-label")?.textContent).toBe("36%");
  expect(spinners.binary.frames as string[]).toContain(
    bar.querySelector(".brand-progress-binary")?.textContent,
  );
  // The name still says what the document title says.
  const title = /<title>([^<]*)<\/title>/.exec(
    await readFile("index.html", "utf8"),
  )?.[1];
  expect(host.querySelector(".brand-home")?.textContent).toBe(title);
  act(() => setActivity("template-media-test", undefined));
  expect(host.querySelector('[role="progressbar"]')).toBeNull();
});

it("runs the aesthetic spinner without a percent when the total is unknown", () => {
  const host = mount();
  act(() => setActivity("template-media-test", "LOADING BLOOM"));
  const bar = host.querySelector('[role="progressbar"]')!;
  expect(spinners.aesthetic.frames as string[]).toContain(bar.textContent);
  expect(bar.textContent).not.toContain("%");
  expect(bar.querySelector(".brand-progress-binary")).toBeNull();
  expect(bar.hasAttribute("aria-valuenow")).toBe(false);
});

it("draws no bar for work that reports no percent", () => {
  const host = mount();
  act(() => setActivity("job-test", "GENERATING KLEIN IMAGE  12s"));
  expect(host.querySelector('[role="progressbar"]')).toBeNull();
  expect(host.querySelector(".brand-busy")).not.toBeNull();
  expect(
    headerProgress([{ id: "job-x", line: "GENERATING KLEIN IMAGE  73% ⣿⣀" }]),
  ).toEqual({ label: "GENERATING KLEIN IMAGE", percent: 73 });
});
