import { WorkspaceHeading } from "../studio/WorkspaceHeading";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useShell } from "../studio/ShellContext";
import type { Bundle } from "../director/bundle";
import { lazyReload } from "../lazy-reload";
import { OPEN_DEVELOPMENT } from "../supervisor/store";
import { rememberedSupervisorOrigin } from "../supervisor/origin";
const Arena = lazyReload(() => import("./Arena"));
const Development = lazyReload(() => import("../supervisor/Development"));

export default function ProjectTools({
  advanced = false,
  children,
  bundle,
}: {
  /** The advanced editor: shown outside the shell, opening on Workflow tools. */
  advanced?: boolean;
  /** The open project, whose assets can be dropped into Arena. */
  bundle?: Bundle;
  children: ReactNode;
}) {
  const shell = useShell();
  const hidden = !shell && !advanced,
    workflowFirst = advanced;
  const [tab, setTab] = useState<"arena" | "utilities" | "development">(
    !shell || workflowFirst ? "utilities" : "arena",
  );
  // Arena keeps records and media on the local server; the hosted Worker
  // has no Arena route, so the hosted studio opens on Workflow tools.
  const [hosted, setHosted] = useState<boolean>();
  const [developmentOpened, setDevelopmentOpened] = useState(
    () => !!rememberedSupervisorOrigin(),
  );
  useEffect(() => {
    const open = () => {
      if (hosted !== false) return;
      setDevelopmentOpened(true);
      setTab("development");
    };
    window.addEventListener(OPEN_DEVELOPMENT, open);
    return () => window.removeEventListener(OPEN_DEVELOPMENT, open);
  }, [hosted]);
  useEffect(() => {
    let live = true;
    void fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((v: { hosted?: boolean }) => {
        if (live) setHosted(v.hosted === true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (workflowFirst || hosted) setTab("utilities");
  }, [workflowFirst, hosted]);
  const visible = !hidden && (!shell || shell.visible.includes("tools"));
  return (
    <div className="project-tools" hidden={hidden}>
      <WorkspaceHeading
        title="Project Tools"
        icon="wrench"
        purpose="Compare workflows / Work with your agent."
      />
      <div
        className="project-tools-tabs"
        role="group"
        aria-label="Project tools"
      >
        {!hosted && (
          <button
            aria-pressed={tab === "arena"}
            onClick={() => setTab("arena")}
          >
            Arena
          </button>
        )}
        <button
          aria-pressed={tab === "utilities"}
          onClick={() => setTab("utilities")}
        >
          Workflow tools
        </button>
        {hosted === false && (
          <button
            aria-pressed={tab === "development"}
            onClick={() => {
              setDevelopmentOpened(true);
              setTab("development");
            }}
          >
            Development
          </button>
        )}
      </div>
      <div hidden={tab !== "arena" || hosted}>
        <Suspense fallback={<p>Opening Arena…</p>}>
          {hosted === false && (
            <Arena active={visible && tab === "arena"} bundle={bundle} />
          )}
        </Suspense>
      </div>
      <div className="dir-remix" hidden={tab !== "utilities"}>
        {children}
      </div>
      {hosted === false && developmentOpened && (
        <div hidden={tab !== "development"}>
          <Suspense fallback={<p>Opening Development…</p>}>
            <Development />
          </Suspense>
        </div>
      )}
    </div>
  );
}
