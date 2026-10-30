import { useEffect, useRef, useState } from "react";
import { supervisorSnapshot } from "../../shared/supervisor";
import {
  supervisorOrigin,
  rememberedSupervisorOrigin,
  rememberSupervisorOrigin,
} from "./origin";
import { publishSupervisor, useSupervisor } from "./store";
import "./supervisor.css";
import { supervisorTheme } from "./theme";
import Launcher from "./Launcher";
import GenobiDevelopers from "./GenobiDevelopers";
import type { DevelopmentRunner } from "../../shared/development-session";

/** Explicit opt-in to one local supervisor; its messages grant no control. */
export default function Development() {
  const [input, setInput] = useState("http://127.0.0.1:4329");
  const [connection, setConnection] = useState<
    | {
        origin: string;
        channel: string;
      }
    | undefined
  >(() => {
    const origin = rememberedSupervisorOrigin();
    return origin ? { origin, channel: crypto.randomUUID() } : undefined;
  });
  const [error, setError] = useState("");
  const [runner, setRunner] = useState<DevelopmentRunner>("hermes");
  const runnerLabel = {
    hermes: "Hermes",
    codex: "Codex",
    claude: "Claude Code",
  }[runner];
  const [expanded, setExpanded] = useState(true);
  function link(origin: string, ready = true) {
    const valid = supervisorOrigin(origin);
    if (!valid || valid === window.location.origin) {
      setError(
        "Use a separate HTTP loopback address, without a path or credentials.",
      );
      return;
    }
    setRunner("hermes");
    setInput(valid);
    setError(
      ready
        ? ""
        : "The viewer is not ready yet. Use Reconnect view after starting it.",
    );
    rememberSupervisorOrigin(valid);
    setConnection({ origin: valid, channel: crypto.randomUUID() });
    setExpanded(true);
  }
  const frame = useRef<HTMLIFrameElement>(null);
  const presence = useSupervisor();
  useEffect(() => {
    if (!connection || runner !== "hermes") return;
    let lastReceived = 0;
    const started = Date.now();
    publishSupervisor({
      actors: [],
      connected: false,
      connecting: true,
      origin: connection.origin,
    });
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== connection.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const parsed = supervisorSnapshot.safeParse(event.data);
      if (!parsed.success || parsed.data.channel !== connection.channel) return;
      lastReceived = Date.now();
      setError("");
      publishSupervisor({
        actors: parsed.data.actors,
        connected: true,
        origin: connection.origin,
      });
    };
    const request = () => {
      frame.current?.contentWindow?.postMessage(
        {
          type: "genobi.supervisor.subscribe",
          channel: connection.channel,
          theme: supervisorTheme(),
        },
        connection.origin,
      );
      if (!lastReceived || Date.now() - lastReceived > 10000) {
        publishSupervisor({
          actors: [],
          connected: false,
          connecting: !lastReceived && Date.now() - started < 10000,
          origin: connection.origin,
        });
        setError(
          lastReceived || Date.now() - started >= 10000
            ? "Supervisor disconnected. Last activity is no longer live."
            : "Waiting for the local supervisor…",
        );
      }
    };
    window.addEventListener("message", receive);
    const timer = window.setInterval(request, 2000);
    const themeObserver = new MutationObserver(request);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style", "class"],
    });
    request();
    return () => {
      window.removeEventListener("message", receive);
      clearInterval(timer);
      themeObserver.disconnect();
      publishSupervisor({ actors: [], connected: false });
    };
  }, [connection, runner]);
  return (
    <section
      className="supervisor-development"
      aria-label="Development supervisor"
    >
      <Launcher
        runner={runner}
        onRunnerChange={setRunner}
        onLaunch={(origin, ready) => {
          if (runner === "hermes") link(origin, ready);
        }}
      />
      <GenobiDevelopers />
      <details
        className="supervisor-external"
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary>
          Agent supervisor · {runnerLabel} ·{" "}
          {runner !== "hermes"
            ? "Native terminal"
            : presence.connected
              ? "Connected"
              : presence.connecting
                ? "Linking"
                : "Not linked"}
        </summary>
        {runner !== "hermes" ? (
          <div className="supervisor-actions">
            <p className="supervisor-note">
              {runnerLabel} runs in its native terminal. The live viewer
              currently supports Hermes sessions.
            </p>
            <button
              type="button"
              onClick={() => link(connection?.origin ?? input)}
            >
              View Hermes sessions
            </button>
          </div>
        ) : !connection ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              link(input);
            }}
          >
            <label>
              Local supervisor address
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                type="url"
                required
              />
            </label>
            <button type="submit">Link view</button>
          </form>
        ) : (
          <div className="supervisor-actions">
            <a
              href={connection.origin}
              target="_blank"
              rel="noopener noreferrer"
            >
              Hermes live sessions ↗
            </a>
            <button type="button" onClick={() => link(connection.origin)}>
              Reconnect view
            </button>
            <button
              type="button"
              onClick={() => {
                rememberSupervisorOrigin();
                setConnection(undefined);
                setError("");
              }}
            >
              Unlink view
            </button>
          </div>
        )}
        {runner === "hermes" && error && <p role="status">{error}</p>}
        {runner === "hermes" && connection && (
          <p className="supervisor-note">
            Hermes Developer + Creative/Genobi · read-only live sessions. Codex
            and Claude Code conversations stay in their native terminals.
          </p>
        )}
        {runner === "hermes" && !connection && (
          <p className="supervisor-note">
            Watching does not grant editing control. Each agent’s browser and
            project stay separate until explicitly linked. Disconnecting this
            view does not stop an agent or a generation.
          </p>
        )}
        {runner === "hermes" && connection && (
          <iframe
            key={connection.channel}
            ref={frame}
            src={connection.origin}
            title="Live agent supervisor"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          />
        )}
      </details>
    </section>
  );
}
