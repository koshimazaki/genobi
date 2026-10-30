import ThemedSelect from "../components/ThemedSelect";
import { useRef, useState } from "react";
import { readReference } from "../image-files";
import type { PageKey } from "../usePageKey";
import { useJobs } from "../useJobs";
import { swapInput } from "./remix-prompt";
import type { Box } from "../image-regions";
import type { GenerateInput } from "../../shared/types";
import { publicGenerationRecipe } from "../../shared/director/generation-recipe";
import { isTerminal } from "../../shared/types";
import { useJobActivity, useMarkBusy } from "../busy";
import Spinner from "../components/Spinner";

export default function RemixGeneration({
  connection,
  targetLabel = "both shots",
  disabled,
  apply,
}: {
  connection: PageKey;
  targetLabel?: string;
  disabled: boolean;
  apply: (
    file: File,
    input: GenerateInput,
    recipe?: ReturnType<typeof publicGenerationRecipe>,
  ) => Promise<void>;
}) {
  const [key, setKey] = connection;
  const { generate, jobs, error } = useJobs(key);
  const [references, setReferences] = useState<string[]>(["", ""]);
  const [mode, setMode] = useState<
    "character" | "face" | "background" | "clothing"
  >("character");
  const [box, setBox] = useState("0,0,1000,1000"),
    [notes, setNotes] = useState("");
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  const [run, setRun] = useState<{ id: string; input: GenerateInput }>();
  const inFlight = useRef(false);
  const job = jobs.find((j) => j.id === run?.id);
  const working = pending || Boolean(job && !isTerminal(job.status));
  useJobActivity(jobs);
  useMarkBusy("director-swap", pending, "DIRECTOR SWAP · SENDING");
  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setMessage("");
    try {
      const input = swapInput(
        mode,
        references,
        box.split(",").map(Number) as Box,
        notes,
      );
      const job = await generate(input);
      setRun({ id: job.id, input });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return (
    <details className="dir-swap">
      <summary>
        Generate a character, face, background or clothing swap · FLUX
      </summary>
      <p>
        Drop a scene and a replacement reference. Generation uses your Comfy or
        BFL key; review the result before applying it to {targetLabel}. Swap
        only characters and faces you own or have consent to use.
      </p>
      <fieldset
        disabled={
          disabled ||
          pending ||
          Boolean(
            job &&
            ![
              "Ready",
              "Error",
              "expired",
              "stopped",
              "Request Moderated",
              "Content Moderated",
            ].includes(job.status),
          )
        }
      >
        <label>
          Swap
          <ThemedSelect
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="character">Character</option>
            <option value="face">Face</option>
            <option value="background">Background</option>
            <option value="clothing">Clothing</option>
          </ThemedSelect>
        </label>
        {["Scene image", "Replacement reference"].map((label, i) => (
          <label key={label}>
            {label}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const ref = await readReference(file);
                  setReferences((old) =>
                    old.map((v, n) => (n === i ? ref : v)),
                  );
                  setMessage("");
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : String(e));
                }
              }}
            />
            {references[i] && <img alt={label} src={references[i]} />}
          </label>
        ))}
        <label>
          Target box · top,left,bottom,right · 0–1000
          <input value={box} onChange={(e) => setBox(e.target.value)} />
        </label>
        <label>
          Instructions
          <input
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label>
          Provider key · this page only
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <button
          disabled={!key.trim() || references.some((r) => !r)}
          onClick={() => void submit()}
        >
          Generate image · paid
        </button>
      </fieldset>
      {(message || error) && <p role="alert">{message || error}</p>}
      {job && (
        <p role="status">
          {working && <Spinner name="dots12" />} Image: {job.status}
        </p>
      )}
      {job?.status === "Ready" && job.resultUrl && run && (
        <>
          <img alt="Generated swap preview" src={job.resultUrl} />
          <button
            disabled={disabled || pending}
            onClick={async () => {
              setPending(true);
              setMessage("");
              try {
                const response = await fetch(job.resultUrl!);
                if (!response.ok) throw new Error("Result download failed");
                const blob = await response.blob();
                const ext =
                  blob.type === "image/jpeg"
                    ? "jpg"
                    : blob.type === "image/webp"
                      ? "webp"
                      : blob.type === "image/png"
                        ? "png"
                        : null;
                if (!ext) throw new Error("Result must be PNG, JPEG or WebP");
                // Older/offline takes remain usable with visibly unknown provenance.
                let recipe: ReturnType<typeof publicGenerationRecipe>;
                try {
                  const takeResponse = await fetch(
                    `/api/takes/${encodeURIComponent(job.id)}`,
                    { headers: { "X-Genobi-Agent": "1" } },
                  );
                  if (takeResponse.ok) {
                    const body = await takeResponse.json();
                    recipe = publicGenerationRecipe(body?.take?.recipe);
                  }
                } catch {
                  /* Missing provenance stays unresolved in the render report. */
                }
                await apply(
                  new File([blob], `swap.${ext}`, { type: blob.type }),
                  run.input,
                  recipe,
                );
                setMessage(
                  `Applied to ${targetLabel}. Save the bundle to keep this result.`,
                );
              } catch (e) {
                setMessage(e instanceof Error ? e.message : String(e));
              } finally {
                setPending(false);
              }
            }}
          >
            Use result in {targetLabel}
          </button>
        </>
      )}
    </details>
  );
}
