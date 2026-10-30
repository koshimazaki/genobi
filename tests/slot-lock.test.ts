import { expect, it } from "vitest";
import { SlotLock } from "../server/slot-lock";

const gate = () => {
  let open!: () => void;
  const shut = new Promise<void>((resolve) => (open = resolve));
  return { shut, open };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

it("lets runs share a slot, and a change wait for them and go before later runs", async () => {
  const lock = new SlotLock();
  const order: string[] = [];
  const first = gate();
  const a = lock.shared(async () => {
    order.push("run a");
    await first.shut;
    order.push("run a done");
  });
  const b = lock.shared(async () => void order.push("run b"));
  const change = lock.exclusive(async () => void order.push("change"));
  const c = lock.shared(async () => void order.push("run c"));
  await tick();
  expect(order).toEqual(["run a", "run b"]);
  first.open();
  await Promise.all([a, b, change, c]);
  expect(order).toEqual(["run a", "run b", "run a done", "change", "run c"]);
});

it("releases the slot when the work throws", async () => {
  const lock = new SlotLock();
  await expect(
    lock.exclusive(async () => {
      throw new Error("refused");
    }),
  ).rejects.toThrow("refused");
  expect(await lock.shared(async () => "free")).toBe("free");
});
