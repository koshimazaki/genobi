import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import {
  galleryTemplates,
  galleryMedia,
  gallerySeconds,
  matchesFilters,
  emptyFilters,
  directorLink,
  KIND_LABEL,
  GALLERY_SUBTITLE,
} from "../../shared/gallery/catalogue";
import { footageLabel, galleryBadge } from "../../shared/gallery/badges";
import type { HouseTemplate } from "../../shared/templates/types";
import Icon from "../components/Icon";
import { useShell } from "../studio/ShellContext";
import GalleryFilters from "./GalleryFilters";
import PreviewVideo from "./PreviewVideo";
import TemplateDrawer, { type DrawerBusy } from "./TemplateDrawer";
import type { TemplatePicks } from "./open-template";
import {
  CANCELLED_SPAWN,
  generateNow,
  replaceQuestion,
  replacesWork,
  takeToDirector,
  takeToEditor,
} from "./template-actions";
import { studioStore } from "../studio/store";
import { useShownAgentSession } from "../agent/useAgentSession";
import { useStudio } from "../studio/useStudio";
import "./gallery.css";
import "./gallery-badges.css";

/** The line beside the toggle: what a badge and preview footage mean. */
export const GALLERY_LEGEND =
  "Badges name the models each card runs. Preview footage was not made by the card it sits on; its label names its model when known.";

export default function TemplateGallery({ active }: { active: boolean }) {
  const shell = useShell();
  const [filters, setFilters] = useState({ ...emptyFilters });
  const [hover, setHover] = useState("");
  const [selected, setSelected] = useState<HouseTemplate>();
  const [busy, setBusy] = useState<DrawerBusy>("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  /** Templates a session was started on from this gallery. */
  const [started, setStarted] = useState<ReadonlySet<string>>(new Set());
  const agent = useShownAgentSession();
  const openId = useStudio((s) => s.director.bundle?.project.id);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const shown = galleryTemplates.filter((t) => matchesFilters(t, filters));
  function close() {
    setSelected(undefined);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  /** Runs one drawer action; its refusal stays in the drawer. */
  async function run(kind: DrawerBusy, action: () => Promise<void>) {
    setBusy(kind);
    setMessage("");
    setStatus("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not open template.");
    } finally {
      setBusy("");
    }
  }
  const leave = () => setSelected(undefined);
  const generate = (template: HouseTemplate, chosen: TemplatePicks) => {
    const session =
      started.has(template.id) || (!!agent && openId === template.id);
    if (
      replacesWork(studioStore.getState().director, template.id, session) &&
      !window.confirm(replaceQuestion(template.name))
    )
      return;
    return run("generate", async () => {
      const { session } = await generateNow(template, chosen);
      if (!session) {
        // The person closed the spawn dialog: the template is already open.
        setStatus(CANCELLED_SPAWN);
        return;
      }
      setStarted((ids) => new Set([...ids, template.id]));
      setStatus(
        "Genobi is working on this template. Approve each paid step in the bubble.",
      );
    });
  };
  const director = (template: HouseTemplate, chosen: TemplatePicks) =>
    run("director", async () => {
      await takeToDirector(template, chosen);
      leave();
    });
  const editor = (template: HouseTemplate, chosen?: TemplatePicks) =>
    run("editor", async () => {
      await takeToEditor(template, {}, chosen);
      leave();
    });
  async function copyTemplate(id: string) {
    try {
      await navigator.clipboard.writeText(
        new URL(directorLink(id), location.origin).href,
      );
      setMessage("Template link copied.");
    } catch {
      setMessage("Open the template details to select and copy its link.");
    }
  }
  return (
    <div className="template-gallery" hidden={!active}>
      {active &&
        shell &&
        createPortal(
          <GalleryFilters value={filters} onChange={setFilters} />,
          shell.hosts.galleryFilters,
        )}
      <div className="template-legend" inert={!!selected}>
        <button
          className="template-open-toggle"
          aria-pressed={filters.open === "open"}
          onClick={() =>
            setFilters({
              ...filters,
              open: filters.open === "open" ? "" : "open",
            })
          }
        >
          Open only
        </button>
        <p>{GALLERY_LEGEND}</p>
      </div>
      <div className="template-cards" inert={!!selected}>
        {shown.map((template, index) => {
          const media = galleryMedia(template);
          const badge = galleryBadge(template);
          return (
            <article
              className="template-card"
              key={template.id}
              data-featured={
                index === 0 && !Object.values(filters).some(Boolean)
              }
            >
              <button
                className="template-card-preview"
                aria-label={`View ${template.name}`}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") setHover(template.id);
                }}
                onPointerLeave={() => setHover("")}
                onFocus={() => setHover(template.id)}
                onBlur={() => setHover("")}
                onClick={(e) => {
                  trigger.current = e.currentTarget;
                  setHover("");
                  setSelected(template);
                }}
              >
                <PreviewVideo
                  video={media?.video}
                  poster={media?.poster}
                  title={template.name}
                  active={active && !selected && hover === template.id}
                />
                <span className="template-duration">
                  {Math.round(gallerySeconds(template))}s
                </span>
                {media?.demo && (
                  <span className="template-preview-label">
                    {footageLabel(template)}
                  </span>
                )}
              </button>
              <div className="template-card-caption">
                <button
                  onClick={(e) => {
                    trigger.current = e.currentTarget;
                    setSelected(template);
                  }}
                >
                  {template.name}
                  {GALLERY_SUBTITLE[template.id] && (
                    <span className="template-subtitle">
                      {" "}
                      · {GALLERY_SUBTITLE[template.id]}
                    </span>
                  )}
                </button>
                <span
                  className="template-tier"
                  data-tier={badge.tier}
                  title={badge.detail}
                >
                  {badge.label}
                  <span className="sr-only">: {badge.detail}</span>
                </span>
                {template.generation ? (
                  // One run in place: no Director recipe and no template link.
                  <span
                    className="template-kind"
                    title="One generation, run here"
                  >
                    {KIND_LABEL.generation}
                  </span>
                ) : (
                  <>
                    <span title="Director recipe" className="template-tool">
                      <Icon name="film" size={14} />
                      <span className="sr-only">Director recipe</span>
                    </span>
                    <button
                      title="Copy template link"
                      aria-label={`Copy ${template.name} template link`}
                      onClick={() => void copyTemplate(template.id)}
                    >
                      <Icon name="link" size={16} />
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
        {!shown.length && (
          <div className="template-empty">
            <p>No templates match these filters.</p>
            <button onClick={() => setFilters({ ...emptyFilters })}>
              Clear filters
            </button>
          </div>
        )}
      </div>
      <p className="template-status" role="status">
        {message}
      </p>
      {active && selected && (
        <>
          <button
            className="template-drawer-backdrop"
            tabIndex={-1}
            aria-label="Close template details"
            onClick={close}
          />
          <TemplateDrawer
            key={selected.id}
            template={selected}
            onClose={close}
            busy={busy}
            error={message}
            status={status}
            session={
              started.has(selected.id) || (!!agent && openId === selected.id)
            }
            onGenerate={(chosen) => void generate(selected, chosen)}
            onDirector={(chosen) => void director(selected, chosen)}
            onEditor={(chosen) => void editor(selected, chosen)}
          />
        </>
      )}
    </div>
  );
}
