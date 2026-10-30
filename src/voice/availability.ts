import { readHostedStudio } from "../hosted-studio";

export const HOSTED_VOICE_MESSAGE =
  "Voice mode runs in the local studio — speech is transcribed on your own machine";
export const LOCAL_SETUP_URL =
  "https://github.com/koshimazaki/Genobi/blob/main/README.md#run-locally";
export const VOICE_UNCONFIRMED_MESSAGE =
  "The studio could not confirm local voice availability. Check the connection and reload to try again.";

/** Also guards setup/polling clients before hosted detection has resolved. */
export async function requireLocalVoice(signal?: AbortSignal) {
  signal?.throwIfAborted();
  // Detection is shared and unbounded; the caller's signal bounds this wait.
  const aborted = new Promise<never>((_, reject) =>
    signal?.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    }),
  );
  const hosted = await Promise.race([readHostedStudio(), aborted]);
  if (hosted !== false)
    throw new Error(hosted ? HOSTED_VOICE_MESSAGE : VOICE_UNCONFIRMED_MESSAGE);
  signal?.throwIfAborted();
}
