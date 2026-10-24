import { LiveLayers } from './tcko2-layers.js';
import { PcmTakeCapture } from './tcko2-recording.js';
import { AudioLoop } from './tcko2-loop.js';
import { PcmSoundFile } from './tcko2-sound-file.js';

class TCKO2Processor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    this.layers = new LiveLayers(sampleRate, options.processorOptions?.voiceLimit ?? 8, message => this.port.postMessage(message));
    this.loop = new AudioLoop(sampleRate, message => this.port.postMessage(message));
    this.soundFile = new PcmSoundFile(sampleRate);
    this.blocks = 0;
    this.recorder = new PcmTakeCapture(sampleRate, (message, transfer) => this.port.postMessage(message, transfer || []));
    this.port.onmessage = ({ data }) => {
      switch (data.type) {
        case 'technology':
          if(data.action==='configure'){
            if(data.enabled)this.layers.selectTechnology(data.selected);
            this.layers.control('technologyCharacter',data.character);this.layers.control('technologyLevel',data.level);
          }
          this.port.postMessage({type:'technologyStatus',selected:this.synth.technologyType});break;
        case 'soundFile':
          if (data.action === 'load') this.soundFile.load(data.left, data.right, data.autoplay && !this.synth.stopped);
          else if (data.action === 'play' && !this.synth.stopped) this.soundFile.play();
          else if (data.action === 'stop') this.soundFile.stop();
          this.port.postMessage(this.soundFile.status()); break;
        case 'recordStart': this.recorder.start(data.id, data.maximumFrames); break;
        case 'recordStop': if (this.recorder.take?.id === data.id) this.recorder.stop(data.reason); break;
        case 'noteOn': this.loop.cancelFade(); this.layers.noteOn(data.note, data.velocity, data.channel); break;
        case 'noteOff': this.layers.noteOff(data.note, data.channel); break;
        case 'release': this.layers.releaseKeys(data.channel); break;
        case 'midi': if ((data.data[0] & 240) === 144 && data.data[2] > 0) this.loop.cancelFade(); this.layers.midi(...data.data); break;
        case 'preset': this.layers.setPatch(data.index, data.preserve === true, data.macros); break;
        case 'macro': this.layers.set(data.index, data.value); break;
        case 'control': this.layers.control(data.name, data.value); break;
        case 'layerRemove': this.layers.remove(data.id); break;
        case 'layersClear': this.layers.clear(); break;
        case 'panic': this.layers.panic(); this.loop.pause(true); this.soundFile.stop(); break;
        case 'fade': this.layers.fadeOut(data.seconds); this.loop.fadeOut(data.seconds); this.soundFile.fadeOut(data.seconds); break;
        case 'stop': this.layers.stop(data.value); if (data.value) { this.loop.pause(true); this.soundFile.stop(); } break;
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
  get synth() { return this.layers.current.synth; }
  process(inputs, outputs) {
    const output = outputs[0];
    if (!output?.[0] || !output[1]) return true;
    this.layers.render(output[0], output[1]);
    this.soundFile.mix(output[0], output[1], this.synth.master);

    let peak = this.loop.recording || this.loop.playing || this.loop.gain > 0 ? this.loop.process(output[0], output[1]) : this.layers.peak;
    for (let i=0;i<output[0].length;i++) peak=Math.max(peak,Math.abs(output[0][i]),Math.abs(output[1][i]));
    this.recorder.append(output[0], output[1]);
    if (++this.blocks % 24 === 0) {
      this.port.postMessage({ type: 'meter', peak, notes: this.layers.activeNotes(), invalidSamples: this.layers.invalidSamples, fading: this.synth.fadeFrames > 0, faded: this.synth.fadeGain === 0 });
      this.port.postMessage(this.loop.status());
      this.port.postMessage(this.soundFile.status());
      this.port.postMessage({type:"technologyStatus",selected:this.synth.technologyType});
    }
    return true;
  }
}

registerProcessor('tcko2-synth', TCKO2Processor);
