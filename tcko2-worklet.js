import { SynthEngine } from './tcko2-engine.js';
import { PcmTakeCapture } from './tcko2-recording.js';

class TCKO2Processor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.synth = new SynthEngine(sampleRate, options.processorOptions?.voiceLimit ?? 8);
    this.blocks = 0;
    this.recorder = new PcmTakeCapture(sampleRate, (message, transfer) => this.port.postMessage(message, transfer || []));
    this.port.onmessage = ({ data }) => {
      switch (data.type) {
        case 'recordStart': this.recorder.start(data.id, data.maximumFrames); break;
        case 'recordStop': if (this.recorder.take?.id === data.id) this.recorder.stop(data.reason); break;
        case 'noteOn': this.synth.noteOn(data.note, data.velocity, data.channel); break;
        case 'noteOff': this.synth.noteOff(data.note, data.channel); break;
        case 'release': this.synth.releaseKeys(data.channel); break;
        case 'midi': this.synth.midi(...data.data); break;
        case 'preset': this.synth.setPatch(data.index); break;
        case 'macro': this.synth.set(data.index, data.value); break;
        case 'control': this.synth.control(data.name, data.value); break;
        case 'panic': this.synth.panic(); break;
        case 'stop': if (data.value) this.synth.panic(); this.synth.stopped = Boolean(data.value); break;
      }
    };
  }
  process(inputs, outputs) {
    const output = outputs[0];
    if (!output?.[0] || !output[1]) return true;
    this.synth.render(output[0], output[1]);
    this.recorder.append(output[0], output[1]);
    if (++this.blocks % 24 === 0) this.port.postMessage({ type: 'meter', peak: this.synth.peak, notes: this.synth.activeNotes(), invalidSamples: this.synth.invalidSamples });
    return true;
  }
}

registerProcessor('tcko2-synth', TCKO2Processor);
