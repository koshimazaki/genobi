import { describe, expect, it } from "vitest";
import { buildAcousticSchedule } from "../src/world-builder/acoustic-schedule";
import { hash } from "../src/world-builder/export-take";
import { sceneDigest } from "../src/world-builder/scene-capture";
import {
  roomSoundReceipt,
  roomSourcePcmHash,
  roomTestImpulses,
} from "../src/world-builder/room-sound-receipt";
import {
  shortRoomRecipe,
  renderedRoomFixture,
} from "./world-room-sound-fixture";

describe("room sound export provenance", () => {
  it("binds the frozen scene, dry source, exact PCM and output while preserving the audio roles", async () => {
    const recipe = shortRoomRecipe();
    const generated = roomTestImpulses(recipe);
    const source = {
      ...generated,
      label: "Test impulses",
      origin: "test-impulses" as const,
      sha256: await hash(generated.blob),
    };
    const result = renderedRoomFixture(
      source.track,
      buildAcousticSchedule(recipe),
    );
    const receipt = await roomSoundReceipt(recipe, source, result);
    expect(receipt.sceneEvaluation?.recipeSha256).toBe(
      await sceneDigest(recipe),
    );
    expect(receipt.source.sha256).toBe(await hash(source.blob));
    expect(receipt.source.pcmSha256).toBe(
      await roomSourcePcmHash(source.track, recipe.frames / recipe.fps),
    );
    expect(receipt.output.sha256).toBe(await hash(result.wav));
    expect(receipt.roles.wetOutputDrivesMotion).toBe(false);
    expect(receipt.roles.soundtrack).toBe("independent-editor-track");
    expect(receipt.mix).toMatchObject({
      tailPolicy: "trim-fade",
      trimFadeSeconds: 0.05,
    });
    recipe.motion!.stateKeys[0].room!.dimensions[0] = 22;
    result.schedule.snapshots[0].room!.dimensions[0] = 23;
    result.irs[0].rt60 = 20;
    expect(receipt.recipe.motion!.stateKeys[0].room!.dimensions[0]).not.toBe(
      22,
    );
    expect(receipt.schedule.snapshots[0].room!.dimensions[0]).not.toBe(23);
    expect(receipt.impulseResponses[0].rt60).toBe(0.7);
  });
  it("hashes the actual fitted PCM, including channel order, rate and changed samples", async () => {
    const samples = new Float32Array([0.1, 0.2, 0.3]);
    const track = { channels: [samples], sampleRate: 8000, envelope: [] };
    const before = await roomSourcePcmHash(track, 0.01);
    expect(
      await roomSourcePcmHash(
        { ...track, channels: [new Float32Array([...samples, 0, 0])] },
        0.01,
      ),
    ).toBe(before);
    expect(
      await roomSourcePcmHash({ ...track, sampleRate: 16000 }, 0.01),
    ).not.toBe(before);
    samples[1] = 0.25;
    expect(await roomSourcePcmHash(track, 0.01)).not.toBe(before);
    const a = await roomSourcePcmHash(
      { ...track, channels: [samples, new Float32Array(3)] },
      0.01,
    );
    const b = await roomSourcePcmHash(
      { ...track, channels: [new Float32Array(3), samples] },
      0.01,
    );
    expect(a).not.toBe(b);
  });
  it("creates repeatable independent probes with energy near the final picture frame", async () => {
    const a = roomTestImpulses(shortRoomRecipe()),
      b = roomTestImpulses(shortRoomRecipe());
    expect(a.track.channels[0]).toEqual(b.track.channels[0]);
    expect(await hash(a.blob)).toBe(await hash(b.blob));
    expect(a.track.envelope).toEqual([]);
    expect(
      a.track.channels[0]
        .slice(-1200)
        .some((sample) => Math.abs(sample) > 0.01),
    ).toBe(true);
  });
});
