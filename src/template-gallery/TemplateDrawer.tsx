import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { HouseTemplate } from "../../shared/templates/types";
import {
  directorLink,
  GALLERY_SUBTITLE,
  galleryMedia,
  templateSeconds,
  templateTools,
  watchLink,
} from "../../shared/gallery/catalogue";
import {
  cardModels,
  footageMadeWith,
  galleryBadge,
} from "../../shared/gallery/badges";
import { embedMarkup } from "../../shared/gallery/page";
import { useSpawnStep } from "../agent/spawn-store";
import Icon from "../components/Icon";
import DrawerOutput from "./DrawerOutput";
import GenerationNote from "./GenerationNote";
import { focusRing, HEADER_HOST, nextInRing } from "./focus-ring";
import { MechanicalPrimary, mechanicalStatus } from "./MechanicalActions";
import type { TemplatePicks } from "./open-template";
import { AgentFields, MechanicalFields } from "./RecipeFields";
import MixFields from "./MixFields";
import ShowcaseVersions from "./ShowcaseVersions";
import { editorLink } from "./template-actions";
import TemplateIntake, { useTemplateIntake } from "./TemplateIntake";
import { useMechanicalRun } from "./useMechanicalRun";
import "./make-your-own.css";

/** Which drawer action is running. */
export type DrawerBusy = "" | "generate" | "director" | "editor";

// A plain click runs the action in place; a modified one opens a tab.
const plain = (e: MouseEvent) =>
  !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

/**
 * What the drawer makes inert behind it: the studio grid always, the header
 * (its bubble and spawn dialog) only until a session works on the template,
 * since the status line then sends the person to the bubble.
 */
export const inertBehind = (session: boolean) =>
  session ? ".genobi-grid" : `${HEADER_HOST}, .genobi-grid`;

