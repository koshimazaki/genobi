import { useEffect, useRef, useState } from "react";
import type { HouseTemplate } from "../../shared/templates/types";
import { versionSlots } from "../../shared/templates/version";
import {
  hasVersionAgent,
  WITH_WHAT_MAX,
  type VersionAgentAsset,
} from "../../shared/templates/version-agent";
import { replacesWork } from "../template-gallery/template-actions";
import { studioStore } from "../studio/store";
import type { Bundle } from "./bundle";
import { MediaDropZone } from "./MediaDropZone";
import { useAgentSend } from "./useAgentSend";
import VoiceButton from "../voice/VoiceButton";
import {
  setVoiceDestination,
  voiceRouting,
  type VoiceDestination,
} from "../voice/destination-store";
import {
  takeDictated,
  VERSION_PROMPT_ID,
} from "../voice/version-prompt-target";
import {
  AGENT_CANCELLED,
  AGENT_NO_COPY,
  AGENT_SETUP_HINT,
  agentAccept,
  agentKinds,
  agentQuestion,
  importAgentFile,
  kindWords,
  startVersionAgent,
} from "./version-agent";

/**
 * Make it with the agent: one optional reference drop zone and one "With
 * what?" sentence, typed or spoken, for a
 * mix template whose skill ships in the Genobi plugin. The sentence alone,
 * or with a reference, starts an agent session on the project (`voice` when
 * it was dictated); the agent quotes every paid step and this
 * section never starts a paid job. Without a runner set up, the button stays
 * live as the gallery's Generate now does: the spawn dialog walks the person
 * through choosing and signing one in. The sentence is a voice destination
 * ("Version · with what"); the panel is modal, so the header mic is out of
 * reach and the same VoiceButton sits beside the field, aimed at it.
 */
export default function VersionAgentSection({
  template,
  draft,
  setDraft,
  commit,
  run,
  disabled,
  started,
  cancelled,
}: {
  template: HouseTemplate;
  draft: Bundle;
  setDraft: (next: Bundle) => void;
  /** The panel's guarded commit of a draft, as Apply swaps uses it. */
  commit: (next: Bundle) => unknown;
  /** The panel's one-at-a-time action, which shows a refusal. */
  run: (action: () => Promise<void>) => Promise<void>;
  disabled: boolean;
  started: () => void;
  cancelled: (text: string) => void;
}) {
  const [asset, setAsset] = useState<VersionAgentAsset>();
  const [withWhat, setWithWhat] = useState("");
  const [dictated, setDictated] = useState(false);
  const agent = useAgentSend();
  // The mic beside the field aims at it; the person's own routing comes back
  // when the panel closes, unless they chose another destination since.
  const before = useRef<VoiceDestination | undefined>(undefined);
  useEffect(
    () => () => {
      if (
        before.current &&
        voiceRouting().destination === `prompt:${VERSION_PROMPT_ID}`
      )
        setVoiceDestination(before.current);
    },
    [],
  );
  const aim = () => {
    const current = voiceRouting().destination;
    if (current === `prompt:${VERSION_PROMPT_ID}`) return;
    before.current = current;
    setVoiceDestination(`prompt:${VERSION_PROMPT_ID}`);
  };
  if (!hasVersionAgent(template)) return null;
  const kinds = agentKinds(versionSlots(template));
  if (!kinds.length) return null;
  const noCopy = agent.copy === false;
  const ready = !!withWhat.trim() && !noCopy;
  const go = () =>
    run(async () => {
      const director = studioStore.getState().director;
      if (
        replacesWork(director, template.id, agent.working) &&
        !window.confirm(agentQuestion(template.name))
      )
        return;
      const session = await startVersionAgent({
        template,
        draft,
        asset,
        withWhat,
        source: dictated ? "voice" : "typed",
        commit,
      });
      if (session) started();
      else cancelled(AGENT_CANCELLED);
    });
  return (
    <section className="dir-version-agent" aria-label="Make it with the agent">
      <h3>Make it with the agent</h3>
      <p>
        Drop {kindWords(kinds)} as your reference and say what it replaces. The
        agent loads this template&apos;s skill, plans the swap and quotes every
        paid step for you to approve; nothing is paid from here.
      </p>
      <div className="dir-version-agent-fields">
        <MediaDropZone
          label={asset ? `Yours · ${asset.name}` : "Your reference (optional)"}
          hint={`Drop ${kindWords(kinds)}`}
          accept={agentAccept(kinds)}
          compact
          disabled={disabled || noCopy}
          onFiles={async ([file]) => {
            const imported = await importAgentFile(draft, kinds, file);
            setDraft(imported.bundle);
            setAsset(imported.asset);
          }}
        />
        <label>
          With what?
          <textarea
            id={VERSION_PROMPT_ID}
            value={withWhat}
            maxLength={WITH_WHAT_MAX}
            placeholder="Swap the apple with this"
            disabled={disabled || noCopy}
            onChange={(e) => {
              const voiced = takeDictated(e.currentTarget);
              setWithWhat(e.target.value);
              // Dictated words stay a spoken request through small fixes;
              // clearing the field makes the next words count afresh.
              setDictated((was) => !!e.target.value.trim() && (voiced || was));
            }}
          />
          <small>
            Your reference steers the look; this sentence says what it replaces.
          </small>
        </label>
      </div>
      <div className="dir-version-agent-actions">
        {!noCopy && (
          <div className="dir-version-agent-mic" onClickCapture={aim}>
            <VoiceButton />
          </div>
        )}
        <button
          type="button"
          className="dir-primary"
          disabled={disabled || !ready}
          title={agent.label.runner}
          onClick={() => void go()}
        >
          Make it with the agent
        </button>
        {noCopy ? (
          <small role="status">{AGENT_NO_COPY}</small>
        ) : (
          agent.label.hint && <small>{AGENT_SETUP_HINT}</small>
        )}
      </div>
    </section>
  );
}
