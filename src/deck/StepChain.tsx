import { useEffect, useRef } from "react";
import Spinner from "../components/Spinner";
import {
  DECK_STEP_GLYPH,
  type DeckStep,
  type DeckStepState,
} from "../../shared/deck-steps";
import "./step-chain.css";

/** Steps shown unfolded; the newest is always among them. */
export const STEPS_SHOWN = 3;

const STATE_WORD: Record<DeckStepState, string> = {
  done: "Done",
  working: "Working",
  waiting: "Waiting for you",
  failed: "Failed",
  unknown: "Unknown",
};

function Step({ step }: { step: DeckStep }) {
  return (
    <li className={`deck-step is-${step.state}`} title={step.label}>
      {step.state === "working" ? (
        <Spinner name="dots12" className="deck-step-mark" />
      ) : (
        <span className="deck-step-mark" aria-hidden="true">
          {DECK_STEP_GLYPH[step.state]}
        </span>
      )}
      <span className="sr-only">{STATE_WORD[step.state]}: </span>
      <span className="deck-step-label">{step.label}</span>
    </li>
  );
}

/**
 * The open deck's chain of steps (`shared/deck-steps.ts`), kept at the top
 * of the log while it scrolls: the newest few steps, and the older ones
 * folded behind a count the person can open. Draws nothing when the chain
 * is empty, so an idle deck keeps its ready line and teaching.
 */
export default function StepChain({ steps }: { steps: readonly DeckStep[] }) {
  return steps.length ? <Chain steps={steps} /> : null;
}

function Chain({ steps }: { steps: readonly DeckStep[] }) {
  const chain = useRef<HTMLDivElement>(null);
  // Phones stack the visualiser above the log in one scrolling body: the
  // deck opens with the chain in view, once; after that, arriving steps
  // never move the reading position (it is sticky while the body scrolls).
  useEffect(() => {
    const element = chain.current;
    const body = element?.closest(".deck-body");
    if (!element || !body || !window.matchMedia?.("(max-width: 640px)").matches)
      return;
    body.scrollTop +=
      element.getBoundingClientRect().top -
      body.getBoundingClientRect().top -
      (parseFloat(getComputedStyle(body).paddingTop) || 0);
  }, []);
  const older = steps.slice(0, -STEPS_SHOWN);
  const shown = steps.slice(-STEPS_SHOWN);
  return (
    <div ref={chain} className="deck-steps">
      {older.length > 0 && (
        <details className="deck-steps-older">
          <summary>
            {older.length} earlier step{older.length === 1 ? "" : "s"}
          </summary>
          <ol aria-label="Earlier steps">
            {older.map((step) => (
              <Step key={step.id} step={step} />
            ))}
          </ol>
        </details>
      )}
      <ol aria-label="Steps">
        {shown.map((step) => (
          <Step key={step.id} step={step} />
        ))}
      </ol>
    </div>
  );
}
