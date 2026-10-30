import { stepTeaching, useTeaching } from "./store";
import "./teachings.css";

/**
 * One teaching under the Genobi mark while no session runs, labelled
 * "Teachings", with Next to step to the following one. Fixed text that
 * states documented behaviour (`shared/teachings.ts`); no transition, so
 * reduced motion needs nothing extra. Not a live region: it is hint text.
 */
export function TeachingNote({ className = "" }: { className?: string }) {
  const teaching = useTeaching();
  return (
    <div
      className={`genobi-teaching ${className}`.trim()}
      data-teaching={teaching.id}
    >
      <div className="genobi-teaching-head">
        <span className="genobi-teaching-label">Teachings</span>
        <button
          type="button"
          className="genobi-teaching-next"
          aria-label="Next teaching"
          title="Next teaching"
          onClick={stepTeaching}
        >
          Next <span aria-hidden="true">›</span>
        </button>
      </div>
      <p className="genobi-teaching-text">{teaching.text}</p>
    </div>
  );
}
