import { useEffect, useRef, useState } from "react";
import { JOBS, LEVELS, type Job } from "../../../shared/walkers/levels";
import { drawField, drawOutcome } from "../../../shared/walkers/render";
import {
  assignJob,
  createLevel,
  stepWalkers,
  targetOrder,
  walkerNear,
  type WalkerEvent,
  type WalkersState,
} from "../../../shared/walkers/sim";
import {
  energyLeft,
  energyLine,
  savedLine,
  walkersActivityLine,
} from "../../../shared/walkers/hud";
import AsciiScreen from "../AsciiScreen";
import { rememberMute, rememberedMute, type ChipAudio } from "./chip-audio";
import type { SfxName } from "./chip-tune";
import { useFixedStep, useOnHidden, useReducedMotion } from "./useWalkersClock";
import { countsTowardCode } from "./konami";
import { useWalkersActivity } from "./useWalkersActivity";
import "./walkers.css";

const LABEL: Record<Job, string> = {
  dig: "DIG",
  build: "BUILD",
  block: "BLOCK",
};
const KEY_JOB: Record<string, Job> = {
  "1": "dig",
  "2": "build",
  "3": "block",
  d: "dig",
  b: "build",
  k: "block",
};
const SOUND: Partial<Record<WalkerEvent["type"], SfxName>> = {
  spawn: "spawn",
  dig: "dig",
  build: "build",
  clink: "clink",
  home: "saved",
  lost: "splat",
  won: "won",
  failed: "failed",
};

interface Game {
  sim: WalkersState;
  /** Ticks shown on the outcome screen, for its little parade. */
  after: number;
}

/**
 * The deck's hidden walkers game (Konami code): little Genobi creatures leave
 * a door and walk; give them jobs to get enough of them home. It replaces the
 * visualiser while open and hands the deck back untouched on Esc. Under
 * reduced motion nothing animates: each STEP press (or `.`) moves one tick.
 */
