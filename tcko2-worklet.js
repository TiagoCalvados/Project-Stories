import { SynthEngine } from './tcko2-engine.js';
import { PcmTakeCapture } from './tcko2-recording.js';
import { AudioLoop } from './tcko2-loop.js';

class TCKO2Processor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.synth = new SynthEngine(sampleRate, options.processorOptions?.voiceLimit ?? 8);
    this.loop = new AudioLoop(sampleRate, message => this.port.postMessage(message));
    this.blocks = 0;
    this.recorder = new PcmTakeCapture(sampleRate, (message, transfer) => this.port.postMessage(message, transfer || []));
    this.port.onmessage = ({ data }) => {
      switch (data.type) {
        case 'recordStart': this.recorder.start(data.id, data.maximumFrames); break;
        case 'recordStop': if (this.recorder.take?.id === data.id) this.recorder.stop(data.reason); break;
        case 'noteOn': this.loop.cancelFade(); this.synth.noteOn(data.note, data.velocity, data.channel); break;
        case 'noteOff': this.synth.noteOff(data.note, data.channel); break;
        case 'release': this.synth.releaseKeys(data.channel); break;
        case 'midi': if ((data.data[0] & 240) === 144 && data.data[2] > 0) this.loop.cancelFade(); this.synth.midi(...data.data); break;
        case 'preset': this.synth.setPatch(data.index, data.preserve === true); break;
        case 'macro': this.synth.set(data.index, data.value); break;
        case 'control': this.synth.control(data.name, data.value); break;
        case 'panic': this.synth.panic(); this.loop.pause(true); break;
        case 'fade': this.synth.fadeOut(data.seconds); this.loop.fadeOut(data.seconds); break;
        case 'stop': if (data.value) { this.synth.panic(); this.loop.pause(true); } this.synth.stopped = Boolean(data.value); break;
        case 'loop':
          if (data.action === 'record' && !this.synth.stopped) this.loop.start();
          else if (data.action === 'finish') this.loop.finish();
          else if (data.action === 'toggle' && !this.synth.stopped) this.loop.toggle();
          else if (data.action === 'overdub' && !this.synth.stopped) this.loop.overdub();
          else if (data.action === 'clear') this.loop.clear();
          else if (data.action === 'volume') this.loop.setVolume(data.value);
          break;
      }
    };
  }
  process(inputs, outputs) {
    const output = outputs[0];
    if (!output?.[0] || !output[1]) return true;
    this.synth.render(output[0], output[1]);
    const peak = this.loop.recording || this.loop.playing || this.loop.gain > 0 ? this.loop.process(output[0], output[1]) : this.synth.peak;
    this.recorder.append(output[0], output[1]);
    if (++this.blocks % 24 === 0) {
      this.port.postMessage({ type: 'meter', peak, notes: this.synth.activeNotes(), invalidSamples: this.synth.invalidSamples, fading: this.synth.fadeFrames > 0, faded: this.synth.fadeGain === 0 });
      this.port.postMessage(this.loop.status());
    }
    return true;
  }
}

registerProcessor('tcko2-synth', TCKO2Processor);