export default function TemplateDrawer({
  template,
  onClose,
  onGenerate,
  onDirector,
  onEditor,
  busy,
  error,
  status,
  session,
}: {
  template: HouseTemplate;
  onClose: () => void;
  onGenerate: (chosen: TemplatePicks) => void;
  onDirector: (chosen: TemplatePicks) => void;
  onEditor: (chosen?: TemplatePicks) => void;
  busy: DrawerBusy;
  error: string;
  status: string;
  /** An agent session works on this template's project. */
  session: boolean;
}) {
  const intake = useTemplateIntake(template);
  const run = useMechanicalRun(template, intake.chosen);
  const mechanical = run.mechanical;
  const generation = template.generation;
  // A mix is a finished cut: nothing to pick, prompt or generate.
  const mix = !!template.mix;
  const [brief, setBrief] = useState(template.inputs.subject.default);
  // The agent's actions carry the brief only when the person changed it.
  const chosen = useMemo<TemplatePicks>(
    () =>
      brief === template.inputs.subject.default
        ? intake.chosen
        : { ...intake.chosen, inputs: { subject: brief } },
    [intake.chosen, brief, template],
  );
  const working = busy !== "" || run.step !== "" || run.running;
  // The spawn dialog and the bubble sit in the header. While the dialog asks,
  // and once a session works on this template (the status line sends the
  // person to the bubble), the header stays usable behind the drawer.
  const spawning = useSpawnStep().kind !== "closed";
  const headerLive = spawning || session;
  const media = galleryMedia(template);
  const close = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null);
  const [share, setShare] = useState<"link" | "embed">("link");
  const [message, setMessage] = useState("");
  const value =
    share === "embed"
      ? embedMarkup(template.id, location.origin)
      : new URL(watchLink(template.id), location.origin).href;
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  // Tab cycles through the drawer, and through the header too once it is
  // live, so a keyboard reaches the bubble the status line points to.
  useEffect(() => {
    const tab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !root.current) return;
      const next = nextInRing(
        focusRing(root.current, headerLive),
        document.activeElement,
        e.shiftKey,
      );
      if (!next) return;
      e.preventDefault();
      next.focus();
    };
    document.addEventListener("keydown", tab);
    return () => document.removeEventListener("keydown", tab);
  }, [headerLive]);
  useEffect(() => {
    if (spawning) return;
    const behind = [
      ...document.querySelectorAll<HTMLElement>(inertBehind(session)),
    ];
    const previous = behind.map((node) => node.inert);
    behind.forEach((node) => {
      node.inert = true;
    });
    return () =>
      behind.forEach((node, i) => {
        node.inert = previous[i];
      });
  }, [spawning, session]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied.");
    } catch {
      setMessage("Select the text below and copy it.");
    }
  }
  return (
    <aside
      ref={root}
      className="template-drawer"
      role="dialog"
      aria-modal={!headerLive}
      aria-labelledby="template-details-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <h2 id="template-details-title">
          {template.name}
          {GALLERY_SUBTITLE[template.id] && (
            <span className="template-subtitle">
              {" "}
              · {GALLERY_SUBTITLE[template.id]}
            </span>
          )}
        </h2>
        <button
          ref={close}
          aria-label="Close template details"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <DrawerOutput
        template={template}
        media={media}
        run={mechanical ? run : undefined}
      />
      <p className="template-metadata">
        {generation
          ? "One run"
          : `${Number(templateSeconds(template).toFixed(2))} s ${mix ? "cut" : "recipe"}`}{" "}
        · {template.inputs.aspects.join(" / ")} · {galleryBadge(template).label}{" "}
        ·{" "}
        {mechanical
          ? "Runs here"
          : mix
            ? "Opens as it is"
            : "Made with your agent"}
      </p>
      <p className="template-metadata">{templateTools(template).join(" · ")}</p>
      <p className="template-metadata">
        {mix
          ? galleryBadge(template).detail
          : `Models: ${cardModels(template).join(", ")}`}
      </p>
      <p>{template.description}</p>
      {generation && (
        <GenerationNote
          generation={generation}
          madeWith={footageMadeWith(template)}
        />
      )}
      {media?.demo && !generation && (
        <p className="template-demo-note">
          Preview footage
          {footageMadeWith(template) && `, ${footageMadeWith(template)}`}, not a
          result of this recipe. Take it to Director opens the template’s
          editable shot plan.
        </p>
      )}
      {!mix && (
        <TemplateIntake
          template={template}
          intake={intake}
          disabled={working}
        />
      )}
      {mix ? (
        <>
          <MixFields template={template} />
          <ShowcaseVersions template={template.id} />
        </>
      ) : mechanical ? (
        <MechanicalFields template={template} run={run} disabled={working} />
      ) : (
        <AgentFields
          template={template}
          brief={brief}
          onBrief={setBrief}
          disabled={working}
        />
      )}
      <div
        className="template-actions"
        data-run={mechanical ? "mechanical" : "agent"}
      >
        {mix ? null : mechanical ? (
          <MechanicalPrimary run={run} disabled={busy !== ""} />
        ) : (
          <button
            type="button"
            className="template-primary"
            disabled={busy !== ""}
            onClick={() => onGenerate(chosen)}
          >
            {busy === "generate" ? "Starting…" : "Generate now"}
            <Icon name="arrow" size={16} />
          </button>
        )}
        {/* A generation opens no project: the result stays in Camera history. */}
        {!generation && (
          <a
            className="template-secondary"
            href={directorLink(template.id)}
            aria-disabled={working}
            onClick={(e) => {
              if (!plain(e)) return;
              e.preventDefault();
              if (!working) onDirector(chosen);
            }}
          >
            {busy === "director" ? "Opening…" : "Take it to Director"}
          </a>
        )}
        {(session || mechanical || mix) && !generation && (
          <a
            className="template-secondary"
            href={editorLink(template.id)}
            aria-disabled={working}
            onClick={(e) => {
              if (!plain(e)) return;
              e.preventDefault();
              if (!working) onEditor(mechanical ? chosen : undefined);
            }}
          >
            {busy === "editor" ? "Opening…" : "Take it to the editor"}
          </a>
        )}
      </div>
      {(error || run.error || intake.refusal) && (
        <p role="alert">{error || run.error || intake.refusal}</p>
      )}
      <p className="template-metadata" role="status">
        {status ||
          (mechanical
            ? mechanicalStatus(run)
            : mix
              ? "Opens the finished cut in the Director or the editor. Nothing is generated and nothing is paid."
              : "Generate now starts your agent on this template with these references. It quotes every paid step and waits for your approval.")}
      </p>
      {/* Watch and embed pages are the house templates' alone. */}
      {media && !generation && (
        <section className="template-share" aria-label="Share preview">
          <div className="template-share-tabs">
            <button
              aria-pressed={share === "link"}
              onClick={() => setShare("link")}
            >
              Link
            </button>
            <button
              aria-pressed={share === "embed"}
              onClick={() => setShare("embed")}
            >
              Embed
            </button>
            <button onClick={() => void copy()}>
              <Icon name="copy" size={14} />
              Copy {share}
            </button>
          </div>
          <textarea
            aria-label={
              share === "embed" ? "Embed code" : "Public preview link"
            }
            value={value}
            readOnly
            onFocus={(e) => e.target.select()}
            rows={share === "embed" ? 3 : 2}
          />
          <a href={media.video} download>
            Download preview
          </a>
          <span role="status">{message}</span>
        </section>
      )}
    </aside>
  );
}
