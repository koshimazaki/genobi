import { useEffect, useState } from "react";
import { AGENT_REQUEST_HEADER } from "../../shared/agent-session-events";
import type { DevelopmentRunner } from "../../shared/development-session";
import type {
  DevelopmentRole,
  TerminalSession,
  TerminalState,
} from "../../shared/development-terminal";
import SelectMenu from "../components/SelectMenu";
import ServerRestart from "./ServerRestart";

const labels = { hermes: "Hermes", codex: "Codex", claude: "Claude Code" };
/** Which terminals open: Developer (the supervisor), Creative, or both. */
const roleOptions = {
  developer: { label: "Developer", roles: ["developer"] },
  creative: { label: "Creative", roles: ["creative"] },
  both: { label: "Developer + Creative", roles: ["developer", "creative"] },
} as const satisfies Record<
  string,
  { label: string; roles: readonly DevelopmentRole[] }
>;
type RoleChoice = keyof typeof roleOptions;
const roleLabel = (role: DevelopmentRole) =>
  role === "creative" ? "Creative" : "Developer";
async function request<T>(body?: unknown): Promise<T> {
  const response = await fetch("/api/development/terminal", {
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    headers: {
      [AGENT_REQUEST_HEADER]: "1",
      "Content-Type": "application/json",
    },
  });
  const data = await response.json().catch(() => undefined);
  if (!response.ok || !data)
    throw new Error(
      response.status === 404
        ? "This server predates the native launcher. Stop npm run dev in its terminal and start it again once; later updates restart from here."
        : (data?.error ?? "The native launcher needs the local Genobi server."),
    );
  return data;
}

export default function Launcher({
  onLaunch,
  runner,
  onRunnerChange,
}: {
  onLaunch: (origin: string, ready: boolean) => void;
  runner: DevelopmentRunner;
  onRunnerChange: (runner: DevelopmentRunner) => void;
}) {
  const [state, setState] = useState<TerminalState>();
  const [choice, setChoice] = useState<RoleChoice>("developer");
  const [selected, setSelected] = useState("");
  const [handover, setHandover] = useState("");
  const [useHandover, setUseHandover] = useState(false);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<{
    runner: DevelopmentRunner;
    roles: readonly DevelopmentRole[];
  }>();
  const current = state?.runners.find((r) => r.runner === runner);
  const canOpen = (role: DevelopmentRole) =>
    !!state?.supported &&
    !!current &&
    (role === "creative" ? current.creative : current.available);
  const roles = roleOptions[choice].roles;
  const available = roles.every(canOpen);
  // A resumed conversation keeps the role it was opened with.
  const resumeRole = selected && selected !== "picker" ? roles[0] : undefined;
  useEffect(() => {
    let disposed = false;
    const update = async () => {
      try {
        const next = await request<TerminalState>();
        if (!disposed) {
          setState(next);
          setConnectionError("");
        }
      } catch (e) {
        if (!disposed) setConnectionError((e as Error).message);
      }
    };
    void update();
    const timer = setInterval(() => void update(), 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    setSelected("");
    setOpened(undefined);
  }, [runner, choice]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await request<{
        session: TerminalSession;
        sessions: TerminalSession[];
        viewerOrigin: string;
        viewerReady: boolean;
      }>({
        runner,
        roles,
        ...(selected === "picker"
          ? { resumePicker: true }
          : selected
            ? { previous: selected }
            : {}),
        ...(useHandover && handover.trim() ? { handover } : {}),
      });
      setOpened({ runner, roles: result.sessions.map((s) => s.role) });
      onLaunch(result.viewerOrigin, result.viewerReady);
      // A refresh failure must not turn a successful open into a retry invitation.
      setState(
        (current) =>
          current && {
            ...current,
            sessions: [...result.sessions, ...current.sessions],
          },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="development-launcher"
      aria-label="Launch development session"
    >
      <header>
        <div>
          <span className="section-eyebrow">PROJECT TOOLS / SUPERVISE</span>
          <h2>Development</h2>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <SelectMenu
            id="development-runner"
            label="Runner"
            value={runner}
            onChange={(value) => {
              onRunnerChange(value as DevelopmentRunner);
              setSelected("");
              setOpened(undefined);
            }}
            options={Object.entries(labels).map(([value, label]) => ({
              value,
              label,
              disabled:
                !!state &&
                !state.runners.some(
                  (r) => r.runner === value && (r.available || r.creative),
                ),
              note:
                value === "hermes"
                  ? "Requires Hermes and its hermes-developer profile"
                  : "Install and sign in first",
            }))}
          />
          <SelectMenu
            id="development-role"
            label="Role"
            value={choice}
            onChange={(value) => setChoice(value as RoleChoice)}
            options={Object.entries(roleOptions).map(([value, option]) => ({
              value,
              label: option.label,
              disabled: !!state && !option.roles.every(canOpen),
              note:
                value === "both"
                  ? "One terminal each; the user relays between them"
                  : value === "creative"
                    ? "The studio operator; Hermes needs hermes-creative"
                    : "The supervisor; Hermes needs hermes-developer",
            }))}
          />
          <SelectMenu
            id="development-previous"
            label="Previous session"
            value={selected}
            onChange={setSelected}
            options={[
              { value: "", label: "Start fresh" },
              ...(runner !== "hermes" && roles.length === 1
                ? [{ value: "picker", label: "Choose in terminal…" }]
                : []),
              ...(roles.length === 1
                ? (state?.sessions
                    .filter(
                      (s) =>
                        s.runner === runner &&
                        s.role === roles[0] &&
                        s.resumable,
                    )
                    .map((s) => ({
                      value: s.id,
                      label: new Date(s.startedAt).toLocaleString(),
                    })) ?? [])
                : []),
            ]}
          />
          <button
            className="development-start"
            disabled={busy || !available}
            type="submit"
          >
            {busy
              ? "Opening…"
              : resumeRole || selected === "picker"
                ? "Resume in Terminal ↗"
                : roles.length > 1
                  ? "Start both ↗"
                  : "Start fresh ↗"}
          </button>
        </form>
      </header>
      <p className="supervisor-note">
        {roles.length > 1
          ? "Opens two terminals, Developer (supervisor) then Creative (studio operator) · give each its task and relay between them."
          : choice === "creative"
            ? "Opens with the Creative role · give the brief and reply in your native terminal."
            : "Opens with the supervisor role · give the task and reply in your native terminal."}
      </p>
      {state && !state.supported && (
        <p role="status">
          Native launching currently supports macOS Terminal. Open your harness
          manually on this system.
        </p>
      )}
      <ServerRestart />
      {(error || connectionError) && (
        <p role="alert">{error || connectionError}</p>
      )}
      {opened && (
        <p role="status">
          {labels[opened.runner]} sent to Terminal (
          {opened.roles.map(roleLabel).join(", ")}). Continue there; closing
          this view leaves it open.
        </p>
      )}
      <details className="development-handover">
        <summary>
          Previous handover{handover ? " · available" : " · optional"}
        </summary>
        <label className="development-checkbox">
          <input
            type="checkbox"
            checked={useHandover}
            onChange={(event) => setUseHandover(event.target.checked)}
          />
          Include this context
        </label>
        <textarea
          aria-label="Previous handover"
          value={handover}
          onChange={(event) => setHandover(event.target.value)}
          rows={3}
          maxLength={8000}
          placeholder="Paste context from an earlier session, if needed."
        />
      </details>
    </section>
  );
}
