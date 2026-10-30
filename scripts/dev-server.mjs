// `npm run dev`: runs the local server and starts it again when it exits with
// the restart code (Development → Restart local server), so new server code
// is picked up without finding this terminal. Any other exit ends the script.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Matches `RESTART_EXIT_CODE` in server/server-restart.ts. */
const RESTART = 75;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let child;
let stopping = false;

function start() {
  child = spawn(
    process.execPath,
    ["--import", "tsx", path.join(root, "server/index.ts")],
    {
      cwd: root,
      env: { ...process.env, GENOBI_RESTARTABLE: "1" },
      stdio: "inherit",
    },
  );
  child.on("exit", (code, signal) => {
    if (!stopping && code === RESTART) {
      console.log("Restarting the local server with the current code…");
      start();
      return;
    }
    process.exit(code ?? (signal ? 1 : 0));
  });
}

// Ctrl-C already reaches the server through the terminal's process group.
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
  child.kill("SIGTERM");
});
start();
