/**
 * SCELYO Live: share a local music file by mixing it with the outgoing
 * microphone track. The source file never leaves the device; only the
 * WebRTC-encoded audio is transmitted to participants.
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
  private readonly monitorGain: GainNode;
  private readonly source: MediaElementAudioSourceNode;
  private readonly microphoneSource: MediaStreamAudioSourceNode;
  private readonly output: MediaStreamAudioDestinationNode;
  private readonly musicOnlyOutput: MediaStreamAudioDestinationNode;
  private readonly blobUrl: string;
  private readonly onProgress: (progress: MusicProgress) => void;
  private disposed = false;

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
    this.monitorGain = context.createGain();
    this.monitorGain.gain.value = 0;
    this.source = context.createMediaElementSource(this.audio);
    this.microphoneSource = context.createMediaStreamSource(new MediaStream([microphone]));

    // Separate paths: music + mic for guests, music alone for recordings.
    // No local speaker output unless the user explicitly enables monitoring.
    this.microphoneSource.connect(this.output);
    this.source.connect(this.musicGain);
    this.musicGain.connect(this.output);
    this.musicGain.connect(this.musicOnlyOutput);
    this.musicGain.connect(this.monitorGain);
    this.monitorGain.connect(context.destination);

    this.mixedStream = this.output.stream;
    this.musicOnlyStream = this.musicOnlyOutput.stream;
    this.audio.onended = () => this.notify();
    this.audio.onpause = () => this.notify();
    this.audio.onplay = () => this.notify();
    this.audio.onloadedmetadata = () => this.notify();
    this.audio.ontimeupdate = () => this.notify();
  }

  private notify() {
    if (this.disposed) return;
    this.onProgress({
      playing: !this.audio.paused && !this.audio.ended,
      currentTime: Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0,
      duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0,
    });
  }

  get track(): MediaStreamTrack {
    return this.mixedStream.getAudioTracks()[0];
  }

  setVolume(level: number) {
    this.musicGain.gain.setTargetAtTime(Math.max(0, Math.min(1, level / 100)), this.context.currentTime, 0.025);
  }

  setLoop(enabled: boolean) {
    this.audio.loop = enabled;
  }

  setMonitor(enabled: boolean) {
    this.monitorGain.gain.setTargetAtTime(enabled ? 0.5 : 0, this.context.currentTime, 0.025);
  }

  async play() {
    if (this.disposed) throw new Error('Lecteur fermé.');
    // Start both while the iPhone user gesture is active; awaiting resume
    // before calling play() can lose Safari's playback permission.
    const resumed = this.context.resume();
    const played = this.audio.play();
    await Promise.all([resumed, played]);
    this.notify();
  }

  pause() {
    this.audio.pause();
    this.notify();
  }

  seek(value: number) {
    if (!Number.isFinite(this.audio.duration)) return;
    this.audio.currentTime = Math.max(0, Math.min(value, this.audio.duration));
    this.notify();
  }

  async destroy() {
    if (this.disposed) return;
    this.disposed = true;
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
    this.monitorGain.disconnect();
    this.microphoneSource.disconnect();
    this.output.stream.getTracks().forEach(track => track.stop());
    this.musicOnlyOutput.stream.getTracks().forEach(track => track.stop());
    URL.revokeObjectURL(this.blobUrl);
    await this.context.close().catch(() => {});
  }
}
