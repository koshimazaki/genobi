// What setup's start tells the agent from this server's own state
// (`shared/agent-setup.ts`): the key slots that hold a key, by name, and the
// voice model folder the voice service is configured with, only when that
// folder holds a model. The folder goes into the agent's brief alone; the page
// never sends or receives it, and no key value is read here.
import type { SetupFacts } from "../shared/agent-setup";
import type { KeysStatus } from "../shared/keys";
import { KEY_KINDS } from "./keys";
import type { VoiceConfig, VoiceStatus } from "./voice";

export function setupFacts(
  keys: { status: () => KeysStatus },
  voice: { config: VoiceConfig; status: () => Promise<VoiceStatus> },
) {
  return async (): Promise<SetupFacts> => {
    const held = keys.status();
    const model = voice.config.model;
    const found = model ? (await voice.status()).model : false;
    return {
      keys: KEY_KINDS.filter((kind) => held[kind].connected),
      ...(found && model ? { voiceModel: model } : {}),
    };
  };
}
