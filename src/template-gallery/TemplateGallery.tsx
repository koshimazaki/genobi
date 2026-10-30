import { createPortal } from "react-dom";
import { useRef, useState } from "react";
import {
  galleryTemplates,
  matchesFilters,
  emptyFilters,
} from "../../shared/gallery/catalogue";
import type { HouseTemplate } from "../../shared/templates/types";
import { useShell } from "../studio/ShellContext";
import GalleryFilters from "./GalleryFilters";
import GalleryCard from "./GalleryCard";
import { useSoundGesture } from "./useSoundGesture";
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
  const soundAllowed = useSoundGesture();
  const [previewId, setPreviewId] = useState<string>();
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
        {shown.map((template, index) => (
          <GalleryCard
            key={template.id}
            template={template}
            featured={index === 0 && !Object.values(filters).some(Boolean)}
            active={active && !selected}
            previewing={previewId === template.id}
            onPreview={(playing) =>
              setPreviewId((current) =>
                playing
                  ? template.id
                  : current === template.id
                    ? undefined
                    : current,
              )
            }
            soundAllowed={soundAllowed}
            onOpen={(button) => {
              trigger.current = button;
              setSelected(template);
            }}
          />
        ))}
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
