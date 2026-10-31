// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RunLocationState } from "../shared/comfy/run-location";
import FamilyModelSelector from "../src/components/FamilyModelSelector";
import RunModeLine from "../src/components/RunModeLine";
import { resetSettingsForTests, useSettingsStore } from "../src/settings-store";
import { SettingUnconfirmed } from "../src/run-settings";
import { resetLocalCheckForTests } from "../src/local-check";

// The model menu's Local tick writes the session run location through the
// same SettingSaver as Studio setup, and ticking it turns Open only on.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const answer = (
  location: "local" | "cloud",
  mode: string = location,
  revision = 1,
) =>
  ({
    revision,
    location,
    mode,
    label: "",
    source: "session",
    fixed: false,
    choices: ["local", "cloud", "both"],
    local: { reachable: true, version: "1" },
    note: "",
  }) as RunLocationState;

let root: Root | null = null;
let server: RunLocationState;
let posts: unknown[];
let refuse = false;
beforeEach(() => {
  resetSettingsForTests({
    "run-location": () => Promise.reject(new SettingUnconfirmed("none")),
    workflow: () => Promise.reject(new SettingUnconfirmed("none")),
  });
  resetLocalCheckForTests();
  server = answer("cloud");
  posts = [];
  refuse = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/health")
        return Response.json({ ok: true, hasServerKey: false });
      if (url.startsWith("/api/settings/workflows"))
        return Response.json({ local: { reachable: true, templates: {} } });
      if (init?.method === "POST") {
        const { location } = JSON.parse(String(init.body));
        posts.push(location);
        if (refuse)
          return Response.json({ error: "Not now." }, { status: 409 });
        server = answer(
          location === "cloud" ? "cloud" : "local",
          location,
          server.revision + 1,
        );
      }
      return Response.json(server);
    }),
  );
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  useSettingsStore.setState({
    location: undefined,
    runLocation: undefined,
    workflows: {},
    hosts: {},
    held: {},
    saving: {},
  });
});

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));
async function mount(openOnly = false) {
  const changes: boolean[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const render = (value: boolean) =>
    root!.render(
      <>
        <FamilyModelSelector
          generator="audio"
          model="minimax-music-3"
          openOnly={value}
          onChoose={() => {}}
          onOpenOnlyChange={(next) => {
            changes.push(next);
            render(next);
          }}
        />
        <RunModeLine generator="audio" model="minimax-music-3" keyKind={null} />
      </>,
    );
  act(() => render(openOnly));
  act(() =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="H3 models"]')!
      .click(),
  );
  await flush();
  return changes;
}
const tick = (name: string) =>
  [...document.querySelectorAll("label")]
    .find((label) => label.textContent?.trim() === name)!
    .querySelector("input")!;
const tags = () =>
  [...document.querySelectorAll(".run-mode__tag")].map((t) => t.textContent);

describe("the Local tick", () => {
  it("saves both, ticks Open only with it, and narrows the menu", async () => {
    const changes = await mount();
    expect(tick("Local").checked).toBe(false);
    expect(tags()).toEqual(["Open weights", "Comfy Cloud"]);
    await act(async () => tick("Local").click());
    await flush();
    expect(posts).toEqual(["both"]);
    expect(changes).toEqual([true]);
    expect(tick("Local").checked).toBe(true);
    expect(tick("Open only").checked).toBe(true);
    expect(tags()).toEqual(["Open weights", "Local ComfyUI"]);
    // The Router row and the deployment's swap are hidden, and the header says so.
    const rows = [...document.querySelectorAll('[role="option"]')].map(
      (r) => r.textContent,
    );
    expect(rows.some((r) => r?.includes("Reference to video"))).toBe(false);
    expect(
      document.querySelector(".family-model__hidden")?.textContent,
    ).toMatch(/more with Local off/);
  });

  it("unticks to cloud and leaves Open only as it was", async () => {
    server = answer("local", "both");
    const changes = await mount(true);
    expect(tick("Local").checked).toBe(true);
    await act(async () => tick("Local").click());
    await flush();
    expect(posts).toEqual(["cloud"]);
    expect(changes).toEqual([]);
    expect(tick("Local").checked).toBe(false);
    expect(tick("Open only").checked).toBe(true);
    // Open only can be unticked with Local off.
    await act(async () => tick("Open only").click());
    expect(changes).toEqual([false]);
  });

  it("shows the server's value again after a definite refusal", async () => {
    refuse = true;
    await mount();
    await act(async () => tick("Local").click());
    await flush();
    expect(posts).toEqual(["both"]);
    expect(tick("Local").checked).toBe(false);
    expect(tags()).toEqual(["Open weights", "Comfy Cloud"]);
  });
});

it("cannot select Local on an editable hosted deployment adapter", async () => {
  server = {
    ...answer("cloud"),
    fixed: false,
    choices: ["cloud", "deployment"],
    local: null,
  };
  const changes = await mount();
  expect(tick("Local").disabled).toBe(true);
  await act(async () => tick("Local").click());
  expect(posts).toEqual([]);
  expect(changes).toEqual([]);
});

it("uses the advertised local choice when Both is unavailable", async () => {
  server = { ...answer("cloud"), choices: ["cloud", "local"] };
  await mount();
  await act(async () => tick("Local").click());
  await flush();
  expect(posts).toEqual(["local"]);
  expect(tick("Local").checked).toBe(true);
});
