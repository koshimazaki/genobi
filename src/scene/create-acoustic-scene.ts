import type { AcousticSetting } from "../../shared/acoustic";
import { RoomScene } from "./akuspace/room-scene.js";
import { acousticViewerValues } from "./acoustic-layout";

/** React lifecycle adapter around the original AKUSPACE viewer. */
export function createAcousticScene(canvas: HTMLCanvasElement) {
  const scene = new RoomScene(canvas);
  const css = getComputedStyle(canvas);
  const palette = ["--acoustic", "--sunken"].map((name) =>
    css.getPropertyValue(name).trim(),
  );
  return {
    play(setting: AcousticSetting | null, reduced: boolean) {
      const values = acousticViewerValues(setting, palette);
      scene.update(values.state, values.metrics, values.preset);
      scene.replay(reduced);
    },
    setVisible: (visible: boolean) => scene.setVisible(visible),
    dispose: () => scene.dispose(),
  };
}
