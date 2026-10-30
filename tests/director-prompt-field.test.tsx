// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import PromptField from "../src/director/PromptField";
import Inspector from "../src/director/Inspector";
import { cutAt } from "../shared/agent-context-direction";
import studio from "../docs/director-bundle/example/studio.json";
import type { Project } from "../shared/director/types";

// The Editor's prompt fields: a draft is never lost when the field goes away
// (another clip selected), and a change from elsewhere never silently
// replaces words the person is still writing.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});
function render(node: React.ReactNode) {
  if (!root) {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }
  act(() => root!.render(node));
}
const area = () => document.querySelector("textarea")!;
/** Types as React sees it: the native setter, then an input event. */
function type(text: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(area(), text);
    area().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const blur = () =>
  act(() =>
    area().dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
const button = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === name)!;
const field = (value: string, commit: (t: string) => string) => (
  <PromptField label="Prompt" value={value} limit={1200} commit={commit} />
);

describe("PromptField", () => {
  it("commits once on blur, and nothing when untouched", () => {
    const commit = vi.fn(() => "");
    render(field("old", commit));
    blur();
    expect(commit).not.toHaveBeenCalled();
    type("new words");
    blur();
    expect(commit).toHaveBeenCalledExactlyOnceWith("new words");
    // The project now holds them: going away writes nothing more.
    render(field("new words", commit));
    act(() => root!.unmount());
    root = null;
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("commits a draft when the field goes away before blur", () => {
    const commit = vi.fn(() => "");
    render(field("", commit));
    type("Hold longer");
    act(() => root!.unmount());
    root = null;
    expect(commit).toHaveBeenCalledExactlyOnceWith("Hold longer");
  });

  it("takes a change from elsewhere into an untouched draft", () => {
    const commit = vi.fn(() => "");
    render(field("old", commit));
    render(field("agent words", commit));
    expect(area().value).toBe("agent words");
    expect(document.querySelector(".dir-prompt-conflict")).toBeNull();
  });

  it("keeps the person's draft over a change from elsewhere, and asks", () => {
    const commit = vi.fn(() => "");
    render(field("old", commit));
    type("my words");
    render(field("agent words", commit));
    expect(area().value).toBe("my words");
    expect(document.body.textContent).toContain("Changed elsewhere");
    // Blur does not write over a change the person has not answered.
    blur();
    expect(commit).not.toHaveBeenCalled();
    act(() => button("Keep mine").click());
    expect(commit).toHaveBeenCalledExactlyOnceWith("my words");
    expect(document.querySelector(".dir-prompt-conflict")).toBeNull();
  });

  it("takes theirs on request, and an unanswered conflict writes nothing", () => {
    const commit = vi.fn(() => "");
    render(field("old", commit));
    type("my words");
    render(field("agent words", commit));
    act(() => button("Use theirs").click());
    expect(area().value).toBe("agent words");
    type("again mine");
    render(field("third", commit));
    act(() => root!.unmount());
    root = null;
    expect(commit).not.toHaveBeenCalled();
  });
});

describe("the clip inspector's prompt", () => {
  it("commits the first clip's draft when another clip is selected", () => {
    const project = structuredClone(studio) as unknown as Project;
    const command = vi.fn(() => "");
    const inspector = (id: string) => (
      <Inspector
        project={project}
        layer={project.layers.find((l) => l.id === id)}
        close={() => {}}
        edit={() => {}}
        duplicate={() => {}}
        remove={() => {}}
        reorder={() => {}}
        replace={() => {}}
        command={command}
        disabled={false}
      />
    );
    render(inspector("plate"));
    type("Slow reveal");
    // Selecting another clip on pointer-down, before any blur.
    render(inspector("photo-1"));
    expect(command).toHaveBeenCalledExactlyOnceWith({
      op: "set-clip-prompt",
      layerId: "plate",
      text: "Slow reveal",
    });
    expect(area().value).toBe("");
  });
});

describe("cutting the session's global prompt", () => {
  it("never halves a surrogate pair", () => {
    const text = `${"a".repeat(1999)}😀b`;
    expect(cutAt(text, 2000)).toBe(1999);
    expect(cutAt("a".repeat(3000), 2000)).toBe(2000);
    expect(cutAt("short", 2000)).toBe(5);
  });
});
