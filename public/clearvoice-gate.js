/* SCELYO ClearVoice: lightweight local noise gate (no external API).
 * Softly attenuates low-level background audio in pauses; does not
 * attempt to remove other speakers or loud overlapping sounds.
 * Runs on the audio rendering thread for stable live processing.
 */
class ScelyoClearVoiceGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate'}];
  }
  constructor() {
    super();
    this.level = 1;
    this.floor = 0.004;
    this.hold = 0;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;
    const frameSize = input[0].length;
    let power = 0;
    for (let i = 0; i < frameSize; i++) {
      const sample = input[0][i];
      power += sample * sample;
    }
    const rms = Math.sqrt(power / Math.max(1, frameSize));
    // Learn quiet, low-frequency background over time, with a conservative
    // ceiling so soft voices are not aggressively muted.
    if (rms < 0.045 || this.hold === 0) {
      this.floor += 0.009 * (Math.min(0.027, rms) - this.floor);
    }
    const threshold = Math.max(0.009, Math.min(0.031, this.floor * 1.8));
    if (rms >= threshold) this.hold = 48; // roughly 128 ms at 48 kHz
    else this.hold = Math.max(0, this.hold - 1);
    const enabled = parameters.enabled[0] >= 0.5;
    const target = !enabled || this.hold > 0 ? 1 : 0.32;
    const step = target > this.level ? 0.10 : 0.003;
    for (let i = 0; i < frameSize; i++) {
      this.level += (target - this.level) * step;
      for (let channel = 0; channel < output.length; channel++) {
        output[channel][i] = (input[channel] ? input[channel][i] : 0) * this.level;
      }
    }
    return true;
  }
}
registerProcessor('scelyo-clearvoice-gate', ScelyoClearVoiceGate);
