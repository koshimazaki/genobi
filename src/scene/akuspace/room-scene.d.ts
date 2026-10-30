import type {
  AcousticViewerState,
  AcousticViewerMetrics,
  AcousticViewerPreset,
} from "../acoustic-layout";
export class RoomScene {
  constructor(canvas: HTMLCanvasElement, options?: { compact?: boolean });
  update(
    state: AcousticViewerState,
    metrics: AcousticViewerMetrics,
    preset: AcousticViewerPreset,
  ): void;
  replay(reduced: boolean): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}
