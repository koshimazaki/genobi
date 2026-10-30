import type * as THREE from "three";
import type { Parameters } from "../../shared/director/types";
export interface GraphicsInstance {
  output: HTMLCanvasElement | THREE.Texture;
  render(args: {
    timeSeconds: number;
    inputTexture?: THREE.Texture;
  }): void | Promise<void>;
  dispose(): void;
}
export interface GraphicsContext {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  parameters: Parameters;
  libraries: Record<string, unknown>;
  renderer: THREE.WebGLRenderer;
}
