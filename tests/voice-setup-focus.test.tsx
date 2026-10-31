// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VoiceSetup } from "../src/voice/VoiceSetup";
import type { FoundVoiceModel } from "../src/voice/setup-api";

const { install } = vi.hoisted(() => ({
  install: { found: undefined as FoundVoiceModel[] | undefined },
}));
vi.mock("../src/voice/setup-api", () => ({
  readVoiceSetup: async () => ({
    token: "fixture-grant",
    model: "Qwen3-ASR-0.6B",
    bytes: 1_880_000_000,
    folder: "/tmp/voice",
    browse: false,
    supported: true,
    state: { phase: "idle", bytes: 0, busy: false },
  }),
}));
vi.mock("../src/voice/install-store", () => ({
  useVoiceInstall: () => install,
  adoptVoiceInstall: vi.fn(),
  findVoiceModels: vi.fn(),
  cancelVoiceInstall: vi.fn(),
  startVoiceInstall: vi.fn(),
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let voice: HTMLButtonElement;
let root: Root;
beforeEach(() => {
  install.found = undefined;
  host = document.createElement("div");
  voice = document.createElement("button");
  voice.textContent = "Voice";
  document.body.append(voice, host);
  voice.focus();
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  voice.remove();
});
const render = async () => {
  await act(async () =>
    root.render(<VoiceSetup onReady={() => {}} onClose={() => {}} />),
  );
};

it("moves focus into the install offer after read-only discovery enables it", async () => {
  await render();
  const confirm = host.querySelector<HTMLButtonElement>(".primary")!;
  expect(confirm.disabled).toBe(true);
  expect(document.activeElement).toBe(voice);
  install.found = [];
  await render();
  expect(confirm.disabled).toBe(false);
  expect(confirm.textContent).toBe("Install new");
  expect(document.activeElement).toBe(confirm);
});

it("does not steal focus from someone editing the folder while discovery runs", async () => {
  await render();
  const folder = host.querySelector<HTMLInputElement>("input")!;
  folder.focus();
  install.found = [];
  await render();
  expect(document.activeElement).toBe(folder);
});
