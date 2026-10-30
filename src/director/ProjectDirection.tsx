import type { Project } from "../../shared/director/types";
import {
  directionWords,
  GLOBAL_PROMPT_LIMIT,
} from "../../shared/director/directions";
import GlobalPromptSend from "./GlobalPromptSend";
import PromptField from "./PromptField";

/**
 * The global prompt above Program: the project's one primary direction,
 * stored as `globalPrompt` through `set-global-prompt`, the command an agent
 * sends. Editing it never quotes or submits a generation. Its Send to Genobi
 * (`GlobalPromptSend`) hands it, with the clip prompts, to the agent as Regenerate's instruction;
 * the agent quotes every paid step and the person approves it. The selected clip's own prompt and typed
 * directions stay in the clip inspector; a line here shows which ones apply.
 */
export default function ProjectDirection({
  project,
  selected,
  disabled,
  command,
}: {
  project: Project;
  selected: string;
  disabled: boolean;
  command: (command: unknown) => string;
}) {
  const clip = project.layers.find((l) => l.id === selected);
  const words = directionWords(clip?.directions);
  return (
    <section className="dir-project-direction" aria-label="Project direction">
      <header>
        <strong>Global prompt</strong>
        <span>Whole project</span>
      </header>
      <PromptField
        key={project.id}
        label="Global prompt"
        value={project.globalPrompt ?? ""}
        limit={GLOBAL_PROMPT_LIMIT}
        disabled={disabled}
        placeholder="The direction every clip shares: story, look, light, pace."
        commit={(text) => command({ op: "set-global-prompt", text })}
      />
      <GlobalPromptSend disabled={disabled} />
      <footer>
        <span>Shared direction for every clip.</span>
        <span>
          {clip
            ? `${clip.name}${clip.prompt ? " · own prompt" : ""}${words ? ` · ${words}` : ""}`
            : "No clip selected"}
        </span>
      </footer>
    </section>
  );
}
