import { ComfyRouter } from "../shared/comfy/router";
import { isComfyKey, type Provider } from "../shared/provider";
import { BflClient } from "./bfl";

/**
 * One key, one provider. A key with Comfy's documented prefix goes to Comfy
 * Router; any other key goes to BFL direct, the provider the studio started
 * with and keeps for upscales. Both local and hosted adapters pick this way.
 */
export interface Providers {
  bfl: Provider;
  comfy: Provider;
}
export const defaultProviders = (): Providers => ({
  bfl: new BflClient(),
  comfy: new ComfyRouter(),
});
export function providerFor(key: string, providers: Providers): Provider {
  return isComfyKey(key) ? providers.comfy : providers.bfl;
}
