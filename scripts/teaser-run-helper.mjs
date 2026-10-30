// Computes teaser-run numbers so a weak model never guesses them: the
// sections from an audio analysis, and pointer, focus-box and zoom layer
// parameters from the capture log (docs/genobi-teaser-footage.json). Prints
// JSON; reads files only; nothing is generated or paid for.
//
//   node scripts/teaser-run-helper.mjs analyse <audio file>   (the studio's own analyser, run here)
//   node scripts/teaser-run-helper.mjs sections <analysis.json>
//   node scripts/teaser-run-helper.mjs labels <footage-id>
//   node scripts/teaser-run-helper.mjs slice <footage-id> "<first label>" "<last label>"
//   node scripts/teaser-run-helper.mjs cursor <footage-id> <sourceSeconds> <beats>
//   node scripts/teaser-run-helper.mjs focus <footage-id> "<event label>" "<TEXT>" <beats> [pad]
//   node scripts/teaser-run-helper.mjs move <footage-id> "<event label>" [zoom]   (a shot's camera move)
//   node scripts/teaser-run-helper.mjs view <cut.json> <shot startBeat> [layer startBeat]
//   node scripts/teaser-run-helper.mjs zoom <footage-id> "<event label>" [zoom]   (v1's ui-zoom layer)
//   node scripts/teaser-run-helper.mjs beat <seconds>      (cut beat at 135 BPM)
//   node scripts/teaser-run-helper.mjs seconds <beat>      (cut seconds at 135 BPM)
//
// See docs/genobi-teaser-run/README.md.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { register } from "tsx/esm/api";

const BPM = 135;
const [command, ...args] = process.argv.slice(2);
const usage = () => {
  console.error(
    "Usage: node scripts/teaser-run-helper.mjs analyse <audio file> | sections <analysis.json> | labels <footage-id> | slice <footage-id> <first label> <last label> | cursor <footage-id> <sourceSeconds> <beats> | focus <footage-id> <label> <TEXT> <beats> [pad] | move <footage-id> <label> [zoom] | view <cut.json> <shot beat> [layer beat] | zoom <footage-id> <label> [zoom] | beat <seconds> | seconds <beat>",
  );
  process.exit(64);
};
const number = (v, name) => {
  const n = Number(v);
  if (v === undefined || !Number.isFinite(n)) {
    console.error(`${name} must be a number`);
    process.exit(64);
  }
  return n;
};

register();
const f = await import("./lib/teaser-run/footage.ts");
// The v2 capture log by default; TEASER_RUN_FOOTAGE=v1 reads v1's frozen log
// (docs/genobi-teaser-run/footage-v1.json) to rebuild the archived v1 edit.
const footage = () =>
  JSON.parse(
    readFileSync(
      new URL(
        process.env.TEASER_RUN_FOOTAGE === "v1"
          ? "../docs/genobi-teaser-run/footage-v1.json"
          : "../docs/genobi-teaser-footage.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
const r3 = (n) => Math.round(n * 1000) / 1000;

try {
  let out;
  if (command === "analyse") {
    if (!args[0]) usage();
    // The same code as genobi audio-analysis (shared/audio-analysis.ts), on
    // the same input: mono float32 at 22,050 Hz from ffmpeg. Local, never
    // paid, and needs no studio (an agent-marked CLI cannot upload audio).
    const { analyseAudio } = await import("../shared/audio-analysis.ts");
    const pcm = execFileSync(
      process.env.FFMPEG ?? "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        args[0],
        "-ac",
        "1",
        "-ar",
        "22050",
        "-f",
        "f32le",
        "pipe:1",
      ],
      { maxBuffer: 1 << 30 },
    );
    const samples = new Float32Array(
      pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength),
    );
    const report = analyseAudio(samples, 22050);
    const { onsets, intensity, ...rest } = report;
    out = {
      ...rest,
      onsets: {
        kick: onsets.kick.length,
        snare: onsets.snare.length,
        hat: onsets.hat.length,
      },
      intensityStepSeconds: intensity.stepSeconds,
    };
  } else if (command === "sections") {
    if (!args[0]) usage();
    const raw = JSON.parse(readFileSync(args[0], "utf8"));
    // genobi audio-analysis prints the report, or {result: report} on MCP.
    out = f.sectionsFrom(raw.result ?? raw);
  } else if (command === "labels") {
    const log = footage()[args[0]]?.log;
    if (!log) throw new Error(`No footage "${args[0]}".`);
    out = log.map((e) => ({ t: e.t, kind: e.kind, label: e.label }));
  } else if (command === "slice") {
    if (!args[1]) usage();
    out = f.sliceFor(footage(), args[0], args[1], args[2] ?? args[1], BPM);
  } else if (command === "cursor")
    out = f.cursorFor(
      footage(),
      args[0],
      number(args[1], "sourceSeconds"),
      number(args[2], "beats"),
      BPM,
    );
  else if (command === "focus") {
    if (!args[1] || !args[2]) usage();
    out = f.focusFor(
      footage(),
      args[0],
      args[1],
      args[2],
      number(args[3], "beats"),
      BPM,
      args[4] === undefined ? 0 : number(args[4], "pad"),
    );
  } else if (command === "zoom") {
    if (!args[1]) usage();
    out = f.zoomFor(
      footage(),
      args[0],
      args[1],
      args[2] === undefined ? undefined : number(args[2], "zoom"),
    );
  } else if (command === "move") {
    if (!args[1]) usage();
    out = f.moveFor(
      footage(),
      args[0],
      args[1],
      args[2] === undefined ? undefined : number(args[2], "zoom"),
    );
  } else if (command === "view") {
    // An overlay's `view` on a shot with a camera move: the shot is read from
    // the cut (written in step 4), so the value always matches its move.
    if (!args[0]) usage();
    const { viewParameter } = await import("../shared/templates/mix.ts");
    const cut = JSON.parse(readFileSync(args[0], "utf8"));
    const at = number(args[1], "shot startBeat");
    const shot = cut.shots?.find((s) => s.startBeat === at);
    if (!shot) throw new Error(`No shot starts on beat ${at} in ${args[0]}.`);
    out = {
      view: viewParameter(
        cut,
        shot,
        args[2] === undefined ? at : number(args[2], "layer startBeat"),
      ),
    };
  } else if (command === "beat")
    out = { beat: r3((number(args[0], "seconds") * BPM) / 60) };
  else if (command === "seconds")
    out = { seconds: r3((number(args[0], "beat") * 60) / BPM) };
  else usage();
  console.log(JSON.stringify(out, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
