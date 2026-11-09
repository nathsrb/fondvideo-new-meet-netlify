/**
 * SCELYO ClearVoice — browser-native processing only.
 * The browser's echoCancellation/noiseSuppression is configured on capture.
 * This optional Web Audio chain further improves voice intelligibility;
 * it is NOT a speech-isolation model and cannot eliminate every noise.
 */
export type VoiceProfile = 'natural' | 'balanced' | 'strong';

export class ClearVoiceProcessor {
  readonly stream: MediaStream;
  private readonly context: AudioContext;
  private readonly input: MediaStreamAudioSourceNode;
  private readonly output: MediaStreamAudioDestinationNode;
  private readonly dry: GainNode;
  private readonly enhanced: GainNode;
  private readonly highPass: BiquadFilterNode;
  private readonly lowPass: BiquadFilterNode;
  private readonly presence: BiquadFilterNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly makeup: GainNode;
  private disposed = false;

  constructor(microphone: MediaStreamTrack, enhanced: boolean, profile: VoiceProfile) {
    if (microphone.kind !== 'audio' || microphone.readyState !== 'live') {
      throw new Error('Microphone inaccessible.');
    }
    this.context = new AudioContext();
    this.input = this.context.createMediaStreamSource(new MediaStream([microphone]));
    this.output = this.context.createMediaStreamDestination();
    this.dry = this.context.createGain();
    this.enhanced = this.context.createGain();
    this.highPass = this.context.createBiquadFilter();
    this.highPass.type = 'highpass';
    this.lowPass = this.context.createBiquadFilter();
    this.lowPass.type = 'lowpass';
    this.presence = this.context.createBiquadFilter();
    this.presence.type = 'peaking';
    this.presence.frequency.value = 2900;
    this.presence.Q.value = 0.85;
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.knee.value = 20;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.2;
    this.makeup = this.context.createGain();

    // Only one of the dry and enhanced paths has volume at steady state.
    this.input.connect(this.dry);
    this.dry.connect(this.output);
    this.input.connect(this.highPass);
    this.highPass.connect(this.lowPass);
    this.lowPass.connect(this.presence);
    this.presence.connect(this.compressor);
    this.compressor.connect(this.makeup);
    this.makeup.connect(this.enhanced);
    this.enhanced.connect(this.output);
    this.stream = this.output.stream;
    this.setProfile(profile);
    this.dry.gain.value = enhanced ? 0 : 1;
    this.enhanced.gain.value = enhanced ? 1 : 0;
  }

  get track(): MediaStreamTrack {
    return this.stream.getAudioTracks()[0];
  }

  async resume(): Promise<boolean> {
    if (this.disposed) return false;
    try {
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  setEnabled(enabled: boolean) {
    if (this.disposed) return;
    const t = this.context.currentTime;
    this.dry.gain.setTargetAtTime(enabled ? 0 : 1, t, 0.012);
    this.enhanced.gain.setTargetAtTime(enabled ? 1 : 0, t, 0.012);
  }

  setProfile(profile: VoiceProfile) {
    if (this.disposed) return;
    // Mild settings preserve natural speech and limit pumping/distortion.
    const settings = {
      natural:  { highPass: 70, lowPass: 10000, presence: 1.0, threshold: -18, ratio: 1.7, gain: 1.0 },
      balanced: { highPass: 90, lowPass: 8900, presence: 2.2, threshold: -22, ratio: 2.2, gain: 1.06 },
      strong:   { highPass: 110, lowPass: 8200, presence: 3.0, threshold: -26, ratio: 2.8, gain: 1.1 },
    }[profile];
    const t = this.context.currentTime;
    this.highPass.frequency.setTargetAtTime(settings.highPass, t, 0.02);
    this.lowPass.frequency.setTargetAtTime(settings.lowPass, t, 0.02);
    this.presence.gain.setTargetAtTime(settings.presence, t, 0.02);
    this.compressor.threshold.setTargetAtTime(settings.threshold, t, 0.02);
    this.compressor.ratio.setTargetAtTime(settings.ratio, t, 0.02);
    this.makeup.gain.setTargetAtTime(settings.gain, t, 0.02);
  }

  async destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.input.disconnect();
    this.dry.disconnect();
    this.highPass.disconnect();
    this.lowPass.disconnect();
    this.presence.disconnect();
    this.compressor.disconnect();
    this.makeup.disconnect();
    this.enhanced.disconnect();
    this.stream.getTracks().forEach(track => track.stop());
    await this.context.close().catch(() => {});
  }
}
