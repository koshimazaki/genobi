#!/usr/bin/env node
import { commandError, HELP, run } from "./run";

try {
  const result = await run(process.argv.slice(2));
  process.stdout.write(
    result === HELP ? HELP : `${JSON.stringify(result ?? null, null, 2)}\n`,
  );
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: commandError(error) })}\n`);
  process.exitCode = 1;
}
