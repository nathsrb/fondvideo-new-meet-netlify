/**
 * SCELYO Studio: offline speech-focused audio finishing.
 * Processes decoded PCM for local export, no network or subscription.
 * Soft gating is intentionally mild to preserve quiet syllables; it is
 * not a source separation / neural voice isolation engine.
 */
import { AudioSample } from 'mediabunny';

export type StudioVoiceProfile = 'natural' | 'balanced' | 'strong';
export type StudioAudioOptions = {
  noiseReduction: boolean;
  enhanceVoice: boolean;
  profile: StudioVoiceProfile;
};

export function createStudioAudioProcessor(options: StudioAudioOptions) {
  const profiles = {
    natural: { highPassHz: 65, presence: 0.04, threshold: 0.24, ratio: 0.27, makeup: 1.0 },
    balanced: { highPassHz: 80, presence: 0.09, threshold: 0.18, ratio: 0.36, makeup: 1.03 },
    strong: { highPassHz: 105, presence: 0.13, threshold: 0.15, ratio: 0.47, makeup: 1.06 },
  } as const;
  const profile = profiles[options.profile];
  const states: Array<{ prev: number; hp: number; avg: number; envelope: number; gate: number }> = [];

  return (sample: AudioSample): AudioSample => {
    const n = sample.numberOfFrames;
    const channels = sample.numberOfChannels;
    const rate = sample.sampleRate;
    const alpha = Math.exp(-2 * Math.PI * profile.highPassHz / rate);
    const out = new Float32Array(n * channels);
    for (let ch = 0; ch < channels; ch++) {
      const plane = new Float32Array(n);
      sample.copyTo(plane, { planeIndex: ch, format: 'f32-planar' });
      const state = states[ch] || { prev: 0, hp: 0, avg: 0, envelope: 0, gate: 1 };
      states[ch] = state;
      for (let i=0;i<n;i++) {
        const input = plane[i];
        let value = input;
        if (options.enhanceVoice) {
          state.hp = alpha * (state.hp + input - state.prev);
          state.prev = input;
          value = state.hp;
          state.avg += (value - state.avg) * 0.06;
          value += (value - state.avg) * profile.presence;
          state.envelope += (Math.abs(value) - state.envelope) *
            (Math.abs(value) > state.envelope ? 0.012 : 0.0009);
          const excess = Math.max(0, state.envelope - profile.threshold);
          const gain = excess > 0 ? 1 / (1 + excess * profile.ratio * 5) : 1;
          value *= gain * profile.makeup;
        }
        if (options.noiseReduction) {
          const activity = Math.abs(value);
          const threshold = 0.0032;
          // Tiny soft gate: background reduces gently rather than cutting
          // starts/ends of words as a hard gate would do.
          const desired = activity > threshold ? 1 : 0.80;
          state.gate += (desired - state.gate) * (desired > state.gate ? 0.06 : 0.0003);
          value *= state.gate;
        }
        // Conservative soft peak protection: avoid hard PCM clipping.
        value = value / (1 + Math.max(0, Math.abs(value) - 0.78) * 1.7);
        out[ch*n+i] = Math.max(-1,Math.min(1,value));
      }
    }
    return new AudioSample({
      data: out,
      format: 'f32-planar',
      numberOfChannels: channels,
      sampleRate: rate,
      timestamp: sample.timestamp,
    });
  };
}
