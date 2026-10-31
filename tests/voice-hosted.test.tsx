// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Exercise the real shared hosted detector, including its initially pending read.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement;
let fixed: boolean;
let settings: Promise<Response> | undefined;
const getUserMedia = vi.fn().mockRejectedValue(new Error("Unexpected mic"));
const request = vi.fn(async (url: string) => {
  if (url === "/api/health")
    return (
      settings ??
      Response.json({ ok: true, hasServerKey: false, hosted: fixed })
    );
  if (url === "/api/voice/status")
    return Response.json({ available: true, maxSeconds: 180 });
  return Response.json({ available: false, events: [], harnesses: [] });
});
const voiceCalls = () =>
  request.mock.calls.filter(([url]) => url.startsWith("/api/voice"));

beforeEach(() => {
  vi.resetModules();
  fixed = true;
  settings = undefined;
  request.mockClear();
  getUserMedia.mockClear();
  localStorage.clear();
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("MediaRecorder", class {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host.remove();
  delete (navigator as { mediaDevices?: MediaDevices }).mediaDevices;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount(node: ReactNode) {
  await act(async () => {
    root = createRoot(host);
    root.render(node);
  });
}
async function click(label: string) {
  const button = [...host.querySelectorAll("button")].find(
    (node) => node.getAttribute("aria-label") === label,
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
async function expectNotice() {
  const { HOSTED_VOICE_MESSAGE, LOCAL_SETUP_URL } =
    await import("../src/voice/availability");
  expect(host.textContent).toContain(HOSTED_VOICE_MESSAGE);
  expect(host.querySelector(`a[href="${LOCAL_SETUP_URL}"]`)).not.toBeNull();
  expect(voiceCalls()).toEqual([]);
  expect(getUserMedia).not.toHaveBeenCalled();
}

it("opens a non-modal hosted mic explanation, closes with Escape and restores focus", async () => {
  const { default: VoiceButton } = await import("../src/voice/VoiceButton");
  await mount(<VoiceButton />);
  await click("Voice");
  await expectNotice();
  const panel = host.querySelector('[role="dialog"]')!;
  expect(panel.getAttribute("aria-modal")).not.toBe("true");
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Close voice",
  );
  await act(async () => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Voice");
  await click("Voice");
  await click("Close voice");
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(voiceCalls()).toEqual([]);
});

it("waits for hosted detection when the mic is pressed immediately", async () => {
  let answer!: (value: Response) => void;
  settings = new Promise((resolve) => (answer = resolve));
  const { default: VoiceButton } = await import("../src/voice/VoiceButton");
  await mount(<VoiceButton />);
  await click("Voice");
  expect(voiceCalls()).toEqual([]);
  expect(getUserMedia).not.toHaveBeenCalled();
  await act(async () => {
    answer(Response.json({ ok: true, hasServerKey: false, hosted: fixed }));
  });
  await expectNotice();
});

it.each(["offline", "malformed"])(
  "keeps voice private when detection is %s",
  async (failure) => {
    request.mockImplementationOnce(async () => {
      if (failure === "offline") throw new TypeError("Offline");
      return Response.json({});
    });
    const api = await import("../src/voice/api");
    const setup = await import("../src/voice/setup-api");
    const { requireLocalVoice, VOICE_UNCONFIRMED_MESSAGE } =
      await import("../src/voice/availability");
    expect(await api.voiceStatus()).toMatchObject({
      available: false,
      maxSeconds: 0,
      setup: VOICE_UNCONFIRMED_MESSAGE,
    });
    await api.prewarmVoice();
    await api.cancelPrewarm();
    await expect(setup.readVoiceSetup()).rejects.toThrow(
      VOICE_UNCONFIRMED_MESSAGE,
    );
    await expect(setup.readFoundVoiceModels()).rejects.toThrow(
      VOICE_UNCONFIRMED_MESSAGE,
    );
    // The recorder uses this same guard before touching media devices.
    await expect(requireLocalVoice()).rejects.toThrow(
      VOICE_UNCONFIRMED_MESSAGE,
    );
    expect(voiceCalls()).toEqual([]);
    expect(getUserMedia).not.toHaveBeenCalled();
  },
);

it("explains hosted voice in the Genobi bubble", async () => {
  const { AgentBubble } = await import("../src/agent/AgentBubble");
  await mount(<AgentBubble />);
  await click("Open Genobi activity");
  await expectNotice();
});

it("conversation voice entry points open the same hosted explanation without recording", async () => {
  const { default: VoiceButton } = await import("../src/voice/VoiceButton");
  const { AgentVoiceButton } = await import("../src/voice/AgentVoiceButton");
  const { voiceRouting } = await import("../src/voice/destination-store");
  const session = {
    id: "selected",
    runner: "hermes" as const,
    status: "running" as const,
    prompt: "Scene",
    startedAt: "",
    lines: [],
  };
  await mount(
    <>
      <VoiceButton />
      <AgentVoiceButton session={session} />
    </>,
  );
  const speak = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Speak to agent",
  );
  await act(async () => speak!.click());
  expect(voiceRouting().agent?.session.id).toBe("selected");
  await expectNotice();
});

it.each([false, true])(
  "explains the optional hosted voice starter (embedded=%s)",
  async (embedded) => {
    const { default: VoiceStarter } = await import("../src/voice/VoiceStarter");
    await mount(<VoiceStarter embedded={embedded} />);
    await expectNotice();
    expect(host.textContent).not.toContain("Set up local voice");
  },
);

it.each([false, true])(
  "explains setup voice, including a restored voice choice (%s)",
  async (voice) => {
    const { SUMMARY_STEP } = await import("../src/setup/SetupChoices");
    const { keepSetupSession } = await import("../src/setup/session-draft");
    keepSetupSession({ step: SUMMARY_STEP, draft: { selection: {}, voice } });
    const { default: StartupConfigurator } =
      await import("../src/setup/StartupConfigurator");
    await mount(<StartupConfigurator />);
    await expectNotice();
    expect(host.querySelector(".setup-voice-choice")).toBeNull();
    expect(host.textContent).not.toContain("Save & set up");
  },
);

it("keeps the local header status request", async () => {
  fixed = false;
  const { default: VoiceButton } = await import("../src/voice/VoiceButton");
  await mount(<VoiceButton />);
  expect(voiceCalls()).toEqual([["/api/voice/status", expect.any(Object)]]);
  expect(getUserMedia).not.toHaveBeenCalled();
});

it("still requests the microphone from the local header", async () => {
  fixed = false;
  const { default: VoiceButton } = await import("../src/voice/VoiceButton");
  await mount(<VoiceButton />);
  await click("Voice");
  await act(async () => {
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
  });
  expect(getUserMedia).toHaveBeenCalledWith({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  expect(host.textContent).toContain("The microphone could not start.");
});

it("guards every voice client and the recorder on hosted", async () => {
  const api = await import("../src/voice/api");
  const setup = await import("../src/voice/setup-api");
  const install = await import("../src/voice/install-store");
  const { useVoiceRecorder } = await import("../src/voice/useVoiceRecorder");
  const { HOSTED_VOICE_MESSAGE } = await import("../src/voice/availability");
  expect(await api.voiceStatus()).toMatchObject({
    available: false,
    maxSeconds: 0,
  });
  await api.prewarmVoice();
  await api.cancelPrewarm();
  await expect(
    api.transcribe(new Blob([]), new AbortController().signal, "English"),
  ).rejects.toThrow(HOSTED_VOICE_MESSAGE);
  await expect(setup.readVoiceSetup()).rejects.toThrow(HOSTED_VOICE_MESSAGE);
  await expect(setup.readFoundVoiceModels()).rejects.toThrow(
    HOSTED_VOICE_MESSAGE,
  );
  for (const method of ["GET", "POST", "DELETE"])
    await expect(setup.setupRequest("", method)).rejects.toThrow(
      HOSTED_VOICE_MESSAGE,
    );
  await install.checkVoiceInstall();
  await install.findVoiceModels();
  await install.startVoiceInstall();
  await install.cancelVoiceInstall();
  let recorder!: ReturnType<typeof useVoiceRecorder>;
  function Recorder() {
    recorder = useVoiceRecorder(60, "English");
    return <p>{recorder.message}</p>;
  }
  await mount(<Recorder />);
  await act(async () => recorder.start());
  expect(host.textContent).toContain(HOSTED_VOICE_MESSAGE);
  expect(voiceCalls()).toEqual([]);
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(
    request.mock.calls.filter(([url]) => url === "/api/health"),
  ).toHaveLength(1);
});
