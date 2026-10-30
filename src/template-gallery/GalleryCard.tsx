import { useCallback, useState } from "react";
import {
  GALLERY_AUDIO,
  GALLERY_SUBTITLE,
  galleryMedia,
  gallerySeconds,
  KIND_LABEL,
} from "../../shared/gallery/catalogue";
import { footageLabel, galleryBadge } from "../../shared/gallery/badges";
import type { HouseTemplate } from "../../shared/templates/types";
import Icon from "../components/Icon";
import PreviewVideo from "./PreviewVideo";
import ShareLink from "./ShareLink";
import "./preview-controls.css";

export default function GalleryCard({
  template,
  featured,
  active,
  previewing,
  onPreview,
  soundAllowed,
  onOpen,
}: {
  template: HouseTemplate;
  featured: boolean;
  active: boolean;
  previewing: boolean;
  onPreview: (playing: boolean) => void;
  soundAllowed: boolean;
  onOpen: (button: HTMLButtonElement) => void;
}) {
  const [pointer, setPointer] = useState(false);
  const [focus, setFocus] = useState(false);
  const [sound, setSound] = useState<boolean>();
  const [blocked, setBlocked] = useState(false);
  const soundBlocked = useCallback(() => setBlocked(true), []);
  const playing = active && previewing;
  const audible = GALLERY_AUDIO.has(template.id);
  const unmuted = audible && (sound ?? soundAllowed) && !blocked;
  const media = galleryMedia(template);
  const badge = galleryBadge(template);
  return (
    <article
      className="template-card"
      data-featured={featured}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") {
          setPointer(true);
          onPreview(true);
        }
      }}
      onPointerLeave={() => {
        setPointer(false);
        if (!focus) onPreview(false);
      }}
      onFocus={(e) => {
        if (e.target.matches(":focus-visible")) {
          setFocus(true);
          onPreview(true);
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setFocus(false);
          if (!pointer) onPreview(false);
        }
      }}
    >
      <div className="template-card-media">
        <button
          className="template-card-preview"
          aria-label={`View ${template.name}`}
          onClick={(e) => onOpen(e.currentTarget)}
        >
          <PreviewVideo
            video={media?.preview}
            poster={media?.previewPoster}
            title={template.name}
            active={playing}
            sound={unmuted}
            onSoundBlocked={soundBlocked}
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
        {audible && (
          <button
            className="template-sound"
            aria-label={`${unmuted ? "Mute" : "Enable sound for"} ${template.name}`}
            aria-pressed={unmuted}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") e.stopPropagation();
            }}
            onClick={(e) => {
              const enable = !unmuted;
              setSound(enable);
              setBlocked(false);
              if (enable) {
                onPreview(true);
                if (!pointer) setFocus(true);
              }
              const video =
                e.currentTarget.parentElement?.querySelector("video");
              if (
                enable &&
                active &&
                video &&
                !document.hidden &&
                !matchMedia("(prefers-reduced-motion: reduce)").matches
              ) {
                // Request audio inside the gesture itself, for browsers that
                // require play() synchronously from the Sound button.
                video.muted = false;
                void video.play().catch((error: unknown) => {
                  if (
                    error instanceof DOMException &&
                    error.name === "AbortError"
                  )
                    return;
                  video.muted = true;
                  setBlocked(true);
                });
              }
            }}
          >
            {unmuted ? "Mute" : "Sound"}
          </button>
        )}
      </div>
      <div className="template-card-caption">
        <button onClick={(e) => onOpen(e.currentTarget)}>
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
          <span className="template-kind" title="One generation, run here">
            {KIND_LABEL.generation}
          </span>
        ) : (
          <span title="Director recipe" className="template-tool">
            <Icon name="film" size={14} />
            <span className="sr-only">Director recipe</span>
          </span>
        )}
        <ShareLink id={template.id} name={template.name} />
      </div>
    </article>
  );
}
