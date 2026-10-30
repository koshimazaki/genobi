// Verifies a Genobi teaser run: the cut's structure, layer cap and length,
// cuts on the analysed beats, the claim rules, readable holds, assets, the
// run's memory.json, and how close it is to a reference cut. Prints plain
// English with a fix for every failure; exits 1 on any failure, 64 on a
// usage error. Nothing is generated or paid for; it reads files only.
//
//   node scripts/verify-teaser-run.mjs <run-folder | cut.json>
//     [--reference v1 | current | <run-folder | cut.json>]
//     [--min-similarity 0.95] [--allow-new-wording] [--require-render]
//     [--tolerance 0.05] [--json]
// See docs/genobi-teaser-run/README.md and the genobi-teaser-run skill.
import { register } from "tsx/esm/api";

const USAGE =
  "Usage: node scripts/verify-teaser-run.mjs <run-folder | cut.json> [--reference v1|current|<path>] [--min-similarity 0-1] [--allow-new-wording] [--require-render] [--tolerance seconds] [--json]";

function parse(argv) {
  const options = {};
  let target = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--"))
        throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === "--reference") options.reference = value();
    else if (arg === "--min-similarity") {
      options.minSimilarity = Number(value());
      if (!(options.minSimilarity >= 0 && options.minSimilarity <= 1))
        throw new Error("--min-similarity is a number from 0 to 1");
    } else if (arg === "--tolerance") {
      options.toleranceSeconds = Number(value());
      if (!(options.toleranceSeconds > 0 && options.toleranceSeconds <= 0.5))
        throw new Error("--tolerance is seconds, above 0 and at most 0.5");
    } else if (arg === "--allow-new-wording") options.allowNewWording = true;
    else if (arg === "--require-render") options.requireRender = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else if (target) throw new Error("Give one run folder or cut file");
    else target = arg;
  }
  if (options.minSimilarity !== undefined && !options.reference)
    throw new Error("--min-similarity requires --reference");
  return { target, options };
}

let parsed;
try {
  parsed = parse(process.argv.slice(2));
} catch (error) {
  console.error(`${error.message}\n${USAGE}`);
  process.exit(64);
}
if (parsed.options.help || !parsed.target) {
  console.error(USAGE);
  process.exit(parsed.options.help ? 0 : 64);
}

register();
const { verify } = await import("./lib/teaser-run/verify.ts");
try {
  const result = verify(parsed.target, parsed.options);
  if (parsed.options.json)
    console.log(
      JSON.stringify(
        {
          pass: result.exitCode === 0,
          findings: result.findings,
          similarity: result.similarity,
        },
        null,
        2,
      ),
    );
  else console.log(result.text);
  process.exit(result.exitCode);
} catch (error) {
  console.error(`Cannot verify: ${error.message}`);
  process.exit(1);
}
