export const ROUTER_BASE: string;
export const MODELS: string[];
export interface RouterRead {
  path: string;
  status: number;
  type: string | null;
}
export interface RouterVerdict {
  code: 0 | 1 | 2;
  line: string;
}
export function validKey(key: unknown): key is string;
export function verdict(reads: RouterRead[]): RouterVerdict;
export function checkRouter(
  key: string,
  fetcher?: typeof fetch,
): Promise<{ reads: RouterRead[] } & RouterVerdict>;
