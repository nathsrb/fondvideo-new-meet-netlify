/**
 * SCELYO Live — voice-first music mix.
 * The microphone is the primary track. Background music is mixed beneath it
 * and automatically ducks during speech. Everything stays on this device,
 * only the resulting audio stream is transmitted via WebRTC.
 */
export type MusicProgress = {
  playing: boolean;
  currentTime: number;
  duration: number;
};

export class MeetingMusicMixer {
  readonly mixedStream: MediaStream;
  readonly musicOnlyStream: MediaStream;
  readonly audio: HTMLAudioElement;
  private readonly context: AudioContext;
  private readonly musicGain: GainNode;
  private readonly duckGain: GainNode;
  private readonly speechGain: GainNode;
  private readonly monitorGain: GainNode;
  private readonly source: MediaElementAudioSourceNode;
  private readonly microphoneSource: MediaStreamAudioSourceNode;
  private readonly analyser: AnalyserNode;
  private readonly silence: GainNode;
  private readonly mixBus: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly output: MediaStreamAudioDestinationNode;
  private readonly musicOnlyOutput: MediaStreamAudioDestinationNode;
  private readonly blobUrl: string;
  private readonly onProgress: (progress: MusicProgress) => void;
  private readonly voiceSamples: Float32Array<ArrayBuffer>;
  private readonly duckTimer: ReturnType<typeof setInterval>;
  private disposed = false;
  private lastSpeechAt = 0;
  private voicePriority = true;

  constructor(file: File, microphoneStream: MediaStream, onProgress: (progress: MusicProgress) => void) {
    const microphone = microphoneStream.getAudioTracks()[0];
    if (!microphone || microphone.readyState !== 'live') {
      throw new Error('Autorise le microphone pour diffuser de la musique dans la session.');
    }
    const context = new AudioContext();
    this.context = context;
    this.blobUrl = URL.createObjectURL(file);
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.src = this.blobUrl;
    this.audio.loop = false;
    this.onProgress = onProgress;

    this.output = context.createMediaStreamDestination();
    this.musicOnlyOutput = context.createMediaStreamDestination();
    this.musicGain = context.createGain();
    this.musicGain.gain.value = 0.35;
    this.duckGain = context.createGain();
    this.duckGain.gain.value = 0.55;
    this.speechGain = context.createGain();
    this.speechGain.gain.value = 0.96;
    this.monitorGain = context.createGain();
    this.monitorGain.gain.value = 0;
    this.mixBus = context.createGain();
    this.mixBus.gain.value = 0.96;
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -9;
    this.limiter.knee.value = 2;
    this.limiter.ratio.value = 7;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.14;
    this.source = context.createMediaElementSource(this.audio);
    this.microphoneSource = context.createMediaStreamSource(new MediaStream([microphone]));
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 512;
    this.voiceSamples = new Float32Array(512);
    this.silence = context.createGain();
    this.silence.gain.value = 0;

    // One pass through the voice processor: microphone always has priority.
    // The music-only stream is separate so local recordings never double the mic.
    this.microphoneSource.connect(this.speechGain);
    this.speechGain.connect(this.mixBus);
    this.speechGain.connect(this.analyser);
    this.analyser.connect(this.silence);
    this.silence.connect(this.mixBus);
    this.source.connect(this.musicGain);
    this.musicGain.connect(this.duckGain);
    this.duckGain.connect(this.mixBus);
    this.duckGain.connect(this.musicOnlyOutput);
    this.duckGain.connect(this.monitorGain);
    this.monitorGain.connect(context.destination);
    this.mixBus.connect(this.limiter);
    this.limiter.connect(this.output);
    this.mixedStream = this.output.stream;
    this.musicOnlyStream = this.musicOnlyOutput.stream;

    this.duckTimer = setInterval(() => this.updateDucking(), 90);
    this.audio.onended = () => this.notify();
    this.audio.onpause = () => this.notify();
    this.audio.onplay = () => this.notify();
    this.audio.onloadedmetadata = () => this.notify();
    this.audio.ontimeupdate = () => this.notify();
  }

  private updateDucking() {
    if (this.disposed) return;
    this.analyser.getFloatTimeDomainData(this.voiceSamples);
    let power = 0;
    for (const sample of this.voiceSamples) power += sample * sample;
    const rms = Math.sqrt(power / this.voiceSamples.length);
    const now = performance.now();
    if (rms > 0.018) this.lastSpeechAt = now;
    const speaking = rms > 0.012 || now - this.lastSpeechAt < 430;
    // Voice first: music at ~35% of the slider level while speaking.
    const target = this.voicePriority && speaking ? 0.34 : 1;
    this.duckGain.gain.setTargetAtTime(
      target, this.context.currentTime, target < this.duckGain.gain.value ? 0.035 : 0.22
    );
  }

  private notify() {
    if (this.disposed) return;
    this.onProgress({
      playing: !this.audio.paused && !this.audio.ended,
      currentTime: Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0,
      duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0,
    });
  }

  get track(): MediaStreamTrack { return this.mixedStream.getAudioTracks()[0]; }

  setVolume(level: number) {
    this.musicGain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, level / 100)),
      this.context.currentTime,
      0.04
    );
  }

  setVoicePriority(enabled: boolean) { this.voicePriority = enabled; }

  setLoop(enabled: boolean) { this.audio.loop = enabled; }

  setMonitor(enabled: boolean) {
    this.monitorGain.gain.setTargetAtTime(enabled ? 0.5 : 0, this.context.currentTime, 0.025);
  }

  async play() {
    if (this.disposed) throw new Error('Lecteur fermé.');
    const resumed = this.context.resume();
    const played = this.audio.play();
    await Promise.all([resumed, played]);
    this.notify();
  }

  pause() { this.audio.pause(); this.notify(); }

  seek(value: number) {
    if (!Number.isFinite(this.audio.duration)) return;
    this.audio.currentTime = Math.max(0, Math.min(value, this.audio.duration));
    this.notify();
  }

  async destroy() {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.duckTimer);
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.audio.onended = null;
    this.audio.onpause = null;
    this.audio.onplay = null;
    this.audio.onloadedmetadata = null;
    this.audio.ontimeupdate = null;
    this.source.disconnect();
    this.musicGain.disconnect();
    this.duckGain.disconnect();
    this.speechGain.disconnect();
    this.monitorGain.disconnect();
    this.microphoneSource.disconnect();
    this.analyser.disconnect();
    this.silence.disconnect();
    this.mixBus.disconnect();
    this.limiter.disconnect();
    this.output.stream.getTracks().forEach(track => track.stop());
    this.musicOnlyOutput.stream.getTracks().forEach(track => track.stop());
    URL.revokeObjectURL(this.blobUrl);
    await this.context.close().catch(() => {});
  }
}
