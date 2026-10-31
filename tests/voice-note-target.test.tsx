// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VoiceOverlay } from "../src/voice/VoiceOverlay";
import { setVoiceDestination } from "../src/voice/destination-store";
import type { VoicePhase } from "../src/voice/useVoiceRecorder";

const { note, send } = vi.hoisted(() => ({
  note: {
    phase: "recording" as VoicePhase,
    transcript: "",
    message: "",
    seconds: 0,
    levels: { current: new Float32Array(48) },
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    setTranscript: vi.fn(),
  },
  send: vi.fn(),
}));
vi.mock("../src/voice/useVoiceRecorder", () => ({
  useVoiceRecorder: () => note,
}));
vi.mock("../src/voice/agent-destination", () => ({
  sendVoiceToAgent: send,
  voiceProjectId: () => "director-project",
}));
vi.mock("../src/studio/ShellContext", () => ({ useShell: () => undefined }));
vi.mock("../src/voice/VoiceLEDWaveform", () => ({
  VoiceLEDWaveform: () => null,
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let prompt: HTMLTextAreaElement;
const mic = {
  current: undefined as ((recordOnly?: boolean) => boolean) | undefined,
};
const status = { available: true, maxSeconds: 60 };

beforeEach(() => {
  vi.useFakeTimers();
  note.phase = "recording";
  note.transcript = "";
  send.mockReset();
  localStorage.clear();
  setVoiceDestination("prompt:scroll-cell-prompt");
  prompt = document.createElement("textarea");
  prompt.id = "scroll-cell-prompt";
  prompt.dataset.voiceScope = "scroll-a:cell-a";
  prompt.value = "Cell A";
  document.body.append(prompt);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(
    document.body,
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  prompt.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const render = async () => {
  await act(async () =>
    root.render(<VoiceOverlay status={status} mic={mic} onClose={() => {}} />),
  );
};

it("fills the captured Scroll cell when it remains selected", async () => {
  await render();
  await act(async () => vi.runOnlyPendingTimers());
  note.phase = "transcribing";
  await render();
  note.phase = "done";
  note.transcript = "A new direction for cell A";
  await render();
  expect(prompt.value).toBe(note.transcript);
  expect(send).not.toHaveBeenCalled();
});

it("an explicit destination change while recording updates the captured field", async () => {
  await render();
  await act(async () => vi.runOnlyPendingTimers());
  prompt.id = "description";
  delete prompt.dataset.voiceScope;
  await act(async () => setVoiceDestination("prompt:description"));
  note.phase = "transcribing";
  await render();
  note.phase = "done";
  note.transcript = "An intentional Camera prompt";
  await render();
  expect(prompt.value).toBe(note.transcript);
});

it("keeps a note without an initial prompt until its destination is chosen explicitly", async () => {
  prompt.remove();
  setVoiceDestination("prompt");
  await render();
  await act(async () => vi.runOnlyPendingTimers());
  note.phase = "transcribing";
  await render();
  document.body.append(prompt);
  note.phase = "done";
  note.transcript = "Unassigned words";
  await render();
  expect(prompt.value).toBe("Cell A");
  expect(host.textContent).toContain("No editable prompt was selected");
  const retry = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Send to selected destination",
  );
  await act(async () => retry!.click());
  expect(prompt.value).toBe(note.transcript);
});

it.each(["scroll-a:cell-b", "scroll-b:cell-a"])(
  "holds a note when the selected Scroll target becomes %s during transcription",
  async (scope) => {
    await render();
    await act(async () => vi.runOnlyPendingTimers());
    note.phase = "transcribing";
    await render();
    // The same textarea is reused by the newly selected cell/document.
    prompt.dataset.voiceScope = scope;
    prompt.value = "New target must keep its text";
    note.phase = "done";
    note.transcript = "A direction for the original cell";
    await render();
    expect(prompt.value).toBe("New target must keep its text");
    expect(host.textContent).toContain("different document or item");
    expect(
      host.querySelector<HTMLTextAreaElement>("#voice-transcript")?.value,
    ).toBe(note.transcript);
    expect(send).not.toHaveBeenCalled();
  },
);

it("holds Current prompt when its original field closes before the transcript arrives", async () => {
  setVoiceDestination("prompt");
  await render();
  await act(async () => vi.runOnlyPendingTimers());
  note.phase = "transcribing";
  await render();
  prompt.id = "description";
  delete prompt.dataset.voiceScope;
  prompt.value = "Unrelated Camera prompt";
  note.phase = "done";
  note.transcript = "A direction for Scroll";
  await render();
  expect(prompt.value).toBe("Unrelated Camera prompt");
  expect(send).not.toHaveBeenCalled();
});
