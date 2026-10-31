import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { presetRecipe, validateRecipe } from "../src/world-builder/recipe";
import { ModMatrixEditor } from "../src/world-builder/ModMatrixEditor";
import { AudioControls } from "../src/world-builder/AudioControls";
import { SoundSections } from "../src/world-builder/SoundSections";
import type { SignalScope } from "../src/world-builder/useSignalScopes";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";

const playground = presetRecipe("Playground");
const render = (selected = "", recipe = playground) =>
  renderToStaticMarkup(
    <ModMatrixEditor
      recipe={recipe}
      frame={0}
      selected={selected}
      change={() => {}}
    />,
  );

describe("World Builder mod matrix editor", () => {
  it("lists one row per route with its controls", () => {
    const html = render();
    for (const n of [1, 2])
      for (const control of [
        "on",
        "source",
        "target",
        "property",
        "invert",
        "amount",
        "gate",
        "response",
      ])
        expect(html).toContain(`Route ${n} ${control}`);
    expect(html).toContain("Delete route 2");
    expect(html).not.toContain("Route 3 target");
    expect(html).toContain("Add route");
  });

  it("offers Route selected for a selected prop or set piece", () => {
    expect(render("car-a")).toContain("Route selected · car-a");
    const studio = validateRecipe({});
    expect(render("prop:subject", studio)).toContain(
      "Route selected · subject",
    );
    // The floor is not something a route can move.
    expect(render("floor")).toContain("Add route");
  });

  it("stays editable while the track plays", () => {
    const s = {
      recipe: playground,
      frame: 0,
      playing: true,
      audioURL: "blob:x",
      audioName: "",
      inputState: { phase: "idle", frame: 0 },
      example: { blob: null, label: "", credit: "" },
      history: { recent: [], persisted: true },
      change: () => {},
    } as unknown as BuilderSession;
    const html = renderToStaticMarkup(<AudioControls s={s} />);
    const locked = html.slice(html.indexOf("<fieldset disabled"));
    expect(html).toContain("Route 1 target");
    expect(locked).not.toContain("Route 1 target");
  });

  it("sends editor edits through tune, the live path, never change", () => {
    const tune = vi.fn(),
      change = vi.fn();
    const s = {
      recipe: playground,
      frame: 0,
      playing: true,
      audioURL: "blob:x",
      audioName: "",
      example: { blob: null, label: "", credit: "" },
      history: { recent: [], persisted: true },
      tune,
      change,
    } as unknown as BuilderSession;
    // Both components are hook-free, so their element trees can be walked
    // and the real handlers fired without a DOM.
    const find = (
      node: ReactNode,
      match: (el: ReactElement<Record<string, unknown>>) => boolean,
    ): ReactElement<Record<string, unknown>> | undefined => {
      if (Array.isArray(node))
        for (const child of node) {
          const hit = find(child, match);
          if (hit) return hit;
        }
      if (!isValidElement<Record<string, unknown>>(node)) return;
      if (match(node)) return node;
      return find(node.props.children as ReactNode, match);
    };
    // The sections are hook-free; AudioControls only adds the scope loop.
    const editor = find(
      SoundSections({
        s,
        scope: {} as SignalScope,
        tracks: [],
        actions: { pick() {}, forget() {} },
        selected: "",
        folded: false,
      }),
      (el) => el.type === ModMatrixEditor,
    )!;
    const tree = ModMatrixEditor(
      editor.props as Parameters<typeof ModMatrixEditor>[0],
    );
    const add = find(
      tree,
      (el) =>
        el.type === "button" &&
        JSON.stringify(el.props.children).includes("Add route"),
    )!;
    (add.props.onClick as () => void)();
    expect(change).not.toHaveBeenCalled();
    expect(tune).toHaveBeenCalledTimes(1);
    expect(tune.mock.calls[0][0].audioRoutes).toHaveLength(
      playground.audioRoutes.length + 1,
    );
  });
});
