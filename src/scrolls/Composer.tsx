import ThemedSelect from "../components/ThemedSelect";
import {
  entryLabel,
  estimatePerRun,
  generatorPrompt,
  referenceProblem,
} from "../../shared/scrolls/generator";
import { fillTargets, runProblem } from "../../shared/scrolls/run-plan";
import { PROMPT_LIMIT } from "../../shared/scrolls/types";
import { GeneratorControls } from "./GeneratorControls";
import { ScrollReferences } from "./References";
import type { useScrolls } from "./useScrolls";

/** The prompt a button would send, or why it cannot be built yet. */
function preview(s: ReturnType<typeof useScrolls>, board: boolean) {
  try {
    return generatorPrompt(s.bundle.document, {
      includePlan: board,
      pairs: s.references,
    });
  } catch (error) {
    return (error as Error).message;
  }
}

/**
 * The Scrolls generator: the brief, the sheets to make one like, the Camera's
 * image controls and one button per action. A character sheet is one run of
 * the brief; a storyboard is either one run of the brief with the panels
 * compiled under it, or one run per empty panel. Every button only quotes;
 * nothing is spent until Approve.
 */
export function ScrollComposer({
  s,
  urls,
}: {
  s: ReturnType<typeof useScrolls>;
  urls: Record<string, string>;
}) {
  const d = s.bundle.document,
    disabled = s.busy || !!s.pending,
    character = d.kind === "character",
    count = s.references.length,
    skipped = s.unconfirmed.map((u) => u.cellId),
    pairs = s.references.map((a) => ({
      name: a.name,
      prompt: a.prompt,
      sha256: a.file.sha256,
    })),
    route = referenceProblem(s.generator.entry, count),
    // Each button's refusal: the route, the prompt limits, or a result that
    // would not fit the scroll. Its button is disabled and the preview says why.
    problem = runProblem(
      d,
      s.generator,
      pairs,
      { kind: "sheet", plan: !character },
      skipped,
    ),
    fillProblem = character
      ? undefined
      : runProblem(d, s.generator, pairs, { kind: "fill" }, skipped),
    empty = fillTargets(d, skipped).length,
    perRun = estimatePerRun(s.generator),
    approvals = s.approvals,
    total = approvals?.reduce((sum, a) => sum + a.quote.estimateUsd, 0) ?? 0;
  return (
    <>
      <section className="scroll-composer" aria-label="Scroll generator">
        <label htmlFor="scroll-prompt">Describe your scroll</label>
        <textarea
          id="scroll-prompt"
          value={d.prompt}
          maxLength={PROMPT_LIMIT}
          disabled={s.busy}
          placeholder={
            character
              ? "Generate a character sheet like this one: a masked rooftop guardian, front, side and back, then a high kick. Black ink on paper."
              : "Two ninjas fight across moonlit rooftops, chase through a gate and escape into mist. Black-and-white ink storyboard."
          }
          onChange={(e) => s.edit({ op: "brief", prompt: e.target.value })}
        />
        <ScrollReferences s={s} urls={urls} />
        <div className="scroll-toolbar">
          <label>
            Cells
            <ThemedSelect
              value={d.cells.length}
              disabled={s.busy}
              onChange={(e) =>
                s.edit({ op: "resize", count: Number(e.target.value) })
              }
            >
              {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </ThemedSelect>
          </label>
          <GeneratorControls s={s} />
          {character ? (
            <button
              className="scroll-primary"
              disabled={disabled || !!problem}
              onClick={() => void s.quote({ kind: "sheet", plan: false })}
            >
              {s.pending ? "Generating…" : "Generate sheet"}
            </button>
          ) : (
            <>
              <button
                disabled={disabled || !!fillProblem}
                title={
                  fillProblem ??
                  "One image per empty panel, from that panel's own text and the references. Each result goes into its panel."
                }
                onClick={() => void s.quote({ kind: "fill" })}
              >
                Fill panels · {empty}
              </button>
              <button
                className="scroll-primary"
                disabled={disabled || !!problem}
                onClick={() => void s.quote({ kind: "sheet", plan: true })}
              >
                {s.pending ? "Generating…" : "Generate board"}
              </button>
            </>
          )}
        </div>
        <p className="scroll-hint" role={route ? "alert" : undefined}>
          {problem ??
            `About $${perRun.toFixed(3)} a run on ${entryLabel(s.generator.entry)}${character ? "" : `; Fill panels is ${empty} run${empty === 1 ? "" : "s"}`}. Each button quotes first; the quote is the figure that binds.`}
        </p>
        {s.unconfirmed.map((u) => (
          <p className="scroll-unconfirmed" role="alert" key={u.idempotency}>
            {u.label} may have started. Check Camera history; Fill panels skips
            it until you clear it.{" "}
            <button
              type="button"
              disabled={s.busy}
              onClick={() => s.clearUnconfirmed(u.cellId)}
            >
              Clear
            </button>
          </p>
        ))}
        <details className="scroll-prompt-preview">
          <summary>
            Prompt the model gets
            {character ? "" : " · Generate board"}
            {count ? ` · ${count} example${count === 1 ? "" : "s"}` : ""}
          </summary>
          {count > 0 && (
            <ul className="scroll-reference-pairs" aria-label="Example pairs">
              {s.references.map((a) => (
                <li key={a.id}>
                  <img src={urls[a.id]} alt={a.name} />
                  <p>
                    <strong>{a.name}</strong>
                    <span>{a.prompt ?? "No prompt recorded."}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <pre>{problem ?? preview(s, !character)}</pre>
          {!character && (
            <p>
              {fillProblem ??
                "Fill panels sends the brief with one panel at a time, in this order, and puts each result into its panel. A panel with its own 3D frame sends that frame first."}
            </p>
          )}
        </details>
      </section>
      {approvals && (
        <section className="scroll-approval" aria-label="Generation approval">
          <p>
            {approvals.length === 1
              ? "One image"
              : `${approvals.length} images, one per empty panel`}{" "}
            · estimated ${total.toFixed(3)} ·{" "}
            {entryLabel(approvals[0].generation.entry)}
            {approvals[0].generation.references.length
              ? ` · like ${approvals[0].generation.references.map((r) => r.name).join(", ")}`
              : ""}
          </p>
          <details>
            <summary>Review exact prompt</summary>
            {approvals.map((a) => (
              <pre key={a.idempotency}>{a.input.description}</pre>
            ))}
          </details>
          <button disabled={s.busy} onClick={() => void s.approve()}>
            Approve & generate
          </button>
        </section>
      )}
    </>
  );
}
