import {
  licenceStance,
  stanceUsage,
  type LicenceStance,
} from "../../shared/agent-setup";
import type { SetupDraft } from "./state";

type Choice = readonly [string, string, string];
function Choices({
  value,
  choices,
  onPick,
}: {
  value: string;
  choices: readonly Choice[];
  onPick: (value: string) => void;
}) {
  return (
    <div className="setup-choices">
      {choices.map(([id, title, note]) => (
        <button key={id} aria-pressed={value === id} onClick={() => onPick(id)}>
          <span>
            <strong>{title}</strong>
            <small>{note}</small>
          </span>
          <span aria-hidden="true">{value === id ? "✓" : "↗"}</span>
        </button>
      ))}
    </div>
  );
}

export const questions = [
  "A little setup. A lot to create.",
  "Which creative models suit you?",
  "Keep your agent open too?",
  "Where should generation happen?",
  "What will you use your work for?",
  "Connect your keys and agent.",
  "Your studio, your way.",
];
/** The Connect step (`SetupConnect`), between the choices and the summary. */
export const CONNECT_STEP = 5;
export const SUMMARY_STEP = questions.length - 1;

export default function SetupChoices({
  step,
  draft,
  onChange,
  next,
}: {
  step: number;
  draft: SetupDraft;
  onChange: (draft: SetupDraft) => void;
  next: () => void;
}) {
  const choose = (key: "weights" | "agent" | "execution", value: string) => {
    onChange({ ...draft, selection: { ...draft.selection, [key]: value } });
    next();
  };
  if (step === 1)
    return (
      <>
        <p>Start with your preference. You can change it for each project.</p>
        <Choices
          value={draft.selection.weights ?? "any"}
          onPick={(value) => choose("weights", value)}
          choices={[
            [
              "open-weights",
              "Open models only",
              "Models with available weights you can run yourself. Their individual licence terms still apply.",
            ],
            [
              "commercial",
              "Commercial models only",
              "Premium provider APIs such as FLUX. You approve paid generation.",
            ],
            [
              "any",
              "Allow all",
              "Pick open or commercial per task. Paid runs need your approval.",
            ],
          ]}
        />
      </>
    );
  if (step === 2)
    return (
      <>
        <p>The agent is separate from your image and video models.</p>
        <Choices
          value={draft.selection.agent ?? "any"}
          onPick={(value) => choose("agent", value)}
          choices={[
            [
              "hermes",
              "Yes · Hermes with open models",
              "Genobi’s open agent route. Configure a local or hosted open model in Hermes.",
            ],
            [
              "claude",
              "I prefer Claude Code",
              "Use your Claude Code installation and its own sign-in.",
            ],
            [
              "codex",
              "I use Codex",
              "Connect your external Codex agent through the Genobi plugin.",
            ],
            [
              "any",
              "Decide later",
              "Explore with typed prompts and choose an agent when you need one.",
            ],
          ]}
        />
      </>
    );
  if (step === 3)
    return (
      <>
        <p>
          Open models can run locally or in the cloud. This choice is for
          generation; your agent’s model has its own connection.
        </p>
        <Choices
          value={draft.selection.execution ?? "any"}
          onPick={(value) => choose("execution", value)}
          choices={[
            [
              "cloud",
              "Web based",
              "Connect your provider key. Nothing to install.",
            ],
            [
              "local",
              "Local only",
              "Run Genobi from GitHub with your own ComfyUI. Hardware and models are needed.",
            ],
            [
              "any",
              "Mix of all",
              "Use whichever route fits the task, with approval before paid runs.",
            ],
          ]}
        />
      </>
    );
  // One question for the licensing layer: commercial use or research only.
  // The answer is the usage preference the studio context already sends.
  return (
    <>
      <p>
        Genobi’s licensing layer: your agent picks models whose licences fit
        this answer.
      </p>
      <Choices
        value={licenceStance(draft.usage) ?? ""}
        onPick={(picked) => {
          onChange({
            ...draft,
            usage: stanceUsage(picked as LicenceStance, draft.usage),
          });
          next();
        }}
        choices={[
          [
            "commercial",
            "Commercial use",
            "Client work, products and anything you sell.",
          ],
          [
            "research",
            "Research only",
            "Studies, experiments and personal work.",
          ],
        ]}
      />
    </>
  );
}
