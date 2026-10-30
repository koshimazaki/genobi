import { expect, it } from "vitest";
import { installProcess } from "../server/voice-install-process";
it("stops the setup process when installation is cancelled", async () => {
  const controller = new AbortController();
  const child = installProcess(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    controller.signal,
    10000,
  );
  setTimeout(() => controller.abort(), 20);
  await expect(child).rejects.toThrow("cancelled");
});
it("fails closed on a failed or missing setup command", async () => {
  await expect(
    installProcess(
      process.execPath,
      ["-e", "process.exit(1)"],
      new AbortController().signal,
    ),
  ).rejects.toThrow("failed");
  await expect(
    installProcess("/missing/genobi-setup", [], new AbortController().signal),
  ).rejects.toThrow("could not start");
});
