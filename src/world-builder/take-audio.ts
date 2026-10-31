import { audioWav, type AudioTrack } from "./audio";
import { hash, type Take } from "./export-take";

/**
 * Adds the loaded track to a fixed take as its WAV, cut to the take's length,
 * and names it in the receipt with its hash.
 */
export async function withAudioCompanion(
  take: Take,
  track: AudioTrack,
  frames: number,
) {
  take.audio = audioWav(track, frames / 24);
  const receipt = JSON.parse(await take.manifest.text());
  receipt.audioCompanion = {
    file: `${take.name}.wav`,
    sampleRate: track.sampleRate,
    sha256: await hash(take.audio),
    duration: frames / 24,
  };
  if (receipt.sceneEvaluation) {
    receipt.audioCompanion.role = "motion-control";
    receipt.sceneEvaluation.controlAudioSha256 = receipt.audioCompanion.sha256;
  }
  take.manifest = new Blob([JSON.stringify(receipt, null, 2)], {
    type: "application/json",
  });
}
