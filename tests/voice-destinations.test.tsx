// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentSession } from "../shared/agent-session";
import { VoiceDestinations } from "../src/voice/VoiceDestinations";
import {
  selectVoiceAgent,
  setVoiceDestination,
  voiceRouting,
} from "../src/voice/destination-store";
import { closeAgentSession } from "../src/agent/useAgentSession";

const { send, intent } = vi.hoisted(() => ({ send: vi.fn(), intent: vi.fn() }));
vi.mock("../src/voice/agent-destination", () => ({
  sendVoiceToAgent: send,
  voiceProjectId: () => undefined,
}));
vi.mock("../src/voice/voice-intent-target", () => ({
  applyVoiceIntent: intent,
}));
vi.mock("../src/studio/ShellContext", () => ({ useShell: () => undefined }));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const SESSION: AgentSession = {
  id: "one",
  runner: "hermes",
  status: "running",
  prompt: "Edit",
  startedAt: "",
  lines: [],
};
let host: HTMLDivElement;
let root: Root;
let words: string;
let arrival: ReturnType<typeof voiceRouting>;
let busy: ReturnType<typeof vi.fn<(busy: boolean) => void>>;
beforeEach(() => {
  closeAgentSession();
  localStorage.clear();
  selectVoiceAgent();
  send.mockReset().mockResolvedValue({ kind: "sent", session: SESSION });
  intent.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  words = "make an image with FLUX of a penguin";
  arrival = voiceRouting();
  busy = vi.fn();
  vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(
    document.body,
  );
  vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
    fn();
    return 1;
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document
    .querySelectorAll("textarea[data-fixture]")
    .forEach((el) => el.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const field = (id: string, value = "Existing prompt") => {
  const el = document.createElement("textarea");
  el.id = id;
  el.dataset.fixture = "true";
  el.value = value;
  document.body.append(el);
  return el;
};
const render = async () => {
  await act(async () =>
    root.render(
      <StrictMode>
        <VoiceDestinations
          transcript={words}
          routing={arrival}
          onChange={(next) => {
            words = next;
          }}
          onHandoff={() => {}}
          onBusyChange={busy}
        />
      </StrictMode>,
    ),
  );
};
const click = async (label: string) => {
  const button = [...host.querySelectorAll("button")].find(
    (el) => el.textContent === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
};

it("defaults to the agent once, even for a Camera request in StrictMode", async () => {
  const prompt = field("description");
  await render();
  expect(send).toHaveBeenCalledExactlyOnceWith(words, undefined, undefined);
  expect(intent).not.toHaveBeenCalled();
  expect(prompt.value).toBe("Existing prompt");
  expect(host.textContent).toContain("Sent to Hermes");
  expect(busy.mock.calls).toEqual([[true], [false]]);
});

it("a refusal keeps the words without changing a prompt or retrying automatically", async () => {
  const prompt = field("description");
  send.mockRejectedValue(
    new Error("Connection uncertain; inspect the conversation."),
  );
  await render();
  expect(send).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Connection uncertain");
  expect(prompt.value).toBe("Existing prompt");
  expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
    words,
  );
});

it("keeps a correction bound to the session that received the note after another is selected", async () => {
  await render();
  expect(voiceRouting().agent?.session.id).toBe("one");
  await act(async () => selectVoiceAgent({ ...SESSION, id: "two" }));
  words = "make the penguin blue";
  await render();
  await click("Send correction");
  expect(send).toHaveBeenLastCalledWith(words, undefined, {
    session: SESSION,
    projectId: undefined,
  });
  expect(voiceRouting().agent?.session.id).toBe("two");
});

it("a new note reuses the pinned conversation without selecting it again", async () => {
  await render();
  await act(async () => root.unmount());
  root = createRoot(host);
  arrival = voiceRouting();
  words = "Make it slower";
  await render();
  expect(send).toHaveBeenLastCalledWith(words, undefined, {
    session: SESSION,
    projectId: undefined,
  });
});

it("only an explicit action sends an existing transcript to a changed destination", async () => {
  const prompt = field("description");
  await render();
  await act(async () => setVoiceDestination("prompt:description"));
  expect(prompt.value).toBe("Existing prompt");
  expect(send).toHaveBeenCalledOnce();
  await click("Send to selected destination");
  expect(prompt.value).toBe(words);
  expect(send).toHaveBeenCalledOnce();
});

it("an unavailable named prompt never falls back to a different visible prompt", async () => {
  const other = field("description");
  setVoiceDestination("prompt:prompt-audio");
  arrival = voiceRouting();
  await render();
  expect(other.value).toBe("Existing prompt");
  expect(send).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Audio gap is no longer open");
});

it("prompt correction targets the original field and holds if that field closed", async () => {
  const original = field("prompt-action");
  const other = field("description");
  setVoiceDestination("prompt:prompt-action");
  arrival = voiceRouting();
  await render();
  expect(original.value).toBe(words);
  original.remove();
  words = "Jump higher";
  await render();
  await click("Update prompt");
  expect(other.value).toBe("Existing prompt");
  expect(host.textContent).toContain("Action gap is no longer open");
});

it("explicit Camera request mode preserves the parser without invoking an agent", async () => {
  setVoiceDestination("camera");
  arrival = voiceRouting();
  intent.mockReturnValue({ label: "Klein", subject: "a penguin" });
  await render();
  expect(intent).toHaveBeenCalledExactlyOnceWith(words, undefined);
  expect(send).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Nothing runs until you press Generate");
});

it("a reused Scroll cell prompt cannot apply a correction to a different cell", async () => {
  const prompt = field("scroll-cell-prompt", "Cell A");
  prompt.dataset.voiceScope = "scroll-one:cell-a";
  setVoiceDestination("prompt:scroll-cell-prompt");
  arrival = voiceRouting();
  await render();
  expect(prompt.value).toBe(words);
  // ScrollInspector reuses this DOM node when the selection changes.
  prompt.dataset.voiceScope = "scroll-one:cell-b";
  prompt.value = "Cell B";
  words = "A corrected direction for cell A";
  await render();
  await click("Update prompt");
  expect(prompt.value).toBe("Cell B");
  expect(host.textContent).toContain("different document or item");
});
