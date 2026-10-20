import { SynthEngine } from './tcko2-engine.js';
import { PcmTakeCapture } from './tcko2-recording.js';

class SingleLayerSynth extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = new SynthEngine(sampleRate, 4);
    this.engine.control('flow', false);
    this.engine.control('drone', false);
    this.engine.control('master', .55);
    this.port.onmessage = ({ data }) => {
      if (data.type === 'on') this.engine.noteOn(data.note, 100, 16);
      if (data.type === 'off') this.engine.noteOff(data.note, 16);
      if (data.type === 'panic') this.engine.panic();
      if (data.type === 'preset') {
        this.engine.setPatch(data.index, false);
        this.engine.control('drone', false);
        this.engine.control('flow', false);
        this.engine.control('hold', false);
      }
    };
  }
  process(inputs, outputs) {
    const [left, right] = outputs[0];
    if (left && right) this.engine.render(left, right);
    return true;
  }
}

class MixCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capture = new PcmTakeCapture(sampleRate, (message, transfers) => this.port.postMessage(message, transfers || []));
    this.port.onmessage = ({ data }) => {
      if (data.type === 'start') this.capture.start(data.id, Math.min(sampleRate * 180, 12000000));
      if (data.type === 'stop') this.capture.stop(data.reason || 'user');
    };
  }
  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    for (let c = 0; c < output.length; c++) {
      if (input[c] || input[0]) output[c].set(input[c] || input[0]);
      else output[c].fill(0);
    }
    if (output[0] && output[1]) this.capture.append(output[0], output[1]);
    return true;
  }
}
registerProcessor('studio-synth', SingleLayerSynth);
registerProcessor('studio-capture', MixCapture);
