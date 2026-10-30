// Launched by a private .command file in Terminal, with an inherited real TTY.
// No input/output capture: the harness owns interactive prompts and permissions.
import { readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const plan = JSON.parse(readFileSync(process.argv[2], "utf8"));
// A run grant only ever comes from the plan the studio wrote for this session
// (a Genobi agent session's, which ties its quotes to the studio); never one
// inherited from the shell.
const inherited = { ...process.env };
delete inherited.GENOBI_AGENT_RUN;
const env = { ...inherited, ...plan.env, GENOBI_AGENT_SESSION: "1" };
delete env.COMFY_API_KEY;
delete env.BFL_API_KEY;
delete env.RUNWARE_API_KEY;
const save = (status) => {
  try {
    writeFileSync(plan.statusFile, JSON.stringify({ status }), { mode: 0o600 });
  } catch {
    /* The studio already let the session go and removed its folder. */
  }
};
/** The window was closed: the receipt says so, whatever the harness's exit. */
let hungUp = false;
/** The harness (or its sign-in) running in the foreground now. */
let child;
// The terminal forwards signals to the foreground group, including the harness.
process.on("SIGINT", () => {});
process.on("SIGTERM", () => child?.kill("SIGTERM"));
// Closing the window hangs up the whole group. Node's default would exit
// before the harness's exit is seen, leaving no receipt and a session the
// studio follows forever: write the receipt at once, then let the harness go.
process.on("SIGHUP", () => {
  hungUp = true;
  save("closed");
  child?.kill("SIGHUP");
});
const run = (args) =>
  new Promise((resolve) => {
    child = spawn(plan.command, args, { cwd: plan.cwd, env, stdio: "inherit" });
    child.on("error", () => resolve(undefined));
    child.on("exit", (code) => resolve(code ?? 1));
  });

/**
 * Whether the harness already holds a sign-in for the provider, asked of its
 * own read-only list (`hermes -p genobi auth list <provider>`). `auth add`
 * is not idempotent (each run adds a credential, and Nous starts another
 * login), so a sign-in that landed between the studio's read and this window
 * is not added twice. Its output is matched here and never printed.
 */
function signedIn(signIn) {
  const answer = spawnSync(plan.command, signIn.check, {
    cwd: plan.cwd,
    env,
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
    timeout: 15_000,
  });
  if (answer.error || answer.status !== 0) return undefined;
  return new RegExp(signIn.signedIn, "m").test(answer.stdout);
}

// The studio saw the harness signed out: sign in here first, then the chat
// in the same window. A sign-in that fails or is abandoned ends the window's
// session as failed; the chat does not start without it.
if (plan.signIn && signedIn(plan.signIn) !== true) {
  console.log("Signing in first. The chat starts here when that is done.\n");
  const code = await run(plan.signIn.args);
  if (!hungUp && code !== 0) {
    save("failed");
    console.error(
      "\nSigning in did not finish. Close this window and start Genobi again from the studio.",
    );
    process.exit(code ?? 1);
  }
  if (!hungUp) save("signed-in");
}

if (!hungUp) {
  const code = await run(plan.args);
  if (code === undefined) {
    save("failed");
    console.error(
      "Could not open the selected harness. Check its installation and login.",
    );
    process.exitCode = 1;
  } else {
    save(hungUp || code === 0 ? "closed" : "failed");
    process.exitCode = code;
  }
}
