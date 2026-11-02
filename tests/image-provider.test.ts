import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { validateInput } from "../server/validation";
import { runCredential, ServerKeys } from "../server/keys";
import { chooseKey, payingKeyKind } from "../shared/provider";
import GenerateButton from "../src/components/GenerateButton";
import GenerateAction from "../src/components/GenerateAction";
import { initialComposer } from "../src/useComposer";

const image = {
  generator: "image",
  model: "flux-3",
  description: "A minimalist city skyline.",
};
const keys = {
  comfy: "comfyui-provider-test-key",
  bfl: "bfl-provider-test-key",
};

describe("image provider selection", () => {
  it("keeps Auto compatible with existing jobs, and validates explicit choices", () => {
    expect(validateInput(image).imageProvider).toBe("auto");
    expect(
      validateInput({ ...image, imageProvider: "comfy" }).imageProvider,
    ).toBe("comfy");
    expect(
      validateInput({ ...image, imageProvider: "bfl" }).imageProvider,
    ).toBe("bfl");
    expect(() =>
      validateInput({ ...image, imageProvider: "anything" }),
    ).toThrow("provider");
    expect(() =>
      validateInput({
        ...image,
        model: "flux-3-klein",
        imageProvider: "bfl",
      }),
    ).toThrow("provider");
  });

  it("routes both-connected keys to exactly the chosen provider", () => {
    expect(chooseKey("image", "flux-3", keys)).toBe(keys.bfl);
    expect(chooseKey("image", "flux-3", keys, "comfy")).toBe(keys.comfy);
    expect(chooseKey("image", "flux-3", keys, "bfl")).toBe(keys.bfl);
    expect(
      chooseKey("image", "flux-3", { comfy: keys.comfy }, "bfl"),
    ).toBeUndefined();
    expect(
      payingKeyKind("image", "flux-3", { comfy: true, bfl: true }, "comfy"),
    ).toBe("comfy");
    const server = new ServerKeys(keys);
    expect(
      runCredential(server, "image", "flux-3", undefined, undefined, "comfy")
        .key,
    ).toBe(keys.comfy);
    expect(
      runCredential(server, "image", "flux-3", undefined, undefined, "bfl").key,
    ).toBe(keys.bfl);
    expect(() =>
      runCredential(server, "image", "flux-3", keys.bfl, undefined, "comfy"),
    ).toThrow("other provider");
  });

  it("places an accessible provider selector adjacent to Generate", () => {
    const render = (providerChoices?: { value: string; label: string }[]) =>
      renderToStaticMarkup(
        createElement(GenerateButton, {
          generator: "image",
          submitting: false,
          disabled: false,
          hasKey: true,
          onSubmit: () => {},
          onResume: () => {},
          providerChoices,
          providerValue: "comfy",
          onProviderChange: () => {},
        }),
      );
    expect(
      render([
        { value: "auto", label: "Auto" },
        { value: "comfy", label: "Comfy Router" },
        { value: "bfl", label: "BFL API" },
      ]),
    ).toContain('aria-label="Generation provider"');
    expect(render()).not.toContain('aria-label="Generation provider"');
  });

  it("keeps provider menu enabled when Generate is blocked", () => {
    const markup = renderToStaticMarkup(
      createElement(GenerateButton, {
        generator: "image",
        submitting: false,
        disabled: true,
        hasKey: false,
        onSubmit: () => {},
        onResume: () => {},
        providerChoices: [
          { value: "comfy", label: "Comfy workflow" },
          { value: "bfl", label: "BFL API" },
        ],
        providerValue: "comfy",
        onProviderChange: () => {},
        onConfigure: () => {},
      }),
    );
    expect(markup).toContain("Configure API keys / run location…");
    const selector = markup.match(/<select[^>]*>/)?.[0];
    expect(selector).toContain('aria-label="Generation provider"');
    expect(selector).not.toContain("disabled");
  });

  it("renders Klein providers and API setup in Generate", () => {
    const markup = renderToStaticMarkup(
      createElement(GenerateAction, {
        state: {
          ...initialComposer,
          generator: "image",
          model: "flux-3-klein",
        },
        jobs: [],
        submitting: false,
        disabled: false,
        hasKey: false,
        recreating: false,
        onSubmit: () => {},
        onResume: () => {},
        onUpdate: () => {},
        onConfigure: () => {},
      }),
    );
    expect(markup).toContain('value="comfy"');
    expect(markup).toContain('value="bfl"');
    expect(markup).toContain('value="configure"');
    expect(markup).toContain("Comfy workflow");
    expect(markup).toContain("BFL API");
  });
});
