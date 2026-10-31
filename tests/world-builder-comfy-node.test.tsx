import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { inComfyNode } from "../src/world-builder/host";
import {
  COMFY_HIDDEN_PRESETS,
  menuPreset,
  presetMenu,
  SHADER_PRESET,
} from "../src/world-builder/preset-menu";
import {
  defaultRecipe,
  presets,
  validateRecipe,
} from "../src/world-builder/recipe";
import { sourceName } from "../src/world-builder/AudioRecentMenu";
import { MOTION_PRESETS } from "../src/world-builder/motion-presets";
import { LiveControls } from "../src/world-builder/LiveControls";
import { AudioControls } from "../src/world-builder/AudioControls";
import { togglePlay, EXAMPLE_TRACK } from "../src/world-builder/example-track";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { WorldEditor } from "../src/world-builder/useWorldEditor";

const asComfy = (on: boolean) => {
  globalThis.__genobiWorldHost = on ? "comfy" : undefined;
};
afterEach(() => asComfy(false));

describe("World Builder inside the Comfy node", () => {
  it("knows it is the node only when the bundle says so", () => {
    expect(inComfyNode()).toBe(false);
    asComfy(true);
    expect(inComfyNode()).toBe(true);
    // The node bundle defines the flag at build time; the studio never does.
    expect(readFileSync("scripts/build-scene-adapter.mjs", "utf8")).toContain(
      `"globalThis.__genobiWorldHost": '"comfy"'`,
    );
  });

  it("keeps the shader preset in the studio and leaves it out of the node", () => {
    const studio = presetMenu(false),
      node = presetMenu(true);
    expect(studio).toEqual([
      ...MOTION_PRESETS.map((preset) => preset.name),
      ...Object.keys(presets),
      SHADER_PRESET,
    ]);
    expect(node).not.toContain(SHADER_PRESET);
    expect(node).toEqual(
      studio.filter((name) => !COMFY_HIDDEN_PRESETS.includes(name)),
    );
    expect(node).toContain("Small room");
    for (const preset of MOTION_PRESETS) {
      expect(node).toContain(preset.name);
      expect(menuPreset(preset.name).motion?.stateKeys).toHaveLength(3);
    }
  });

  it("drops the agent pairing button inside Comfy and keeps it in the studio", () => {
    const s = {
      api: { current: null },
      ready: true,
      busy: false,
    } as unknown as BuilderSession;
    const e = { mode: "shot" } as WorldEditor;
    expect(renderToStaticMarkup(<LiveControls s={s} e={e} />)).toContain(
      "Connect agents",
    );
    asComfy(true);
    expect(renderToStaticMarkup(<LiveControls s={s} e={e} />)).not.toContain(
      "Connect agents",
    );
  });

  it("names the graph's audio as graph outputs inside Comfy", () => {
    expect(sourceName("comfy", false)).toBe("Comfy");
    expect(sourceName("comfy", true)).toBe("Graph output");
    expect(sourceName("example", true)).toBe("Example");
    const s = {
      recipe: menuPreset("Club"),
      frame: 0,
      playing: false,
      audioURL: "",
      audioName: "",
      example: { blob: null, label: "", credit: "" },
      history: { recent: [], persisted: true },
    } as unknown as BuilderSession;
    const project = [
      {
        id: "p",
        label: "Project song",
        source: "project" as const,
        bytes: 1,
        open: () => new Blob(),
      },
    ];
    expect(
      renderToStaticMarkup(<AudioControls s={s} projectAudio={project} />),
    ).toContain("Project song");
    asComfy(true);
    const html = renderToStaticMarkup(
      <AudioControls s={s} projectAudio={project} />,
    );
    expect(html).toContain("Graph audio outputs");
    expect(html).not.toContain("Project song");
  });
});

describe("The example track", () => {
  it("is the first minute of Dimensions, bundled as an MP3", () => {
    expect(EXAMPLE_TRACK.path).toBe(
      "./media/director-templates/dimensions-mix/mix-track.mp3",
    );
    expect(
      readFileSync(`public/${EXAMPLE_TRACK.path.slice(2)}`).byteLength,
    ).toBeLessThan(1.5 * 1024 * 1024);
    expect(EXAMPLE_TRACK).toMatchObject({
      label: "Dimensions",
      credit: "Koshi Mosaic · Dimensions",
    });
    expect(readFileSync("LICENCES.md", "utf8")).toContain("mix-track.mp3");
  });

  it("loads and plays on the first Play with no track, then plays as usual", async () => {
    const calls: string[] = [];
    const s = {
      playing: false,
      audioURL: "",
      example: {
        blob: new Blob(["x"]),
        label: EXAMPLE_TRACK.label,
        credit: EXAMPLE_TRACK.credit,
      },
      setPlaying: (v: boolean) => calls.push(`play:${v}`),
      run: (work: () => Promise<unknown>) => void work(),
      loadAudio: async (_b: Blob, source: string, label?: string) => {
        calls.push(`load:${source}:${label}`);
      },
    };
    togglePlay(s);
    await new Promise((done) => setTimeout(done, 0));
    expect(calls).toEqual([`load:example:${EXAMPLE_TRACK.label}`, "play:true"]);
    calls.length = 0;
    togglePlay({ ...s, audioURL: "blob:loaded" });
    togglePlay({ ...s, example: { blob: null, label: "", credit: "" } });
    expect(calls).toEqual(["play:true", "play:true"]);
  });
});

describe("The Genobi deck", () => {
  const zIndexes = (file: string, selector: RegExp) =>
    [
      ...readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .matchAll(/([^{}]+)\{([^}]*)\}/g),
    ]
      .filter(([, sel]) => selector.test(sel.trim()))
      .flatMap(([, , body]) =>
        [...body.matchAll(/z-index:\s*(-?\d+)/g)].map((m) => Number(m[1])),
      );
  it("sits above World Builder's docked panels and below popovers", () => {
    const [deck] = zIndexes("src/deck/deck.css", /^\.genobi-deck$/);
    const panels = zIndexes(
      "src/world-builder/world-builder-panels.css",
      /^\.wb-panel(:focus-within)?$/,
    );
    const [popover] = zIndexes("src/components/anchored-popover.css", /./);
    expect(panels.length).toBe(2);
    expect(deck).toBeGreaterThan(Math.max(...panels));
    expect(deck).toBeLessThan(popover);
  });

  it("keeps the Stage backdrop unless a recipe removes it", () => {
    expect(validateRecipe(defaultRecipe).screen).toBeUndefined();
    expect(validateRecipe({ ...defaultRecipe, screen: false }).screen).toBe(
      false,
    );
    expect(() => validateRecipe({ ...defaultRecipe, screen: "no" })).toThrow(
      "screen must be true or false.",
    );
  });

  it("shows the editor inline in the node and lifts the same one to a modal", () => {
    const node = readFileSync(
      "custom_nodes/director_world_builder/web/extension.js",
      "utf8",
    );
    expect(node).toContain("addDOMWidget(");
    expect(node).toContain("dialog.showModal()");
    expect(node).toContain('type: "director:layout"');
    expect(
      readFileSync("src/world-builder/host-messages.ts", "utf8"),
    ).toContain('"director:layout"');
  });
});
