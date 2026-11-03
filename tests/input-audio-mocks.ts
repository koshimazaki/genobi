import { vi } from "vitest";
import type { InputAudioEnvironment } from "../src/world-builder/input-audio";

export function inputAudioMocks() {
  const tracks = [{ stop: vi.fn() }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  const nodes: MockNode[] = [];
  class MockNode {
    type = "";
    gain = { value: 1 };
    frequency = { value: 0 };
    Q = { value: 0 };
    fftSize = 2048;
    connect = vi.fn((target: MockNode) => target);
    disconnect = vi.fn();
    getFloatTimeDomainData(samples: Float32Array) {
      samples.fill(0.25);
    }
    constructor() {
      nodes.push(this);
    }
  }
  class MockContext {
    static instances: MockContext[] = [];
    sampleRate = 48000;
    destination = new MockNode();
    resume = vi.fn(async () => {});
    close = vi.fn(async () => {});
    createMediaStreamSource = vi.fn(() => new MockNode());
    createAnalyser = vi.fn(() => new MockNode());
    createIIRFilter = vi.fn(() => new MockNode());
    createGain = vi.fn(() => new MockNode());
    createBiquadFilter = vi.fn(() => new MockNode());
    constructor() {
      MockContext.instances.push(this);
    }
  }
  class MockRecorder {
    static instances: MockRecorder[] = [];
    static isTypeSupported = vi.fn(() => true);
    mimeType = "audio/webm;codecs=opus";
    state: RecordingState = "inactive";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    onerror?: () => void;
    start = vi.fn(() => {
      this.state = "recording";
    });
    stop = vi.fn(() => {
      this.state = "inactive";
      this.onstop?.();
    });
    constructor() {
      MockRecorder.instances.push(this);
    }
  }
  const getUserMedia = vi.fn(async () => stream);
  const env: InputAudioEnvironment = {
    secure: true,
    devices: { getUserMedia },
    Context: MockContext as unknown as typeof AudioContext,
    Recorder: MockRecorder as unknown as typeof MediaRecorder,
  };
  return {
    env,
    getUserMedia,
    tracks,
    stream,
    nodes,
    MockContext,
    MockRecorder,
  };
}
