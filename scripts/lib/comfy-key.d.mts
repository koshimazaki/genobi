export function keychainComfyKey(): Promise<string | undefined>;
export function comfyKey(
  env?: Record<string, string | undefined>,
  readKeychain?: () => Promise<string | undefined>,
): Promise<{ key: string | undefined; source: string | undefined }>;
