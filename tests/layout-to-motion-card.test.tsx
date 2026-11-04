// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import FamilyModelSelector from "../src/components/FamilyModelSelector";
import { entryFor, selectionFor } from "../shared/registry";
import { takeVersionOpen } from "../src/director/version-open-request";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  history.replaceState(null, "", "/");
});

it("lists Audio Reactive · Layout to Motion under the LTX models as a route, not a model, and only opens the Director", () => {
  const { generator, model } = selectionFor("ltx-2-5-open")!;
  const chosen = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <FamilyModelSelector
        generator={generator}
        model={model}
        openOnly={false}
        onChoose={chosen}
        onOpenOnlyChange={() => {}}
      />,
    ),
  );
  expect(entryFor(generator, model).family).toBe("ltx");
  act(() =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="LTX models"]')!
      .click(),
  );
  const card = document.querySelector(
    '[aria-label="Audio Reactive · Layout to Motion"]',
  )!;
  expect(card).not.toBeNull();
  // Outside the listbox: never a selectable registry option.
  expect(card.closest('[role="listbox"]')).toBeNull();
  expect(card.textContent).toContain("genobi-ltx-world-v2");
  const routed = vi.fn();
  window.addEventListener("popstate", routed);
  act(() => card.querySelector("button")!.click());
  window.removeEventListener("popstate", routed);
  expect(routed).toHaveBeenCalledTimes(1);
  expect(location.pathname + location.search).toBe(
    "/director?example=audio-reactive-drop",
  );
  expect(takeVersionOpen("audio-reactive-drop")).toBe(true);
  expect(takeVersionOpen("audio-reactive-drop")).toBe(false);
  expect(chosen).not.toHaveBeenCalled();
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});
