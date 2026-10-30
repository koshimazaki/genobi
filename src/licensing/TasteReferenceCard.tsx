import TastePreview from "./TastePreview";

export default function TasteReferenceCard({
  item,
  disabled,
  checked,
  include,
}: {
  item: { id: string; name: string; url: string; note: string };
  disabled: boolean;
  checked: boolean;
  include: (id: string, checked: boolean) => void;
}) {
  return (
    <article id={item.id}>
      <TastePreview id={item.id} name={item.name} url={item.url} />
      <p className="taste-tag">Project reference</p>
      <h2>
        <a href={item.url} target="_blank" rel="noreferrer">
          {item.name} ↗
        </a>
      </h2>
      <p>{item.note}</p>
      {item.id === "motion2code" && (
        <p className="taste-use">
          A reference for turning motion into editable, seekable code. Explore
          it with your agent when developing typography, timing and animation
          for a Genobi project.
        </p>
      )}
      {item.id === "andrew-zellinger" && (
        <p className="taste-use">
          A collaborator of Koshi’s, with projects exploring voice and agent
          workflows.
        </p>
      )}
      <label className="taste-select">
        <input
          type="checkbox"
          disabled={disabled}
          checked={checked}
          onChange={(e) => include(item.id, e.target.checked)}
        />
        Include {item.name} in my taste
      </label>
    </article>
  );
}
