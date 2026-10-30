import { useState } from "react";
import { MANIFEST_FILE_BYTES } from "./manifest";
import type { Project } from "../../shared/director/types";
import { linkCode } from "./project-copy";
import { OPEN_PROJECT_PROMPT } from "../agent/spawn";
import { spawnFromStudio } from "../agent/spawn-store";
export default function AgentPanel({
  project,
  disabled,
  execute,
}: {
  project: Project;
  disabled: boolean;
  execute: (command: unknown, file?: File) => Promise<unknown>;
}) {
  const [command, setCommand] = useState('{"op":"inspect"}');
  const [file, setFile] = useState<File>();
  const [receipt, setReceipt] = useState("");
  return (
    <details className="dir-agent">
      <summary>JSON editor & agent tools · revision {project.revision}</summary>
      <p>
        Commands share the visual editor’s bundle. Inspect first; writes require
        the current revision. Frame and cut exports use the dual editor.
      </p>
      <button
        disabled={disabled}
        onClick={() =>
          setCommand(
            JSON.stringify(
              { op: "project", revision: project.revision, project },
              null,
              2,
            ),
          )
        }
      >
        Load project JSON
      </button>
      <button disabled={disabled} onClick={() => setCommand('{"op":"brief"}')}>
        Read project prompt
      </button>
      <button
        onClick={async () => {
          // The local server's copy: an agent spends this code once with
          // genobi_link_project. The hosted studio has no copy.
          try {
            const { code, expiresAt } = await linkCode(project.id);
            setReceipt(
              JSON.stringify({
                linkCode: `${code.slice(0, 4)}-${code.slice(4)}`,
                tool: "genobi_link_project",
                expiresAt,
              }),
            );
          } catch (e) {
            setReceipt(
              JSON.stringify({
                error: `Link an agent from the local studio (npm run dev): ${e instanceof Error ? e.message : e}`,
              }),
            );
          }
        }}
      >
        Link an agent
      </button>
      <button
        title="Start your agent on this project: pick it, sign in, go"
        onClick={() =>
          // The same action as the bubble's; the project is linked for it.
          void spawnFromStudio({
            prompt: OPEN_PROJECT_PROMPT,
            source: "typed",
          }).catch(() => {})
        }
      >
        Start an agent here
      </button>
      <label>
        Agent command
        <textarea
          aria-label="Agent command"
          spellCheck={false}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
        />
      </label>
      <label>
        Command replacement file
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/*"
          onChange={(e) => setFile(e.target.files?.[0])}
        />
      </label>
      <button
        disabled={disabled}
        onClick={async () => {
          try {
            // A `project` command carries a whole manifest, base included.
            if (command.length > MANIFEST_FILE_BYTES)
              throw new Error("Command limit is 4 MB");
            setReceipt(
              JSON.stringify(await execute(JSON.parse(command), file), null, 2),
            );
          } catch (e) {
            setReceipt(
              JSON.stringify({
                error: e instanceof Error ? e.message : String(e),
              }),
            );
          }
        }}
      >
        Run command
      </button>
      <pre aria-label="Agent receipt" role="status">
        {receipt}
      </pre>
    </details>
  );
}
