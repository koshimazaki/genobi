/**
 * A spoken "open the director" read without a model: the whole utterance
 * must be one opening verb ("open", "show", "go to"…) and one workspace
 * name, with only politeness around it. Anything more ("open a door in the
 * director scene", "show the camera move") is not navigation and returns
 * null, so it still reaches the agent or the Camera reading. Deterministic
 * and pure. Portable: no Node or DOM APIs.
 */

export interface VoiceWorkspace<Id extends string = string> {
  id: Id;
  /** Every name the workspace answers to, as said ("3d", "world builder"). */
  names: readonly string[];
}

/** Openings that carry no meaning, before the verb. */
const LEAD =
  "(?:(?:hey |ok |okay )?genobi |ok |okay |please |now |(?:can|could|would) you (?:please )?)*";
const VERB =
  "(?:open(?: up)?|show(?: me)?|go(?: back)? to|switch to|take me to|bring up|jump to)";
const NOUN = "(?: (?:workspace|page|tab|view|mode|panel|screen|preset))?";
const TAIL = "(?: please| now)*";

/** Lower case, punctuation as spaces, spaces collapsed. */
export function spoken(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The workspace these words ask to open, or null. */
export function voiceNavigation<Id extends string>(
  words: string,
  workspaces: readonly VoiceWorkspace<Id>[],
): Id | null {
  const said = spoken(words);
  // A long note is a request, never a "go to".
  if (!said || said.length > 80) return null;
  for (const workspace of workspaces) {
    const names = workspace.names.map((n) => escape(spoken(n))).filter(Boolean);
    if (!names.length) continue;
    const pattern = new RegExp(
      `^${LEAD}${VERB} (?:the )?(?:${names.join("|")})${NOUN}${TAIL}$`,
    );
    if (pattern.test(said)) return workspace.id;
  }
  return null;
}
