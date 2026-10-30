/**
 * A live AnalyserNode on the World Builder's <audio> element, for the Sound
 * panel's scopes. A media element can feed only one MediaElementSource ever,
 * and once it does its sound goes through that context, so the graph is made
 * once per element and only when the context is actually running: a context
 * the browser keeps suspended would silence the track, so the scopes then
 * fall back to the precomputed envelopes instead. The take never reads this;
 * capture uses the decoded track.
 */
export interface LiveGraph {
  context: AudioContext;
  analyser: AnalyserNode;
  freq: Uint8Array<ArrayBuffer>;
  time: Uint8Array<ArrayBuffer>;
}

const graphs = new WeakMap<HTMLMediaElement, LiveGraph>();

/** Resume a context, giving up after `ms`: a refused resume can stay pending. */
async function resumed(context: AudioContext, ms = 400) {
  if (context.state === "running") return true;
  await Promise.race([
    context.resume().catch(() => {}),
    new Promise((done) => setTimeout(done, ms)),
  ]);
  // Re-read: the resume above may have changed it.
  return (context.state as AudioContextState) === "running";
}

/** The element's analyser, made on first use; null while audio cannot run. */
export async function liveAnalyser(
  audio: HTMLMediaElement,
  make: () => AudioContext = () => new AudioContext(),
): Promise<LiveGraph | null> {
  const known = graphs.get(audio);
  if (known) return (await resumed(known.context)) ? known : null;
  let context: AudioContext;
  try {
    context = make();
  } catch {
    return null;
  }
  if (!(await resumed(context)) || graphs.has(audio)) {
    void context.close().catch(() => {});
    return graphs.get(audio) ?? null;
  }
  try {
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    context.createMediaElementSource(audio).connect(analyser);
    analyser.connect(context.destination);
    const graph: LiveGraph = {
      context,
      analyser,
      freq: new Uint8Array(analyser.frequencyBinCount),
      time: new Uint8Array(analyser.fftSize),
    };
    graphs.set(audio, graph);
    return graph;
  } catch {
    void context.close().catch(() => {});
    return null;
  }
}

/** Read the analyser into its buffers; false when the element is not sounding. */
export function readGraph(graph: LiveGraph | null, audio: HTMLMediaElement) {
  if (!graph || audio.paused || graph.context.state !== "running") return false;
  graph.analyser.getByteFrequencyData(graph.freq);
  graph.analyser.getByteTimeDomainData(graph.time);
  return true;
}
