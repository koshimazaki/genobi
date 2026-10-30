declare module "*.mjs" {
  export function createLayer(
    context: import("./module-types").GraphicsContext,
  ):
    | Promise<import("./module-types").GraphicsInstance>
    | import("./module-types").GraphicsInstance;
}
