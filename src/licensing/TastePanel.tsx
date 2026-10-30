import ThemedSelect from "../components/ThemedSelect";
import TastePreferences from "../memory/TastePreferences";
import { useState } from "react";
import SelectionControls from "./SelectionControls";
import { tasteInspirations } from "../../shared/licensing/taste-shelf";
import TastePreview from "./TastePreview";
import TasteExamples from "./TasteExamples";
import TasteReferenceCard from "./TasteReferenceCard";
import TasteShelfControls from "./TasteShelfControls";
import { useTasteShelf } from "./useTasteShelf";
import {
  licenceMarkdown,
  licenceReport,
  tasteLibraries,
} from "../../shared/licensing/report";
import {
  policies,
  purposes,
  type UsagePreference,
} from "../../shared/licensing/types";
import { readUsage, saveUsage, clearUsage } from "./preferences";
import "./taste.css";
const purposeNames = {
  demo: "Personal / demo video",
  "commercial-video": "Commercial video",
  "redistribute-source": "Share source code",
  "resell-template": "Resell a template / kit",
};
const policyNames = {
  "any-licensed": "Any suitable licence",
  "open-source": "Open-source components",
  "mit-only": "Strict MIT-only components",
};
export default function TastePanel() {
  return <TastePage />;
}
function TastePage() {
  const taste = useTasteShelf();
  function include(id: string, checked: boolean) {
    void taste.save({
      ...taste.shelf,
      excluded: checked
        ? taste.shelf.excluded.filter((held) => held !== id)
        : [...taste.shelf.excluded, id],
    });
  }
  const [query, setQuery] = useState("");
  const [relationship, setRelationship] = useState("all");
  const [purpose, setPurpose] = useState<UsagePreference["purpose"] | "">(
    () => readUsage()?.purpose ?? "",
  );
  const [policy, setPolicy] = useState<UsagePreference["policy"]>(
    () => readUsage()?.policy ?? "any-licensed",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const usage = purpose ? { purpose, policy } : undefined;
  const report = usage ? licenceReport(usage, selected) : undefined;
  function change(nextPurpose: typeof purpose, nextPolicy: typeof policy) {
    setPurpose(nextPurpose);
    setPolicy(nextPolicy);
    if (nextPurpose) saveUsage({ purpose: nextPurpose, policy: nextPolicy });
    else clearUsage();
  }
  function download(json: boolean) {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob(
        [json ? JSON.stringify(report, null, 2) : licenceMarkdown(report)],
        { type: json ? "application/json" : "text/markdown" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = json ? "licences-plan.json" : "CREDITS-plan.md";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main className="taste-dialog taste-page">
      <header>
        <div>
          <p>GENOBI / THE TASTE LAYER</p>
          <h1>Made possible by talented people &amp; cool projects.</h1>
        </div>
        <a href="/">Open Genobi ↗</a>
      </header>
      <p className="taste-intro">
        Explore the craft. Make it your own. This collection connects visual
        examples with creator credits and intended-use checks for projects made
        in Genobi. Selected libraries and aesthetics form the foundation of our
        Taste layer: a code-based mood board that gives agents a starting point
        for your work.
      </p>
      <p className="taste-intro">
        Genobi is designed for voice and agent harnesses, with API, CLI and MCP
        tools for supported workflows. Use the interface to preview, compare and
        make aesthetic judgements, then guide your agent by voice or text. Your
        selection travels with the project context; your brief comes first.
      </p>
      <TasteExamples />
      <TasteShelfControls {...taste} />
      {!taste.readOnly && <TastePreferences />}
      {!taste.readOnly && (
        <details className="taste-settings" id="setup">
          <summary>Model defaults &amp; licence planning</summary>
          <SelectionControls />
          <section className="taste-preference" aria-label="Intended use">
            <label>
              What are you making?
              <ThemedSelect
                value={purpose}
                onChange={(e) =>
                  change(e.target.value as typeof purpose, policy)
                }
              >
                <option value="">Choose when needed</option>
                {purposes.map((id) => (
                  <option key={id} value={id}>
                    {purposeNames[id]}
                  </option>
                ))}
              </ThemedSelect>
            </label>
            <label>
              Component preference
              <ThemedSelect
                value={policy}
                onChange={(e) =>
                  change(purpose, e.target.value as typeof policy)
                }
              >
                {policies.map((id) => (
                  <option key={id} value={id}>
                    {policyNames[id]}
                  </option>
                ))}
              </ThemedSelect>
            </label>
            <p>
              Saved for new agent briefs. Your prompt can override it. This
              checks selected components; it does not certify every dependency,
              model or uploaded asset.
            </p>
          </section>
        </details>
      )}
      <h2 id="libraries">Libraries &amp; projects to build with.</h2>
      <section className="taste-find" aria-label="Browse the taste layer">
        <label>
          Find a library or project
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ASCII, Paper, drawing, typography…"
          />
        </label>
        <label>
          Relationship
          <ThemedSelect
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          >
            <option value="all">All libraries &amp; projects</option>
            <option value="integrated">Integrated</option>
            <option value="recommended">Recommended</option>
            <option value="reference">References</option>
          </ThemedSelect>
        </label>
        <p>
          {tasteLibraries.length} libraries · 1 project reference ·{" "}
          <a href="/credits/catalog.json">Agent-readable catalogue</a>
        </p>
      </section>
      <p>
        ASCII &amp; textmode tools are optional: choose them for glyph sketches,
        diagrams, loaders or video overlays when they fit your brief. They also
        suit website and game experiments. Recommended libraries are not
        installed.
      </p>
      <div className="taste-grid">
        {tasteInspirations
          .filter(
            (item) =>
              item.id === "motion2code" &&
              (relationship === "all" || relationship === "reference") &&
              [item.name, item.note]
                .join(" ")
                .toLowerCase()
                .includes(query.trim().toLowerCase()),
          )
          .map((item) => (
            <TasteReferenceCard
              key={item.id}
              item={item}
              disabled={taste.disabled}
              checked={!taste.shelf.excluded.includes(item.id)}
              include={include}
            />
          ))}
        {tasteLibraries
          .filter(
            (item) =>
              (relationship === "all" || item.status === relationship) &&
              [item.name, item.author, item.reason, item.use, item.license]
                .join(" ")
                .toLowerCase()
                .includes(query.trim().toLowerCase()),
          )
          .map((item) => {
            const checked = usage ? licenceReport(usage, [item.id]).rows : [];
            const issue = checked.find((row) => row.decision !== "conditions");
            return (
              <article key={item.id} id={`taste-library-${item.id}`}>
                <TastePreview
                  id={item.id}
                  name={item.name}
                  url={item.example ?? item.source}
                />
                <div className="taste-tag">
                  {item.status} · {item.license}
                </div>
                <h2>
                  <a href={item.source} target="_blank" rel="noreferrer">
                    {item.name} ↗
                  </a>
                </h2>
                <p className="taste-author">
                  By{" "}
                  {item.creatorUrl ? (
                    <a href={item.creatorUrl}>{item.author} ↗</a>
                  ) : (
                    item.author
                  )}
                </p>
                <label className="taste-select">
                  <input
                    type="checkbox"
                    disabled={taste.disabled}
                    checked={!taste.shelf.excluded.includes(item.id)}
                    onChange={(e) => include(item.id, e.target.checked)}
                  />
                  Include {item.name} in my taste
                </label>
                <p>
                  {item.id === "ibm-plex-mono"
                    ? "IBM Plex Mono brings clear, readable monospace type to labels, code and interface details. The font is the building block featured here."
                    : item.reason}
                </p>
                <p className="taste-use">{item.use}</p>
                <details>
                  <summary>Licence, source & conditions</summary>
                  <p>{item.conditions}</p>
                  <p>
                    Version: {item.version}
                    <br />
                    Checked: {item.checked}
                  </p>
                  <a
                    href={`https://github.com/koshimazaki/Genobi/tree/main/docs/credits/libraries/${item.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Credit dossier ↗
                  </a>
                </details>
                {issue && (
                  <p className="taste-issue">
                    {issue.decision}: {issue.reason}
                  </p>
                )}
                <details>
                  <summary>Plan to use this component</summary>
                  <label className="taste-select">
                    <input
                      type="checkbox"
                      disabled={taste.readOnly}
                      checked={selected.includes(item.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, item.id]
                            : selected.filter((id) => id !== item.id),
                        )
                      }
                    />
                    Include in planned inventory
                  </label>
                </details>
              </article>
            );
          })}
      </div>
      <section className="taste-inspiration">
        <h2>Ideas have a lineage, too.</h2>
        <div className="taste-grid">
          {tasteInspirations
            .filter((item) => item.id !== "motion2code")
            .map((item) => (
              <TasteReferenceCard
                key={item.id}
                item={item}
                disabled={taste.disabled}
                checked={!taste.shelf.excluded.includes(item.id)}
                include={include}
              />
            ))}
        </div>
        <p>
          Kibo — artistic inspiration named by Koshi. Exact profile/post
          awaiting confirmation; no code, artwork licence or endorsement
          assumed.
        </p>
        <section className="taste-uncommon" aria-label="Uncommon Web">
          <a
            className="taste-uncommon-wordmark"
            href="https://webdev.teknium.io/"
            target="_blank"
            rel="noreferrer"
          >
            uncommon web ↗
          </a>
          <p>
            Presentation inspired by Uncommon Web, assembled by Hermes Agent for
            Teknium. Explore his collection of creative web experiments.
          </p>
          <label className="taste-select">
            <input
              type="checkbox"
              disabled={taste.disabled}
              checked={!taste.shelf.excluded.includes("uncommon-web")}
              onChange={(e) => include("uncommon-web", e.target.checked)}
            />
            Include Uncommon Web in my taste
          </label>
        </section>
      </section>
      <footer>
        <strong>Planned inventory · {selected.length} selected</strong>
        <p>
          Reports include known dependencies and flag unknowns. Agents should
          produce a fresh used-in-this-run report after rendering, with model
          routes and asset rights.
        </p>
        <button
          disabled={!report || !selected.length}
          onClick={() => download(false)}
        >
          Download credits plan
        </button>{" "}
        <button
          disabled={!report || !selected.length}
          onClick={() => download(true)}
        >
          Download licence JSON
        </button>
      </footer>
    </main>
  );
}
