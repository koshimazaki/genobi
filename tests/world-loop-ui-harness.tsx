import { vi } from "vitest";
import { SceneLoopPanel } from "../src/world-builder/SceneLoopPanel";
import {
  cameraAt,
  cameraFovAt,
  cameraTargetAt,
  presetRecipe,
  validateRecipe,
  type Recipe,
} from "../src/world-builder/recipe";
import type { RecipeGuard } from "../src/world-builder/scene-adapter";
import type { BuilderSession } from "../src/world-builder/useBuilderSession";
import type { WorldEditor } from "../src/world-builder/useWorldEditor";
import type { SceneLoopCameraSelection } from "../src/world-builder/useSceneLoop";
import { mountWorldControl } from "./world-ui-harness";

export const loopTestScene = (x = 0, color = "#de8d69") =>
  validateRecipe({
    ...presetRecipe("Studio"),
    screen: false,
    avatar: false,
    objects: [
      {
        id: "box",
        shape: "box",
        x,
        y: 1,
        z: 0,
        scale: 1,
        spin: 0,
        color,
        prompt: "A block",
      },
    ],
  });

export function mountLoopDesk(recipe = loopTestScene()) {
  let revision = 1;
  let cameraSelection: SceneLoopCameraSelection | undefined;
  const events: string[] = [];
  const capture = vi.fn<(name: string) => Promise<void>>(async () => {
    events.push("capture");
  });
  const settled = vi.fn(async () => {});
  const renderFrame = vi.fn(async (frame: number) => {
    events.push(`render:${frame}`);
    s.frame = frame;
  });
  const commit = async (input: unknown, guard?: RecipeGuard) => {
    if (guard?.expectedRevision !== String(revision))
      throw new Error("The scene changed. Try again.");
    s.recipe = validateRecipe(input);
    revision++;
    events.push("configure");
    return s.recipe;
  };
  const configure = vi.fn(commit);
  const s = {
    recipe,
    frame: 0,
    ready: true,
    busy: false,
    previewOnly: false,
    playing: false,
    capturing: false,
    progress: 0,
    audioName: "Test soundtrack",
    runtime: {
      current: {
        editor: {
          dragging: false,
          cameraPose: () => ({
            position: cameraAt(s.recipe, s.frame),
            target: cameraTargetAt(s.recipe, s.frame),
            fov: cameraFovAt(s.recipe, s.frame),
          }),
        },
      },
    },
    api: {
      current: {
        configure,
        getRecipe: () => structuredClone(s.recipe),
        getRecipeRevision: () => String(revision),
        render: renderFrame,
      },
    },
    setPlaying: vi.fn((next: boolean) => {
      s.playing = next;
    }),
    setLoop: vi.fn(),
    settled,
  } as unknown as BuilderSession;
  const e = {
    mode: "shot",
    chooseMode: vi.fn(),
    select: vi.fn(),
  } as unknown as WorldEditor;
  const camera = vi.fn(),
    sound = vi.fn();
  const panel = () => (
    <SceneLoopPanel
      s={s}
      e={e}
      onCamera={camera}
      onSound={sound}
      onSaveLoop={capture}
      cameraSelection={cameraSelection}
    />
  );
  const mounted = mountWorldControl(panel());
  return {
    ...mounted,
    s,
    e,
    events,
    configure,
    commit,
    renderFrame,
    settled,
    capture,
    camera,
    sound,
    refresh: () => mounted.render(panel()),
    chooseCamera: (next: Recipe) => {
      cameraSelection = { id: (cameraSelection?.id ?? 0) + 1, recipe: next };
      s.recipe = next;
      revision++;
      mounted.render(panel());
    },
    load: (next: Recipe) => {
      s.recipe = next;
      s.frame = 0;
      revision++;
      mounted.render(panel());
    },
  };
}
