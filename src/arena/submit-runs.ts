import type { ArenaSlot } from "../../shared/arena";
import type { GenerateInput, Job } from "../../shared/types";
import type { Quote } from "../../shared/quote";

/** Submit independent approved approaches together, exactly once per saved key. */
export async function submitArenaRuns(
  slots: ArenaSlot[],
  inputs: GenerateInput[],
  quotes: Quote[],
  keys: Map<string, string>,
  submit: (
    input: GenerateInput,
    headers: Record<string, string>,
  ) => Promise<Job>,
  record: (slotId: string, job: Job) => void,
) {
  const started: Record<string, string> = {},
    failures: string[] = [];
  await Promise.all(
    slots.map(async (slot, i) => {
      try {
        const job = await submit(inputs[i], {
          "Idempotency-Key": keys.get(slot.id)!,
          "Quote-Id": quotes[i].id,
        });
        started[slot.id] = job.id;
        record(slot.id, job);
      } catch (error) {
        failures.push(`${slot.label}: ${(error as Error).message}`);
      }
    }),
  );
  return { started, failures };
}
