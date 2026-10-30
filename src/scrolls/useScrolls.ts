import { isTerminal } from "../../shared/types";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyScrollCommand,
  createScroll,
} from "../../shared/scrolls/commands";
import {
  DEFAULT_GENERATOR,
  fitGenerator,
  type ScrollGenerator,
} from "../../shared/scrolls/generator";
import {
  parseScroll,
  type AssetRole,
  type ScrollCell,
  type ScrollKind,
} from "../../shared/scrolls/types";
import type { AudioAnalysisReport } from "../../shared/audio-report";
import type { Source } from "../../shared/types";
import { request } from "../useJobs";
import { addFile, assetType, openScroll, type ScrollBundle } from "./bundle";
import { useGenerationBridge } from "./bridge";
import { changeScrollKind, removalIds, removeScrollAsset } from "./asset-edits";
import type { ScrollExample } from "./example-catalog";
import { addPanelFrames } from "./panel-frames";
import { approvedRun, type Approval } from "./approval";
import {
  collectScroll,
  liveReferences,
  quoteTarget,
  submitRuns,
  type PendingRun,
  type QuoteTarget,
  type UnconfirmedRun,
} from "./generate";
import { landInProject } from "./to-project";
import { applyPanels } from "./agent-fill";
import type { PanelFill } from "../../shared/scrolls/fill";

