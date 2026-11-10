/* SCELYO ClearVoice: local adaptive background noise attenuation.
 * Not a neural source-separation model: reduces steady quiet sounds mostly
 * between phrases, while the browser's built-in suppression handles overlap.
 * Gain telemetry reflects what this AudioWorklet really does.
 */
class ScelyoClearVoiceGate extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'strength', defaultValue: 2, minValue: 1, maxValue: 3, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.gain = 1;
    this.floor = 0.003;
    this.hold = 0;
    this.frames = 0;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.[0] || !output?.[0]) return true;
    const size = input[0].length;
    let energy = 0;
    let peak = 0;
    for (let i = 0; i < size; i++) {
      const sample = input[0][i];
      energy += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    const rms = Math.sqrt(energy / Math.max(1, size));
    // Quiet-background estimator; speech bursts barely move this baseline.
    const quiet = rms < Math.max(0.009, this.floor * 1.7);
    const floorRate = quiet ? 0.015 : 0.0002;
    this.floor += (Math.min(0.022, rms) - this.floor) * floorRate;
    const threshold = Math.max(0.007, Math.min(0.036, this.floor * 2.0));
    if (rms > threshold || peak > threshold * 3.2) this.hold = 95;
    else this.hold = Math.max(0, this.hold - 1);

    const enabled = parameters.enabled[0] >= 0.5;
    const strength = Math.round(parameters.strength[0]);
    const minimumGain = strength === 3 ? 0.10 : strength === 1 ? 0.42 : 0.19;
    const target = !enabled || this.hold > 0 ? 1 : minimumGain;
    const coefficient = target > this.gain ? 0.085 : 0.0019;
    for (let i = 0; i < size; i++) {
      this.gain += (target - this.gain) * coefficient;
      for (let channel = 0; channel < output.length; channel++) {
        output[channel][i] = (input[channel] ? input[channel][i] : 0) * this.gain;
      }
    }
    if (++this.frames >= 72) {
      this.frames = 0;
      const attenuationDb = enabled ? Math.max(0, -20 * Math.log10(Math.max(0.001, this.gain))) : 0;
      this.port.postMessage({
        type: 'noise-stats',
        attenuationDb: Math.round(attenuationDb),
        isReducing: enabled && attenuationDb > 4,
        inputRms: rms,
      });
    }
    return true;
  }
}
registerProcessor('scelyo-clearvoice-gate', ScelyoClearVoiceGate);
