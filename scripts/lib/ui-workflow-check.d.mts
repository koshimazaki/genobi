// Types for ui-workflow-check.mjs (UI-format ComfyUI workflow checks).
export interface UiWorkflow {
  nodes: {
    id: number;
    type: string;
    widgets_values?: unknown[];
    inputs?: { name: string; type: string; link: number | null }[];
    outputs?: { name: string; type: string; links: number[] | null }[];
  }[];
  links: [number, number, number, number, number, string][];
  last_node_id: number;
  last_link_id: number;
}
export const FRONTEND_ONLY: Set<string>;
export const LOADERS: Set<string>;
export function accepts(out: string, input: string): boolean;
export function checkStructure(wf: UiWorkflow): string[];
export function checkSchemas(
  wf: UiWorkflow,
  info: Record<string, unknown>,
): string[];
export function modelFiles(
  wf: UiWorkflow,
): { node: number; type: string; file: string }[];
export function listedModels(texts: string[]): Set<string>;
export function checkGuideSizes(wf: UiWorkflow): string[];
