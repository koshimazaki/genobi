import ThemedSelect from "../components/ThemedSelect";
import { useEffect, useRef, useState } from "react";
import { StudioPanel, useShell } from "../studio/ShellContext";
import { WorkspaceHeading } from "../studio/WorkspaceHeading";
import { ScrollBoard } from "./Board";
import { ScrollComposer } from "./Composer";
import { ScrollTimeline } from "./Timeline";
import { ScrollHandoff } from "./Handoff";
import { ScrollExamples } from "./Examples";
import { ScrollResults } from "./Results";
import { useScrolls } from "./useScrolls";
import { useAgentFill } from "./useAgentFill";
import { ScrollScript } from "./Script";
import { assetType, exportScrollJson, saveScroll } from "./bundle";
import { parseScroll, type AssetRole } from "../../shared/scrolls/types";
import { scrollHandoff } from "../../shared/scrolls/prompts";
import { openInDirector } from "./director";
import { scrollMedia } from "./to-project";
import { addToProjectAssets } from "../studio/project-assets";
import "./scrolls.css";
import "./timeline.css";
import "./visual-refinement.css";
import "./controls.css";
import "./generator.css";
export default function Scrolls() {
  const s = useScrolls(),
    agent = useAgentFill(s),
    d = s.bundle.document,
    shell = useShell(),
    disabled = s.busy;
  const [urls, setUrls] = useState<Record<string, string>>({}),
    [tab, setTab] = useState<"results" | "examples">("results"),
    // The Script is a view of the same scroll; the board keeps its kind.
    [script, setScript] = useState(false),
    [importRole, setImportRole] = useState<AssetRole>("panel");
  const [handoff, setHandoff] = useState<ReturnType<typeof scrollHandoff>>(),
    [command, setCommand] = useState("");
  const openFile = useRef<HTMLInputElement>(null),
    images = useRef<HTMLInputElement>(null),
    audio = useRef<HTMLInputElement>(null);
  const selected = d.cells.find((c) => c.id === s.selectedCell),
    active = shell?.visible.includes("scrolls") ?? true;
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const a of s.bundle.document.assets)
      next[a.id] = URL.createObjectURL(
        new Blob([s.bundle.files.get(a.file.path)!], { type: assetType(a) }),
      );
    setUrls(next);
    return () => Object.values(next).forEach(URL.revokeObjectURL);
  }, [s.bundle.files, s.bundle.document.assets]);
  const handoffTo = (destination: "director" | "video" | "agent") =>
    void s.run(async () => {
      if (destination === "director") {
        const receipt = await openInDirector(s.bundle);
        s.setMessage(
          `${receipt.placements.length} assets imported into ${receipt.destinationProjectId}. Character references remain off the timeline.`,
        );
        shell?.select("director");
      } else setHandoff(scrollHandoff(d, destination));
    });
  return (
    <StudioPanel id="scrolls">
      <div className="scrolls" aria-label="Scrolls workspace">
        <header className="scroll-header">
          <WorkspaceHeading
            title="Scrolls"
            icon="scroll"
            purpose="Character sheets / Storyboards."
          />
          <div className="scroll-mode-switch" aria-label="Scroll type">
            <button
              aria-pressed={!script && d.kind === "character"}
              // Back from the Script to the same kind is never blocked.
              disabled={
                (disabled || !!s.pending) && !(script && d.kind === "character")
              }
              onClick={() => {
                setScript(false);
                if (d.kind !== "character") s.changeKind("character");
              }}
            >
              Character sheet
            </button>
            <button
              aria-pressed={!script && d.kind === "storyboard"}
              // Back from the Script to the same kind is never blocked.
              disabled={
                (disabled || !!s.pending) &&
                !(script && d.kind === "storyboard")
              }
              onClick={() => {
                setScript(false);
                if (d.kind !== "storyboard") s.changeKind("storyboard");
              }}
            >
              Storyboard
            </button>
            <button aria-pressed={script} onClick={() => setScript(true)}>
              Script
            </button>
          </div>
          <label className="scroll-toggle">
            <input
              type="checkbox"
              checked={d.timing.enabled}
              disabled={disabled}
              onChange={(e) =>
                s.edit({ op: "timing", timing: { enabled: e.target.checked } })
              }
            />
            Time to audio
          </label>
          <div className="scroll-toolbar">
            <button disabled={disabled} onClick={() => images.current?.click()}>
              Add assets · {d.assets.length}
            </button>
            <button
              disabled={disabled}
              onClick={() => openFile.current?.click()}
            >
              Open
            </button>
            <button onClick={() => saveScroll(s.bundle)}>Save</button>
          </div>
        </header>
        <input
          ref={openFile}
          hidden
          type="file"
          accept=".zip,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void s.load(f);
          }}
        />
        <input
          ref={images}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            setTab("results");
            void s.importFiles(files, importRole);
          }}
        />
        <input
          ref={audio}
          hidden
          type="file"
          accept="audio/wav,audio/flac,audio/mpeg,.wav,.flac,.mp3"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void s.importFiles([f], "audio");
          }}
        />
        {script ? (
          <ScrollScript s={s} agent={agent} />
        ) : (
          <ScrollBoard s={s} urls={urls} />
        )}
        {d.timing.enabled && (
          <ScrollTimeline
            s={s}
            urls={urls}
            active={active}
            importAudio={() => audio.current?.click()}
          />
        )}
        <ScrollComposer s={s} urls={urls} />
        <div className="scroll-gallery-tabs" aria-label="Asset views">
          <button
            aria-pressed={tab === "results"}
            onClick={() => setTab("results")}
          >
            Your generations
          </button>
          <button
            aria-pressed={tab === "examples"}
            onClick={() => setTab("examples")}
          >
            Examples
          </button>
        </div>
        {tab === "results" ? (
          <ScrollResults
            document={d}
            urls={urls}
            disabled={disabled}
            onSelect={(ids) => s.edit({ op: "select", ids })}
            onView={(a) => s.edit({ op: "brief", sheetAssetId: a.id })}
            onAssign={(a) => {
              if (!selected) {
                s.setMessage("Choose a planned cell above first.");
                return;
              }
              s.cell({ assetId: a.id });
              if (a.role !== "panel")
                s.setMessage(
                  "Reference assigned. Choose Use as panel below to show it in the animatic; reference images stay off-screen.",
                );
            }}
            onRole={(a) =>
              s.commit({
                ...s.bundle,
                document: parseScroll({
                  ...d,
                  revision: d.revision + 1,
                  assets: d.assets.map((x) =>
                    x.id === a.id
                      ? {
                          ...x,
                          role: a.role === "panel" ? "character" : "panel",
                        }
                      : x,
                  ),
                }),
              })
            }
            onHandoff={handoffTo}
            onRemove={(a) => s.removeAsset(a.id)}
            onProject={(a, use) =>
              addToProjectAssets(scrollMedia(s.bundle, a.id, use))
            }
          />
        ) : (
          <ScrollExamples
            onStart={async (file, example) => {
              const success = await s.startExample(file, example);
              if (success) setTab("results");
              return success;
            }}
            onImport={async (file) => {
              const success = await s.importFiles([file], "style");
              if (success) setTab("results");
              return success;
            }}
          />
        )}
        <p className="scroll-message" role="status">
          {s.message}
        </p>
        <ScrollHandoff s={s} handoff={handoff} setHandoff={setHandoff} />
        <details className="scroll-document-tools">
          <summary>Document & agent tools</summary>
          <div className="scroll-toolbar">
            <label>
              Import images as
              <ThemedSelect
                value={importRole}
                onChange={(e) => setImportRole(e.target.value as AssetRole)}
              >
                <option value="panel">Storyboard panel</option>
                <option value="character">Character reference</option>
                <option value="style">Style reference</option>
              </ThemedSelect>
            </label>
            <button onClick={() => exportScrollJson(d)}>Save JSON</button>
            <button
              disabled={disabled || !!s.pending}
              onClick={() => s.start(d.kind)}
            >
              New scroll
            </button>
          </div>
          <p>
            Save a bundle before reloading. MCP's genobi_scrolls tool uses the
            same revision-checked document commands; JSON needs its matching
            media bundle.
          </p>
          <textarea
            aria-label="Scrolls command JSON"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={'{"op":"brief","prompt":"My scene"}'}
          />
          <button
            disabled={disabled}
            onClick={() => {
              try {
                s.edit(JSON.parse(command));
              } catch (e) {
                s.setMessage((e as Error).message);
              }
            }}
          >
            Apply command
          </button>
        </details>
      </div>
    </StudioPanel>
  );
}
