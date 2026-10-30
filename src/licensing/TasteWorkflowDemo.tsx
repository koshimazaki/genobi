import { useState } from "react";

const workflows: Record<
  string,
  { label: string; steps: { title: string; note: string }[] }
> = {
  koda: {
    label: "Character to storyboard",
    steps: [
      {
        title: "Reference",
        note: "Start with a character and a visual direction.",
      },
      {
        title: "Character sheet",
        note: "Keep the same character across poses and expressions.",
      },
      {
        title: "Storyboard",
        note: "Plan framing, action and continuity shot by shot.",
      },
      { title: "Sequence", note: "Develop the shots into a timed sequence." },
    ],
  },
  "andrew-zellinger": {
    label: "Push-to-talk voice workflow",
    steps: [
      {
        title: "Hold",
        note: "A push-to-talk key starts the voice interaction.",
      },
      { title: "Speak", note: "Speech becomes a prompt for the assistant." },
      { title: "Release", note: "Releasing the key sends the completed turn." },
      { title: "Listen", note: "The assistant’s reply returns as speech." },
    ],
  },
};

/** An explorable explanation, not a live microphone, agent session or creator asset. */
export default function TasteWorkflowDemo({ id }: { id: string }) {
  const [step, setStep] = useState(0);
  const workflow = workflows[id];
  const selected = workflow.steps[step];
  return (
    <div className="taste-workflow">
      <span className="taste-tag">Illustrated workflow · {workflow.label}</span>
      <div className="taste-workflow-art" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className={index === step ? "is-active" : ""}>
            {String(index + 1).padStart(2, "0")}
          </span>
        ))}
      </div>
      <div aria-live="polite">
        <strong>{selected.title}</strong>
        <p>{selected.note}</p>
      </div>
      <div
        className="taste-workflow-steps"
        aria-label={`${workflow.label} steps`}
      >
        {workflow.steps.map((item, index) => (
          <button
            key={item.title}
            aria-pressed={step === index}
            onClick={() => setStep(index)}
          >
            {item.title}
          </button>
        ))}
      </div>
      <small>Genobi illustration · no recording or generation</small>
    </div>
  );
}
