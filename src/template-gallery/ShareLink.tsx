import { useState, type SyntheticEvent } from "react";
import { watchLink } from "../../shared/gallery/catalogue";
import Icon from "../components/Icon";
import { copyText } from "./copy-text";

// The row's clicks belong to the row: the card's preview sound waits for a
// gesture on the card itself (useSoundGesture listens on the document).
const keep = (e: SyntheticEvent) => e.stopPropagation();

/**
 * A card's public-page row: view the full-resolution cut (when there is one),
 * copy the watch link, and open the watch page in a new tab.
 */
export default function ShareLink({
  id,
  name,
  onView,
}: {
  id: string;
  name: string;
  /** Opens the full cut in the lightbox; absent while the card has no video. */
  onView?: (button: HTMLButtonElement) => void;
}) {
  const [status, setStatus] = useState("");
  const [manual, setManual] = useState(false);
  const url = new URL(watchLink(id), location.origin).href;
  return (
    <div
      className="template-card-share"
      onPointerDown={keep}
      onClick={keep}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") keep(e);
      }}
    >
      {onView && (
        <button
          className="template-card-view"
          data-view={id}
          title="View full size"
          aria-label={`View ${name} full size`}
          onClick={(e) => onView(e.currentTarget)}
        >
          <Icon name="expand" size={16} />
        </button>
      )}
      <button
        className="template-card-copy"
        title="Copy link"
        aria-label={`Copy ${name} video link`}
        onClick={async () => {
          const copied = await copyText(url);
          setManual(!copied);
          setStatus(copied ? "Link copied" : "Select and copy this link.");
        }}
      >
        <Icon name="link" size={16} />
      </button>
      <a
        className="template-card-page"
        href={watchLink(id)}
        target="_blank"
        rel="noopener"
        title="Open page in new tab"
        aria-label={`Open ${name} page in a new tab`}
      >
        <Icon name="arrow" size={16} style={{ transform: "rotate(-45deg)" }} />
      </a>
      <span role="status">{status}</span>
      {manual && (
        <div className="template-copy-fallback">
          <input
            aria-label={`${name} video link`}
            value={url}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <a href={watchLink(id)} target="_blank" rel="noopener">
            Open video page
          </a>
        </div>
      )}
    </div>
  );
}