export default function WalkersGame({
  audio,
  onExit,
}: {
  audio: ChipAudio;
  onExit: () => void;
}) {
  const game = useRef<Game>({ sim: createLevel(0), after: 0 });
  const [, redraw] = useState(0);
  const [job, setJob] = useState<Job>("block");
  const [target, setTarget] = useState<number>();
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(rememberedMute);
  const reduced = useReducedMotion();
  const field = useRef<HTMLButtonElement>(null);
  const sim = game.current.sim;
  const playing = sim.status === "playing";
  const def = LEVELS[sim.level];

  const sound = (name: SfxName) => {
    if (!muted) audio.sfx(name);
  };
  const music = () => {
    if (!muted && audio.start()) audio.music();
  };
  const tick = () => {
    const g = game.current;
    if (g.sim.status !== "playing") {
      g.after += 1;
      return redraw((n) => n + 1);
    }
    const { state, events } = stepWalkers(g.sim);
    g.sim = state;
    for (const e of events) {
      if (e.type === "won" || e.type === "failed") audio.stopMusic();
      const name = SOUND[e.type];
      if (name) sound(name);
    }
    redraw((n) => n + 1);
  };
  const load = (level: number) => {
    game.current = { sim: createLevel(level), after: 0 };
    setTarget(undefined);
    redraw((n) => n + 1);
    if (!paused) music();
  };
  const order = targetOrder(sim);
  const aimed =
    target !== undefined && order.includes(target) ? target : order[0];
  const give = (id: number | undefined, chosen = job) => {
    if (id === undefined) return;
    const r = assignJob(game.current.sim, id, chosen);
    if (!r.ok) return;
    game.current.sim = r.state;
    setTarget(id);
    sound("assign");
    redraw((n) => n + 1);
  };
  const togglePause = () => {
    if (paused) music();
    else audio.stopMusic();
    setPaused(!paused);
  };
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    rememberMute(next);
    if (next) audio.stop();
    else if (playing && !paused && audio.start()) audio.music();
  };
  const advance = () => {
    if (sim.status === "won")
      load(sim.level + 1 < LEVELS.length ? sim.level + 1 : 0);
  };

  useFixedStep(!paused && !reduced, tick);
  useOnHidden(() => {
    setPaused(true);
    audio.stop();
  });
  useEffect(() => {
    field.current?.focus({ preventScroll: true });
    if (!rememberedMute() && audio.start()) audio.music();
    return () => audio.stop();
  }, [audio]);

  // Keys while the game is open. Text fields and dialogs keep their keys; a
  // focused deck button keeps Enter and Space.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (!countsTowardCode(e)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const onButton =
        e.target instanceof HTMLButtonElement && e.target !== field.current;
      let handled = true;
      if (k === "Escape") onExit();
      else if (KEY_JOB[k]) setJob(KEY_JOB[k]);
      else if (k === "ArrowLeft" || k === "ArrowRight") {
        if (order.length) {
          const i = Math.max(0, order.indexOf(aimed ?? -1));
          const step = k === "ArrowLeft" ? -1 : 1;
          setTarget(order[(i + step + order.length) % order.length]);
        }
      } else if ((k === "Enter" || k === " ") && !onButton) {
        if (playing) give(aimed);
        else if (sim.status === "won") advance();
        else load(sim.level);
      } else if (k === "p") togglePause();
      else if (k === "r") load(sim.level);
      else if (k === "n") advance();
      else if (k === "m") toggleMute();
      else if (k === "." || k === "s") tick();
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
  });
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, []);

  const last = sim.level === LEVELS.length - 1;
  const frame = playing
    ? drawField(sim, aimed)
    : drawOutcome(sim.columns, sim.rows, reduced ? 0 : game.current.after, {
        won: sim.status === "won",
        name: def.name,
        saved: sim.saved,
        total: sim.total,
        last,
      });
  const stepping = reduced || paused;
  const left = energyLeft(sim);
  useWalkersActivity(walkersActivityLine(sim, paused));

  return (
    <div className="deck-vis walkers" data-status={sim.status}>
      <p className="walkers-title">
        <span>
          {sim.level + 1}/{LEVELS.length} · {def.name.toUpperCase()}
        </span>
        <span className="walkers-hint">{def.hint}</span>
      </p>
      <button
        ref={field}
        type="button"
        className="deck-art walkers-field"
        aria-label={
          playing
            ? `Walkers field. Give ${LABEL[job].toLowerCase()} to the nearest creature`
            : sim.status === "won"
              ? "Level complete. Continue"
              : "Level failed. Try again"
        }
        onClick={(event) => {
          if (!playing)
            return sim.status === "won" ? advance() : load(sim.level);
          if (event.detail === 0) return give(aimed);
          const r = event.currentTarget.getBoundingClientRect();
          const x = Math.floor(((event.clientX - r.x) / r.width) * sim.columns);
          const y = Math.floor(((event.clientY - r.y) / r.height) * sim.rows);
          give(walkerNear(sim, x, y));
        }}
      >
        <AsciiScreen
          program="metaballs"
          columns={sim.columns}
          rows={sim.rows}
          frame={frame}
        />
      </button>
      <div className="walkers-hud">
        <span aria-hidden="true">{savedLine(sim)}</span>
        <span aria-hidden="true">{energyLine(sim)}</span>
        <output className="sr-only" aria-live="polite">
          Saved {sim.saved} of {sim.need} needed, {left} of {sim.total} still in
          play
          {sim.status === "won"
            ? ". Field won"
            : sim.status === "failed"
              ? ". Field failed"
              : ""}
          {paused ? ". Paused" : ""}
        </output>
      </div>
      <div className="walkers-jobs" role="group" aria-label="Jobs">
        {JOBS.map((j, i) => (
          <button
            key={j}
            type="button"
            className="walkers-job"
            aria-pressed={job === j}
            disabled={sim.jobs[j] <= 0}
            title={`${LABEL[j]} (${i + 1})`}
            onClick={() => setJob(j)}
          >
            {LABEL[j]} {sim.jobs[j]}
          </button>
        ))}
      </div>
      <div className="walkers-controls">
        <button type="button" className="deck-mode" onClick={togglePause}>
          {paused ? "PLAY" : "PAUSE"}
        </button>
        {stepping && (
          <button type="button" className="deck-mode" onClick={tick}>
            STEP
          </button>
        )}
        <button
          type="button"
          className="deck-mode"
          onClick={() => load(sim.level)}
        >
          RESTART
        </button>
        {sim.status === "won" && (
          <button type="button" className="deck-mode" onClick={advance}>
            {last ? "AGAIN" : "NEXT"}
          </button>
        )}
        <button
          type="button"
          className="deck-mode"
          aria-pressed={!muted}
          onClick={toggleMute}
        >
          {muted ? "SOUND OFF" : "SOUND ON"}
        </button>
        <button type="button" className="deck-mode" onClick={onExit}>
          EXIT · ESC
        </button>
      </div>
    </div>
  );
}
