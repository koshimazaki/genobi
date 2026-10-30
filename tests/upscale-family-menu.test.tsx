// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import FamilyModelSelector from "../src/components/FamilyModelSelector";
import {
  composerInput,
  composerReducer,
  initialComposer,
  type ComposerState,
} from "../src/useComposer";
import { entryFor, selectionFor } from "../shared/registry";
import type { Generator, VideoModel } from "../shared/types";

// Both upscalers sit in their own fourth family, Upscale, drawn as an icon
// only after LTX, FLUX and H3. SeedVR2 is ByteDance's model, not BFL's.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

type Choice = { generator: Generator; model: VideoModel };
function mount(model: VideoModel, openOnly = false) {
  const chosen: Choice[] = [];
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <FamilyModelSelector
        generator="upscale"
        model={model}
        openOnly={openOnly}
        onChoose={(choice) => chosen.push(choice)}
        onOpenOnlyChange={() => {}}
      />,
    ),
  );
  return chosen;
}
const familyButtons = () =>
  [
    ...document.querySelectorAll<HTMLButtonElement>(
      ".family-model__segments button",
    ),
  ].map((b) => b.getAttribute("aria-label"));
const upscaleButton = () =>
  document.querySelector<HTMLButtonElement>('[aria-label="Upscale models"]')!;
const rows = () =>
  [...document.querySelectorAll<HTMLElement>('[role="option"]')].map((r) =>
    r.textContent?.trim(),
  );
const openUpscale = () => act(() => upscaleButton().click());
const pick = (label: string) =>
  act(() =>
    [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find((r) => r.textContent?.includes(label))!
      .click(),
  );

describe("the Upscale family", () => {
  it("is a fourth, icon-only family after LTX, FLUX and H3", () => {
    mount("seedvr2-upscale");
    expect(familyButtons()).toEqual([
      "LTX models",
      "FLUX models",
      "H3 models",
      "Upscale models",
    ]);
    const button = upscaleButton();
    // No text label: the icon and the chevron, named by aria-label and title.
    expect(button.textContent?.trim()).toBe("");
    expect(button.title).toBe("Upscale");
    expect(button.querySelectorAll("svg")).toHaveLength(2);
    // The held upscaler is in this family, so its button is the selected one.
    expect(button.className).toBe("is-selected");
    expect(
      document.querySelector('[aria-label="FLUX models"]')!.className,
    ).toBe("");
  });

  it("lists SeedVR2 then FLUX Video Upscale, and FLUX lists no upscaler", () => {
    mount("flux-3");
    openUpscale();
    expect(
      document.querySelector(".family-model__menu-heading")?.textContent,
    ).toContain("Upscale models");
    expect(rows()).toEqual(["SeedVR2 · Video upscale", "FLUX Video Upscale"]);
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="FLUX models"]')!
        .click(),
    );
    expect(rows().some((r) => /upscale/i.test(r ?? ""))).toBe(false);
  });

  it("chooses SeedVR2 as seedvr2-upscale and FLUX as before", () => {
    const fromFlux = mount("flux-3");
    openUpscale();
    pick("SeedVR2");
    expect(fromFlux).toEqual([
      { generator: "upscale", model: "seedvr2-upscale" },
    ]);
    act(() => root!.unmount());
    root = null;
    const fromSeed = mount("seedvr2-upscale");
    openUpscale();
    pick("FLUX Video Upscale");
    expect(fromSeed).toEqual([{ generator: "upscale", model: "flux-3" }]);
    expect(entryFor("upscale", "seedvr2-upscale").id).toBe("seedvr2-upscale");
    expect(entryFor("upscale", "flux-3").id).toBe("flux-video-upscale");
    expect(entryFor("upscale", "ltx-2.5").id).toBe("flux-video-upscale");
  });

  it("sends the same request whichever way SeedVR2 is chosen", () => {
    const base: ComposerState = {
      ...initialComposer,
      generator: "upscale",
      model: "flux-3",
      sourceId: "clip-1",
      openOnly: false,
    };
    const viaMenu = composerReducer(base, {
      type: "update",
      patch: selectionFor("seedvr2-upscale")!,
    });
    const direct = { ...base, model: "seedvr2-upscale" as VideoModel };
    expect(composerInput(viaMenu)).toEqual(composerInput(direct));
    expect(composerInput(viaMenu)).toMatchObject({
      generator: "upscale",
      model: "seedvr2-upscale",
      sourceId: "clip-1",
    });
  });

  it("keeps SeedVR2 alone with Open only, and says FLUX is hidden", () => {
    mount("seedvr2-upscale", true);
    openUpscale();
    expect(rows()).toEqual(["SeedVR2 · Video upscale"]);
    expect(document.querySelector(".family-model__hidden")?.textContent).toBe(
      "1 more with Open only off",
    );
  });
});
