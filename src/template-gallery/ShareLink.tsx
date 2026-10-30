import { useState } from "react";
import { watchLink } from "../../shared/gallery/catalogue";
import Icon from "../components/Icon";
import { copyText } from "./copy-text";

export default function ShareLink({ id, name }: { id: string; name: string }) {
  const [status, setStatus] = useState("");
  const [manual, setManual] = useState(false);
  const url = new URL(watchLink(id), location.origin).href;
  return (
    <div className="template-card-share">
      <button
        title="Copy video link"
        aria-label={`Copy ${name} video link`}
        onClick={async () => {
          const copied = await copyText(url);
          setManual(!copied);
          setStatus(copied ? "Link copied" : "Select and copy this link.");
        }}
      >
        <Icon name="link" size={16} />
      </button>
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