export function useScrolls() {
  const [bundle, setBundle] = useState<ScrollBundle>(() => ({
    document: createScroll("storyboard", 8, `scroll-${crypto.randomUUID()}`),
    files: new Map(),
  }));
  const held = useRef(bundle);
  held.current = bundle;
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  // Every run of one quoted action: a sheet or board is one, Fill panels one per empty panel.
  const [approvals, setApprovals] = useState<Approval[]>();
  const [generator, setGenerator] =
    useState<ScrollGenerator>(DEFAULT_GENERATOR);
  // Asset IDs the next run is made "like", in the order they were picked.
  const [references, setReferences] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<AudioAnalysisReport>();
  const [pendingRuns, setPendingRuns] = useState<PendingRun[]>([]);
  // Panel runs whose submission may have started; Fill skips them until cleared.
  const [unconfirmedRuns, setUnconfirmed] = useState<UnconfirmedRun[]>([]);
  const unconfirmed = unconfirmedRuns.filter(
    (u) => u.documentId === bundle.document.id,
  );
  const pending = pendingRuns.length ? pendingRuns : undefined;
  const collecting = useRef(new Set<string>());
  const bridge = useGenerationBridge();
  const commit = useCallback((next: ScrollBundle, expected = held.current) => {
    if (held.current !== expected)
      throw new Error("Scroll changed while preparing media. Try again.");
    held.current = next;
    setBundle(next);
    setApprovals(undefined);
  }, []);
  const run = useCallback(async (task: () => Promise<void>) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      await task();
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not complete this action.",
      );
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);
  const edit = (command: Record<string, unknown>) => {
    try {
      const before = held.current;
      commit(
        {
          ...before,
          document: applyScrollCommand(before.document, {
            revision: before.document.revision,
            ...command,
          }),
        },
        before,
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const cell = (patch: Partial<ScrollCell>) => {
    const current = held.current.document.cells.find(
      (c) => c.id === selectedCell,
    );
    if (current) edit({ op: "cell", cell: { ...current, ...patch } });
  };
  function changeKind(kind: ScrollKind) {
    if (busy || pending) return;
    commit(changeScrollKind(held.current, kind));
    setMessage("Sheet type changed. Your images and edits are kept.");
  }
  function removeAsset(assetId: string) {
    if (busy || pending) return;
    const before = held.current,
      ids = removalIds(before, assetId);
    if (
      ids.size > 1 &&
      !window.confirm(
        `Remove this image and ${ids.size - 1} derived frames? Cell prompts and directions will stay.`,
      )
    )
      return;
    commit(removeScrollAsset(before, assetId), before);
    setAnalysis(undefined);
    setMessage("Asset removed. Cell prompts, directions and timing are kept.");
  }
  const startExample = (file: File, example: ScrollExample) =>
    run(async () => {
      if (pending)
        throw new Error(
          "Wait for the current generation before replacing this scroll.",
        );
      if (!example.plan)
        throw new Error("This example has no storyboard plan.");
      const before = held.current;
      if (
        (before.document.assets.length ||
          before.document.prompt ||
          before.document.cells.some(
            (c) => c.prompt || c.camera || c.action,
          )) &&
        !window.confirm(
          "Replace this scroll with the example plan? Save your bundle first to keep it.",
        )
      )
        throw new Error("Current scroll kept.");
      const d = createScroll(
        "storyboard",
        example.plan.shots.length,
        `scroll-${crypto.randomUUID()}`,
      );
      d.name = example.name;
      d.prompt = example.plan.prompt;
      d.cells = d.cells.map((c, i) => ({
        ...c,
        title: example.plan!.shots[i][0],
        camera: example.plan!.shots[i][1],
        action: example.plan!.shots[i][2],
        prompt: example.plan!.panels?.[i]?.prompt ?? "",
      }));
      let next = await addFile(
        { document: parseScroll(d), files: new Map() },
        file,
        "style",
      );
      next = {
        ...next,
        document: {
          ...next.document,
          sheetAssetId: next.document.assets[0].id,
        },
      };
      next = await addPanelFrames(next, example);
      commit(next, before);
      setSelectedCell(null);
      setAnalysis(undefined);
      setMessage(
        example.plan.panels
          ? "Storyboard loaded with each panel's 3D frame as its own reference. Fill panels draws each panel from its frame."
          : "Storyboard loaded as one sheet with editable camera and action directions.",
      );
    });
  function start(kind: ScrollKind) {
    if (busy || pending) return;
    const before = held.current;
    if (
      (before.document.prompt ||
        before.document.assets.length ||
        before.document.cells.some((c) => c.prompt)) &&
      !window.confirm(
        "Start a new scroll? Save this bundle first to keep its prompts and media.",
      )
    )
      return;
    commit({
      document: createScroll(
        kind,
        kind === "character" ? 6 : 8,
        `scroll-${crypto.randomUUID()}`,
      ),
      files: new Map(),
    });
    setSelectedCell(null);
    setAnalysis(undefined);
  }
  const importFiles = (files: File[], role: AssetRole) =>
    run(async () => {
      if (files.length > 16)
        throw new Error("Import at most 16 files at once.");
      const before = held.current;
      let next = before;
      for (const file of files)
        next = await addFile(
          next,
          file,
          role,
          role === "panel" ? (selectedCell ?? undefined) : undefined,
        );
      if (role === "audio")
        next = {
          ...next,
          document: applyScrollCommand(next.document, {
            op: "timing",
            revision: next.document.revision,
            timing: { enabled: true, audioId: next.document.assets.at(-1)!.id },
          }),
        };
      const image = next.document.assets
        .slice(before.document.assets.length)
        .reverse()
        .find((a) => a.kind === "image");
      if (image)
        next = {
          ...next,
          document: applyScrollCommand(next.document, {
            op: "brief",
            revision: next.document.revision,
            sheetAssetId: image.id,
          }),
        };
      commit(next, before);
      setMessage(
        `${files.length} asset${files.length === 1 ? "" : "s"} imported. Select a result to use it.`,
      );
    });
  const load = (file: File) =>
    run(async () => {
      const before = held.current,
        next = await openScroll(file, before);
      commit(next, before);
      setSelectedCell(null);
      setAnalysis(undefined);
      setMessage("Scroll opened. Media and prompts restored.");
    });
  /** Quotes a sheet or board (one run), one cell, or every empty panel. */
  const quote = (target: QuoteTarget) =>
    run(async () => {
      if (!bridge) throw new Error("Generation is still opening.");
      const before = held.current;
      const quoted = await quoteTarget(
        bridge,
        before,
        generator,
        references,
        target,
        unconfirmed.map((u) => u.cellId),
      );
      if (held.current !== before)
        throw new Error(
          "Scroll changed. Review the edited prompt and quote it again.",
        );
      setApprovals(quoted);
    });
  /** Adds a library sheet as a reference without changing the board's sheet. */
  const addReference = (file: File) =>
    run(async () => {
      const before = held.current,
        next = await addFile(before, file, "style");
      commit(next, before);
      setReferences((ids) => [...ids, next.document.assets.at(-1)!.id]);
      setMessage("Reference added. Quote to make one like it.");
    });
  const approve = () =>
    run(async () => {
      const quoted = approvals,
        d = held.current.document;
      if (!bridge || !quoted?.length)
        throw new Error("The quote is stale. Request a new quote.");
      // Every run is checked before any is sent, then the quotes are cleared:
      // a failure never resubmits one, and nothing is retried.
      const runs = quoted.map((a) => approvedRun(a, d.revision));
      setApprovals(undefined);
      await submitRuns(
        bridge,
        d.id,
        quoted,
        runs,
        (started) => setPendingRuns((list) => [...list, started]),
        (run) => setUnconfirmed((list) => [...list, run]),
      );
      setMessage(
        "Generation started. Keep this tab open; results appear below.",
      );
    });
  useEffect(() => {
    if (!pending || !bridge || busy) return;
    for (const item of pending) {
      if (collecting.current.has(item.jobId)) continue;
      const job = bridge.jobs.find((j) => j.id === item.jobId);
      if (!job) continue;
      if (job.status !== "Ready") {
        if (isTerminal(job.status)) {
          setMessage(job.error ?? `Generation ended: ${job.status}`);
          setPendingRuns((list) => list.filter((p) => p !== item));
        }
        continue;
      }
      collecting.current.add(item.jobId);
      void run(async () => {
        try {
          const before = held.current,
            {
              bundle: next,
              placed,
              assetId,
            } = await collectScroll(before, job, item);
          commit(next, before);
          // As it generates, to the project's assets (Project tab).
          const landed = await landInProject(next, assetId);
          setMessage(
            `${
              !item.fill
                ? "Result ready. Select your favourites below."
                : placed
                  ? "Panel filled. Remove or replace it like any other image."
                  : "Added as a candidate (the panel was filled meanwhile)."
            } ${landed}`,
          );
        } finally {
          setPendingRuns((list) => list.filter((p) => p !== item));
        }
      });
      return;
    }
  }, [pending, bridge, busy, run, commit]);
  /** The agent's panels (Describe the video), into the scroll that asked. */
  function fill(documentId: string, panels: PanelFill[]) {
    const before = held.current;
    if (before.document.id !== documentId)
      return "Genobi's panels were for a scroll that is no longer open; nothing changed.";
    const { document, filled } = applyPanels(before.document, panels);
    commit({ ...before, document }, before);
    return `Genobi filled ${filled} panel${filled === 1 ? "" : "s"}. Edit them, then Generate board.`;
  }
  const analyze = () =>
    run(async () => {
      const before = held.current,
        audio = before.document.assets.find(
          (a) => a.id === before.document.timing.audioId,
        );
      if (!audio) throw new Error("Import audio first.");
      const { source } = await request<{ source: Source }>("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": assetType(audio) },
        body: new Blob([before.files.get(audio.file.path)!], {
          type: assetType(audio),
        }),
      });
      const { report } = await request<{ report: AudioAnalysisReport }>(
        "/api/audio/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: source.id }),
        },
      );
      if (held.current !== before)
        throw new Error("Scroll changed during analysis. Analyze again.");
      setAnalysis(report);
      setMessage(
        report.beatFound
          ? "Beat suggestion ready. Review it before retiming."
          : "No reliable beat found. Keep manual timing.",
      );
    });
  return {
    bundle,
    isCurrent: (expected: ScrollBundle) => held.current === expected,
    commit,
    selectedCell,
    setSelectedCell,
    message,
    setMessage,
    busy,
    run,
    edit,
    cell,
    start,
    changeKind,
    removeAsset,
    startExample,
    importFiles,
    load,
    quote,
    approve,
    approvals,
    pending,
    unconfirmed,
    clearUnconfirmed: (cellId: string) =>
      setUnconfirmed((list) => list.filter((u) => u.cellId !== cellId)),
    generator,
    setGenerator: (value: ScrollGenerator) => {
      setApprovals(undefined);
      setGenerator(fitGenerator(value));
    },
    references: liveReferences(bundle, references),
    setReferences: (ids: string[]) => {
      setApprovals(undefined);
      setReferences(ids);
    },
    addReference,
    analysis,
    analyze,
    fill,
  };
}
