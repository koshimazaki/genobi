import { useState } from "react";
import {
  tasteShelfSchema,
  tasteSources,
  type TasteShelf,
} from "../../shared/licensing/taste-shelf";
import { downloadMemory } from "../memory/client";

type Props = {
  shelf: TasteShelf;
  disabled: boolean;
  message: string;
  save: (shelf: TasteShelf) => Promise<boolean>;
};
export default function TasteShelfControls({
  shelf,
  disabled,
  message,
  save,
}: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const count = [...tasteSources, ...shelf.custom].filter(
    (r) => !shelf.excluded.includes(r.id),
  ).length;
  async function add() {
    const result = tasteShelfSchema.safeParse({
      ...shelf,
      custom: [
        ...shelf.custom,
        { id: `custom-${crypto.randomUUID()}`, name, url, note },
      ],
    });
    if (!result.success) {
      setError(
        "Add a name, an HTTPS link and what you like about it. Keep up to 12 custom references.",
      );
      return;
    }
    if (await save(result.data)) {
      setName("");
      setUrl("");
      setNote("");
      setError("");
    }
  }
  return (
    <section className="taste-shelf" aria-label="My taste selection">
      <h2>Build your own taste layer.</h2>
      <p>
        Start with the whole collection. Uncheck anything that doesn’t fit, or
        add your own references for art, music, motion and custom tools. Your
        agents can use this selection as a starting point; your current brief
        always comes first. Export it to keep your choices. Making a fork of
        Genobi? Extend its catalogue with your own libraries, examples and
        creator credits to build a different taste layer.
      </p>
      <div className="taste-shelf-actions">
        <strong>{count} references included</strong>
        <button
          disabled={disabled}
          onClick={() => void save({ ...shelf, excluded: [] })}
        >
          Include all
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            void save({
              ...shelf,
              excluded: [...tasteSources, ...shelf.custom].map((r) => r.id),
            })
          }
        >
          Clear selection
        </button>
        <button
          disabled={disabled}
          onClick={() => downloadMemory(shelf, "genobi-taste-selection.json")}
        >
          Export selection
        </button>
      </div>
      <p role="status">{message}</p>
      <details>
        <summary>Add your own references</summary>
        <form
          className="taste-custom-form"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const link =
              e.dataTransfer
                .getData("text/uri-list")
                .split("\n")
                .find((line) => line && !line.startsWith("#")) ??
              e.dataTransfer.getData("text/plain");
            if (link) setUrl(link.trim());
          }}
        >
          <p>
            Paste or drop a link, then say what the agent should look for. Add
            references here or annotate project assets with the genobi-taste
            skill.
          </p>
          <label>
            Name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Reference link
            <input
              type="url"
              required
              maxLength={2000}
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label>
            What do you like about it?
            <textarea
              required
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button disabled={disabled || shelf.custom.length >= 12}>
            Add reference
          </button>
          <p role="alert">{error}</p>
        </form>
      </details>
      {shelf.custom.map((r) => (
        <article className="taste-custom-reference" key={r.id}>
          <label className="taste-select">
            <input
              type="checkbox"
              disabled={disabled}
              checked={!shelf.excluded.includes(r.id)}
              onChange={(e) =>
                void save({
                  ...shelf,
                  excluded: e.target.checked
                    ? shelf.excluded.filter((id) => id !== r.id)
                    : [...shelf.excluded, r.id],
                })
              }
            />
            Include {r.name} in my taste
          </label>
          <a href={r.url} target="_blank" rel="noreferrer">
            {r.name} ↗
          </a>
          <p>{r.note}</p>
          <button
            disabled={disabled}
            onClick={() =>
              void save({
                ...shelf,
                custom: shelf.custom.filter((item) => item.id !== r.id),
                excluded: shelf.excluded.filter((id) => id !== r.id),
              })
            }
          >
            Remove {r.name}
          </button>
        </article>
      ))}
    </section>
  );
}
