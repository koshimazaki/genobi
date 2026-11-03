// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import GenerateButton from "../src/components/GenerateButton";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

const klein = [
  { value: "comfy", label: "Comfy workflow" },
  { value: "bfl", label: "BFL API" },
];
// FLUX 3 image models offer three routes (GenerateAction).
const flux = [
  { value: "auto", label: "Auto" },
  { value: "bfl", label: "BFL API" },
  { value: "comfy", label: "Comfy Router" },
];
const CONFIGURE = "Configure API keys / run location…";
type Props = Partial<Parameters<typeof GenerateButton>[0]>;

function mount(props: Props = {}) {
  const change = vi.fn();
  const configure = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const render = (more: Props = {}) =>
    act(() =>
      root!.render(
        <GenerateButton
          generator="image"
          submitting={false}
          disabled
          hasKey
          hold={null}
          onSubmit={() => {}}
          onResume={() => {}}
          providerChoices={klein}
          providerValue="comfy"
          onProviderChange={change}
          onConfigure={configure}
          {...props}
          {...more}
        />,
      ),
    );
  render();
  return { change, configure, render };
}
const trigger = () =>
  document.querySelector<HTMLButtonElement>(".generate-split__trigger")!;
const menu = () =>
  document.querySelector<HTMLElement>(
    '[role="dialog"][aria-label="Generation provider"]',
  );
const tile = (text: string) =>
  Array.from(menu()!.querySelectorAll<HTMLButtonElement>("[data-choice]")).find(
    (button) => button.textContent === text,
  )!;
const key = (target: Element, name: string) =>
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: name, bubbles: true }),
    );
  });

describe("the Generate provider menu", () => {
  it("names the current provider on the trigger", () => {
    const { render } = mount();
    expect(trigger().getAttribute("aria-label")).toBe(
      "Generation provider: Comfy workflow",
    );
    render({ providerChoices: flux, providerValue: "auto" });
    expect(trigger().getAttribute("aria-label")).toBe(
      "Generation provider: Auto",
    );
    expect(trigger().textContent).toContain("AUTO");
  });

  it("opens a themed panel even while Generate is blocked", () => {
    mount();
    expect(trigger().getAttribute("aria-disabled")).toBeNull();
    expect(trigger().textContent).toContain("COMFY");
    act(() => trigger().click());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(menu()?.classList).toContain("dir-direction-popover");
    expect(tile("Comfy workflow").getAttribute("aria-pressed")).toBe("true");
    expect(tile("BFL API").getAttribute("aria-pressed")).toBe("false");
    // The current provider takes focus first.
    expect(document.activeElement).toBe(tile("Comfy workflow"));
  });

  it("chooses a provider, closes and returns focus", () => {
    const { change, configure } = mount();
    act(() => trigger().click());
    act(() => tile("BFL API").click());
    expect(change).toHaveBeenCalledWith("bfl");
    expect(configure).not.toHaveBeenCalled();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("opens settings from the Configure row without changing provider", () => {
    const { change, configure } = mount();
    act(() => trigger().click());
    act(() => tile(CONFIGURE).click());
    expect(configure).toHaveBeenCalledOnce();
    expect(change).not.toHaveBeenCalled();
    expect(menu()).toBeNull();
  });

  it("moves through the tiles as a grid from the keyboard", () => {
    const { change } = mount();
    key(trigger(), "ArrowDown");
    expect(menu()).not.toBeNull();
    expect(document.activeElement).toBe(tile("Comfy workflow"));
    key(document.activeElement!, "ArrowRight");
    expect(document.activeElement).toBe(tile("BFL API"));
    key(document.activeElement!, "ArrowLeft");
    // Down from the first tile drops to the Configure row below the pair.
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(tile(CONFIGURE));
    key(document.activeElement!, "ArrowUp");
    expect(document.activeElement).toBe(tile("Comfy workflow"));
    key(document.activeElement!, "ArrowRight");
    // A focused button activates on Enter natively; jsdom needs the click.
    act(() => (document.activeElement as HTMLButtonElement).click());
    expect(change).toHaveBeenCalledWith("bfl");
    key(trigger(), "ArrowDown");
    key(document.activeElement!, "Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("lays three routes out in one row above Configure", () => {
    mount({ providerChoices: flux, providerValue: "auto" });
    key(trigger(), "ArrowDown");
    const group = menu()!.querySelector<HTMLElement>('[role="group"]')!;
    expect(group.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
    expect(document.activeElement).toBe(tile("Auto"));
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(tile(CONFIGURE));
  });

  for (const [name, routes] of [
    ["Klein", klein],
    ["FLUX 3", flux],
  ] as const) {
    it(`goes between every ${name} tile and Configure with Up and Down`, () => {
      mount({ providerChoices: routes, providerValue: routes[0].value });
      key(trigger(), "ArrowDown");
      for (const route of routes) {
        for (const [away, back] of [
          ["ArrowDown", "ArrowUp"],
          ["ArrowUp", "ArrowDown"],
        ]) {
          act(() => tile(route.label).focus());
          key(document.activeElement!, away);
          expect(document.activeElement).toBe(tile(CONFIGURE));
          key(document.activeElement!, back);
          expect(document.activeElement).toBe(tile(route.label));
        }
      }
    });
  }

  it("returns from Configure to the tile Right left it from", () => {
    mount({ providerChoices: flux, providerValue: "bfl" });
    key(trigger(), "ArrowDown");
    expect(document.activeElement).toBe(tile("BFL API"));
    key(document.activeElement!, "ArrowRight");
    key(document.activeElement!, "ArrowRight");
    expect(document.activeElement).toBe(tile(CONFIGURE));
    key(document.activeElement!, "ArrowUp");
    expect(document.activeElement).toBe(tile("Comfy Router"));
  });

  it("is unavailable while a run is being sent", () => {
    const { change } = mount({ submitting: true });
    expect(trigger().getAttribute("aria-disabled")).toBe("true");
    act(() => trigger().click());
    key(trigger(), "ArrowDown");
    expect(menu()).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });

  it("closes onto the trigger when a run starts while it is open", () => {
    const { render } = mount();
    act(() => trigger().click());
    expect(document.activeElement).toBe(tile("Comfy workflow"));
    render({ submitting: true });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});
