import DeploymentWorkspace from "./DeploymentWorkspace";
import { isDeployModel } from "../../shared/comfy/deploy-catalogue";
import { isSeedvr2 } from "../../shared/comfy/seedvr2";
import { isImage } from "../../shared/image";
import { takesVideoReferences } from "../../shared/h3";
import { isVideoSource, type Source } from "../../shared/types";
import {
  splitOffer,
  UPSCALE_MAX_SECONDS,
  UPSCALE_SPLIT_MAX_SECONDS,
} from "../../shared/upscale-parts";
import { useSettingsStore } from "../settings-store";
import { useHostedStudio } from "../hosted-studio";
import { composerInput } from "../useComposer";
import type { ComposerState } from "../useComposer";
import type { ImageReferences } from "../useImageReferences";
import ImageWorkspace from "./ImageWorkspace";
import VideoWorkspace from "./VideoWorkspace";
import PromptInput from "./PromptInput";
import SourceInput from "./SourceInput";
import UpscaleSplit from "./UpscaleSplit";
import MusicWorkspace from "./MusicWorkspace";

/** Each generator's inputs, within the same reserved composer footprint. */
export default function ComposerWorkspace(props: {
  state: ComposerState;
  update: (patch: Partial<ComposerState>) => void;
  images: ImageReferences;
  sources: Source[];
  sourceId: string;
  apiKey: string;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
  onOpenCamera: () => void;
  onOpenAcoustic: () => void;
}) {
  const { state, update } = props;
  const sources = props.sources.filter(isVideoSource);
  const hosted = useHostedStudio();
  const picked = sources.find((source) => source.id === props.sourceId);
  const location = useSettingsStore((settings) => settings.location);
  const offer = picked && splitOffer(picked, state.model, location);
  if (isDeployModel(state.model)) return <DeploymentWorkspace {...props} />;
  if (isImage(state.generator)) return <ImageWorkspace {...props} />;
  if (state.generator === "audio")
    return <MusicWorkspace state={state} update={update} />;
  if (state.generator === "video") {
    if (takesVideoReferences(state.model))
      return <VideoWorkspace {...props} sources={sources} />;
    return (
      <PromptInput
        {...state}
        onChange={(description) => update({ description })}
        onSlotsChange={(slots) => update({ slots })}
        onOpenCamera={props.onOpenCamera}
        onOpenAcoustic={props.onOpenAcoustic}
      />
    );
  }
  return (
    <SourceInput
      {...props}
      maxSeconds={hosted ? UPSCALE_MAX_SECONDS : UPSCALE_SPLIT_MAX_SECONDS}
      splitOffer={
        offer && picked && !hosted ? (
          <UpscaleSplit
            input={composerInput(state)}
            source={picked}
            optional={offer === "optional"}
            apiKey={props.apiKey}
            refresh={props.refresh}
          />
        ) : undefined
      }
      sources={sources}
      prompt={state.upscalePrompt}
      factor={state.upscaleFactor}
      seedvr2={isSeedvr2(state.model)}
      onPromptChange={(upscalePrompt) => update({ upscalePrompt })}
      onSelect={(sourceId) => update({ sourceId })}
    />
  );
}
