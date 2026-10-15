export const PATCHES = [
  { name: 'Velvet Voltage', description: 'Wide, warm detuned saws with a soft swell.', model: 0, values: [.55,.12,.66,.16,.18,.3,0,.18], attack: .18, release: 1.8, decay: .9, sustain: .82, envTone: .25 },
  { name: 'Cellar Acid', description: 'A narrow pulse, sharp filter pluck and rubbery squelch.', model: 1, values: [.28,.86,.03,.38,.12,.05,0,.08], attack: .003, release: .16, decay: .13, sustain: .12, envTone: 8 },
  { name: 'Dusty Polaroid', description: 'Rounded electric-piano tines and worn-tape wobble.', model: 2, values: [.79,.08,.12,.12,.2,.18,0,.3], attack: .003, release: .8, decay: .55, sustain: .035, envTone: .1 },
  { name: 'Copper Satellites', description: 'Bright, inharmonic metal bells that ring out into space.', model: 3, values: [.91,.08,.04,.06,.23,.34,.12,.08], attack: .002, release: 2.8, decay: 1.1, sustain: .008, envTone: 0 },
  { name: 'Ghost Observatory', description: 'A breathy, ghostly choir. Hold a chord for the slow swell.', model: 4, values: [.78,.2,.5,.08,.28,.65,0,.28], attack: 1.3, release: 10, decay: 2, sustain: .92, envTone: .2, echo: 1.25 },
  { name: 'Below the Floor / Drone', description: 'Deep sine and triangle tones, one octave below the keys.', model: 5, values: [.29,.12,.2,.22,.18,.25,0,.12], attack: 1.1, release: 12, decay: 3, sustain: .98, envTone: .2, drone: true, echo: 1.6 },
  { name: 'Lunar Array / Drone', description: 'Glassy layers, a moving upper fifth and long echoes.', model: 6, values: [.76,.16,.5,.06,.57,.7,.08,.32], attack: 2.2, release: 16, decay: 3, sustain: 1, envTone: .2, drone: true, echo: 2.2 },
  { name: 'Rust Cathedral / Drone', description: 'Dissonant metallic FM and hollow industrial growls.', model: 7, values: [.68,.68,.32,.4,.37,.6,.15,.3], attack: 1.5, release: 14, decay: 2.5, sustain: 1, envTone: .6, drone: true, echo: 1.8 },
  { name: 'Broken Transistor Organ', description: 'Immediate, steady drawbar harmonics and a tiny key click.', model: 8, values: [.88,.04,.04,.12,.05,.13,0,.02], attack: .002, release: .1, decay: .1, sustain: 1, envTone: 0 },
  { name: 'Soot Ribbon Lead', description: 'A nasal, biting lead with a narrow pulse and fast filter bite.', model: 9, values: [.73,.48,.16,.62,.22,.1,.04,.15], attack: .006, release: .28, decay: .23, sustain: .65, envTone: 1.8 },
  { name: 'Arcade Vapour', description: 'An 8-bit root / octave / fifth arpeggio. Motion changes its rate.', model: 10, values: [.89,.04,.02,.08,.16,.08,0,.62], attack: .002, release: .2, decay: .16, sustain: .5, envTone: 0 },
];

export const GLITCH_TYPES = ['Stutter buffers', 'Static bursts', 'Error signals', 'Bitcrush sweep', 'Broken radio', 'VHS dropout', 'Data modem'];
export const clamp = (value, minimum, maximum) => Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : minimum;
const TAU = Math.PI * 2;
const advance = (phase, step) => { const value = phase + step; return value >= 1 ? value - 1 : value; };
const saturate = value => value > 3 ? 1 : value < -3 ? -1 : value * (27 + value * value) / (27 + 9 * value * value);
const frequencyOf = note => 440 * 2 ** ((note - 69) / 12);
const partial = (phase, harmonic, frequency, rate) => harmonic * frequency < rate * .45 ? Math.sin(phase * harmonic) : 0;

function readRing(buffer, position) {
  let location = position;
  while (location < 0) location += buffer.length;
  while (location >= buffer.length) location -= buffer.length;
  const index = Math.floor(location);
  const fraction = location - index;
  return buffer[index] * (1 - fraction) + buffer[(index + 1) % buffer.length] * fraction;
}

function blep(phase, step) {
  if (phase < step) { const amount = phase / step; return amount + amount - amount * amount - 1; }
  if (phase > 1 - step) { const amount = (phase - 1) / step; return amount * amount + amount + amount + 1; }
  return 0;
}

function saw(phase, step) { return 2 * phase - 1 - blep(phase, step); }
function pulse(phase, step, width) { return (phase < width ? 1 : -1) + blep(phase, step) - blep((phase - width + 1) % 1, step) + 1 - 2 * width; }

class Random {
  constructor(seed) { this.seed = seed; }
  next() { this.seed ^= this.seed << 13; this.seed ^= this.seed >>> 17; this.seed ^= this.seed << 5; return (this.seed >>> 0) / 4294967296; }
  integer(maximum) { return Math.floor(this.next() * maximum); }
}

class Comb {
  constructor(size) { this.data = new Float64Array(size); this.position = 0; this.damp = 0; }
  tick(input, feedback) { const value = this.data[this.position]; this.damp = .32 * value + .68 * this.damp; this.data[this.position] = input + feedback * this.damp; this.position = (this.position + 1) % this.data.length; return value; }
  clear() { this.data.fill(0); this.position = this.damp = 0; }
}

class SliceEffects {
  constructor(rate) {
    this.rate = rate;
    this.left = new Float64Array(rate);
    this.right = new Float64Array(rate);
    this.grains = Array.from({ length: 4 }, () => ({ position: 0, speed: 1, age: 0, length: 0, swap: false }));
    this.random = new Random(2718);
    this.clear();
  }
  resetGlitch() {
    this.phase = this.period = this.holdCounter = this.heldLeft = this.heldRight = this.level = this.noiseLeft = this.noiseRight = this.signalPhase = this.crushPhase = this.texturePhase = this.radioLowLeft = this.radioLowRight = this.radioHighLeft = this.radioHighRight = 0;
  }
  clear() {
    this.left.fill(0); this.right.fill(0);
    this.position = this.recorded = this.countdown = this.grainIndex = 0;
    this.resetGlitch();
    for (const grain of this.grains) grain.length = 0;
    this.outputLeft = this.outputRight = 0;
  }
  mix(wetLeft, wetRight, amount, volume, duck) {
    const dry = 1 - amount * Math.min(1, volume) * duck;
    this.outputLeft = this.outputLeft * dry + wetLeft * amount * volume;
    this.outputRight = this.outputRight * dry + wetRight * amount * volume;
  }
  process(left, right, glitch, fragments, type, volume, noteFrequency) {
    const rate = this.rate;
    this.left[this.position] = left; this.right[this.position] = right;
    this.recorded = Math.min(rate, this.recorded + 1);
    if (fragments > .00001 && this.recorded > rate * .5) {
      if (--this.countdown <= 0) {
        const grain = this.grains[this.grainIndex];
        this.grainIndex = (this.grainIndex + 1) % 4;
        grain.position = this.position - rate * (.25 + this.random.next() * .2);
        grain.length = Math.floor(rate * (.1 + this.random.next() * .1)); grain.age = 0;
        grain.speed = [-1, -.75, .5, 1.5][this.random.integer(4)]; grain.swap = this.random.next() > .5;
        this.countdown = Math.floor(rate * (.05 + this.random.next() * .025));
      }
      let scatteredLeft = 0, scatteredRight = 0;
      for (const grain of this.grains) {
        if (grain.age >= grain.length) continue;
        const envelope = Math.sin(Math.PI * grain.age / grain.length) ** 2;
        const grainLeft = readRing(this.left, grain.position), grainRight = readRing(this.right, grain.position);
        scatteredLeft += (grain.swap ? grainRight : grainLeft) * envelope;
        scatteredRight += (grain.swap ? grainLeft : grainRight) * envelope;
        grain.position += grain.speed; grain.age++;
      }
      const wet = fragments * .7;
      left = left * (1 - wet) + scatteredLeft * wet * .6; right = right * (1 - wet) + scatteredRight * wet * .6;
    } else if (fragments <= .00001) {
      this.countdown = 0;
      for (const grain of this.grains) grain.length = 0;
    }
    this.outputLeft = left; this.outputRight = right;
    this.level = Math.max(Math.abs(left), Math.abs(right), this.level * .9993);
    if (glitch > .00001 && volume > .0000001 && this.level > .0000001 && (type !== 0 || this.recorded > rate * .2) && (type !== 5 || this.recorded > rate * .04)) {
      if (this.phase === 0) {
        this.period = Math.floor(rate * (.2 + this.random.next() * .15));
        this.duration = Math.floor(type === 0 ? this.period * .6 : type === 4 || type === 6 ? this.period * .8 : rate * (.01 + this.random.next() * .03));
        this.sliceLength = Math.floor(rate * (.02 + this.random.next() * .035)); this.sliceStart = this.position - this.sliceLength;
        this.holdCounter = 0; this.signalStart = 350 + this.random.next() * 1800; this.signalRatio = this.random.next() > .5 ? .25 : 2.5; this.signalPhase = 0;
      }
      if (type === 3) {
        this.crushPhase = (this.crushPhase + TAU * (.35 + glitch * 1.7) / rate) % TAU;
        if (this.holdCounter-- <= 0) {
          const levels = 2 ** (12 - 7.5 * glitch);
          this.heldLeft = Math.round(left / this.level * levels) / levels * this.level; this.heldRight = Math.round(right / this.level * levels) / levels * this.level;
          this.holdCounter = Math.floor(glitch * (4 + 40 * (.5 + .5 * Math.sin(this.crushPhase))) * rate / 44100);
        }
        this.mix(this.heldLeft, this.heldRight, glitch * .92, volume, 1);
      } else if (type === 5) {
        this.texturePhase = (this.texturePhase + TAU * .7 / rate) % TAU;
        const flutter = (150 * Math.sin(this.texturePhase) + 27 * Math.sin(this.texturePhase * 17)) * rate / 44100;
        const drop = Math.min(1, .2 + .8 * this.phase / (rate * .015));
        const noiseLeft = this.random.next() * 2 - 1, noiseRight = this.random.next() * 2 - 1;
        this.noiseLeft += .08 * (noiseLeft - this.noiseLeft); this.noiseRight += .08 * (noiseRight - this.noiseRight);
        this.mix(readRing(this.left, this.position - rate * .018 - flutter) * drop + (noiseLeft - this.noiseLeft) * this.level * .18, readRing(this.right, this.position - rate * .019 - flutter * .93) * drop + (noiseRight - this.noiseRight) * this.level * .18, glitch * .9, volume, 1);
      } else if (this.phase < this.duration) {
        if (type === 0) {
          const offset = this.phase % this.sliceLength;
          const edge = Math.min(1, offset / (rate * .002), (this.sliceLength - 1 - offset) / (rate * .002));
          if (this.holdCounter-- <= 0) {
            const resolution = 1024 - 768 * glitch;
            this.heldLeft = Math.round(readRing(this.left, this.sliceStart + offset) * resolution) / resolution;
            this.heldRight = Math.round(readRing(this.right, this.sliceStart + offset) * resolution) / resolution;
            this.holdCounter = 1 + Math.floor(glitch * 3 * rate / 44100);
          }
          const fade = Math.min(1, this.phase / (rate * .004), (this.duration - 1 - this.phase) / (rate * .004));
          this.mix(this.heldLeft * edge, this.heldRight * edge, glitch * .85 * fade, volume, 1);
        } else {
          const progress = this.phase / this.duration, envelope = Math.sin(Math.PI * progress) ** 2;
          let artifactLeft, artifactRight;
          if (type === 1) {
            const noiseLeft = this.random.next() * 2 - 1, noiseRight = this.random.next() * 2 - 1;
            this.noiseLeft += .12 * (noiseLeft - this.noiseLeft); this.noiseRight += .12 * (noiseRight - this.noiseRight);
            artifactLeft = (noiseLeft - this.noiseLeft) * 1.4; artifactRight = (noiseRight - this.noiseRight) * 1.4;
          } else if (type === 4) {
            this.radioLowLeft += .3 * (left - this.radioLowLeft); this.radioLowRight += .3 * (right - this.radioLowRight);
            this.radioHighLeft += .025 * (this.radioLowLeft - this.radioHighLeft); this.radioHighRight += .025 * (this.radioLowRight - this.radioHighRight);
            this.signalPhase = (this.signalPhase + TAU * (120 + progress * progress * 2300) / rate) % TAU;
            const tuning = Math.sin(this.signalPhase);
            artifactLeft = (this.radioLowLeft - this.radioHighLeft) / this.level * tuning * 1.4 + (this.random.next() * 2 - 1) * .55;
            artifactRight = (this.radioLowRight - this.radioHighRight) / this.level * tuning * 1.4 + (this.random.next() * 2 - 1) * .55;
          } else if (type === 6) {
            const bit = (0x5B39 >> (Math.floor(this.phase / (rate / 300)) % 15)) & 1;
            const frequency = Math.min(6000, (progress < .18 ? 440 : bit === 0 ? 1200 : 2200) * noteFrequency / 220);
            this.signalPhase = (this.signalPhase + TAU * frequency / rate) % TAU;
            const packet = Math.floor(this.phase / (rate * .03)) % 5 === 3 ? .15 : 1;
            artifactLeft = (.8 * Math.sin(this.signalPhase) + .17 * Math.sin(this.signalPhase * 3) + .03 * (this.random.next() * 2 - 1)) * packet;
            artifactRight = (.8 * Math.sin(this.signalPhase + .03) + .17 * Math.sin(this.signalPhase * 3) + .03 * (this.random.next() * 2 - 1)) * packet;
          } else {
            const frequency = Math.min(6000, this.signalStart * this.signalRatio ** progress * noteFrequency / 220);
            this.signalPhase = (this.signalPhase + TAU * frequency / rate) % TAU;
            artifactLeft = .8 * Math.sin(this.signalPhase) + .2 * Math.sin(this.signalPhase * 2); artifactRight = .8 * Math.sin(this.signalPhase + .06) + .2 * Math.sin(this.signalPhase * 2);
          }
          this.mix(artifactLeft * this.level, artifactRight * this.level, glitch * envelope, volume, .65);
        }
      }
      if (++this.phase >= this.period) this.phase = 0;
    } else if (glitch <= .00001 || volume <= .0000001) this.phase = 0;
    this.position = (this.position + 1) % rate;
  }
}

export class SynthEngine {
  constructor(rate = 48000, voiceLimit = 8) {
    this.rate = Math.round(clamp(rate, 22050, 192000));
    this.voices = Array.from({ length: Math.round(clamp(voiceLimit, 1, 8)) }, () => ({ active: false }));
    this.random = new Random(947); this.age = 0;
    this.pedals = new Uint8Array(18); this.bends = new Float64Array(18);
    this.target = new Float64Array(8); this.smooth = new Float64Array(8);
    this.delayLeft = new Float64Array(this.rate * 5); this.delayRight = new Float64Array(this.rate * 5);
    this.chorusLeft = new Float64Array(Math.ceil(this.rate * .05)); this.chorusRight = new Float64Array(this.chorusLeft.length);
    this.reverbLeft = [2591,3251,3907,4451].map(size => new Comb(Math.round(size * this.rate / 44100)));
    this.reverbRight = [2677,3371,4003,4561].map(size => new Comb(Math.round(size * this.rate / 44100)));
    this.slices = new SliceEffects(this.rate);
    this.master = this.masterSmooth = .2; this.pitch = 0; this.clarity = true; this.glitchType = 0;
    this.glitchAmount = this.fragmentsAmount = .65; this.glitchVolume = this.glitchVolumeSmooth = 2;
    this.stopped = false; this.invalidSamples = 0; this.lfo = this.slowLfo = this.sampleCounter = 0;
    this.setPatch(3);
  }
  setPatch(index) {
    this.patchIndex = Math.round(clamp(index, 0, PATCHES.length - 1)); this.patch = PATCHES[this.patchIndex]; this.panic();
    this.attackStep = 1 / (this.rate * this.patch.attack); this.decayMultiplier = Math.exp(-1 / (this.rate * this.patch.decay)); this.releaseMultiplier = Math.exp(-7 / (this.rate * this.patch.release));
    this.driveScale = this.patch.model === 0 || this.patch.model === 1 || this.patch.model === 9 ? 1 : this.patch.model === 7 ? .5 : .18;
    this.drone = Boolean(this.patch.drone); this.bloom = this.bloomSmooth = this.patch.drone ? .9 : .75;
    this.echo = this.echoSmooth = this.patch.echo || .85;
    this.target.set(this.patch.values); this.smooth.set(this.target);
  }
  set(index, value) { if (Number.isInteger(index) && index >= 0 && index < 8) this.target[index] = clamp(value, 0, 1); }
  control(name, value) {
    switch (name) {
      case 'master': this.master = clamp(value, 0, .8); break;
      case 'pitch': this.pitch = Math.round(clamp(value, -12, 12)); break;
      case 'clarity': this.clarity = Boolean(value); break;
      case 'bloom': this.bloom = clamp(value, 0, 1); break;
      case 'echo': this.echo = clamp(value, .08, 4); break;
      case 'glitch': this.glitch = Boolean(value); break;
      case 'fragments': this.fragments = Boolean(value); break;
      case 'glitchAmount': this.glitchAmount = clamp(value, 0, 1); break;
      case 'fragmentsAmount': this.fragmentsAmount = clamp(value, 0, 1); break;
      case 'glitchVolume': this.glitchVolume = clamp(value, 0, 4); break;
      case 'glitchType': this.glitchType = Math.round(clamp(value, 0, 6)); this.slices.resetGlitch(); break;
      case 'hold': this.hold = Boolean(value); if (this.hold) { this.drone = false; for (const voice of this.voices) voice.latched = false; } this.releaseUnheld(); break;
      case 'drone': this.drone = Boolean(value); if (this.drone) { this.hold = false; for (const voice of this.voices) if (voice.active && (voice.down || voice.held)) voice.latched = true; } else { for (const voice of this.voices) voice.latched = false; } this.releaseUnheld(); break;
    }
  }
  noteOn(note, velocity = 100, channel = 16) {
    if (!Number.isInteger(note) || note < 0 || note > 127 || !Number.isInteger(channel) || channel < 0 || channel > 17 || this.stopped) return;
    if (velocity <= 0) { this.noteOff(note, channel); return; }
    let chosen = this.voices.find(voice => voice.active && voice.note === note && voice.channel === channel);
    if (this.drone && chosen?.latched) { chosen.latched = chosen.down = chosen.held = false; chosen.stage = 2; return; }
    if (!chosen) chosen = this.voices.find(voice => !voice.active);
    if (!chosen) chosen = this.voices.reduce((oldest, voice) => voice.age < oldest.age ? voice : oldest);
    Object.assign(chosen, { note, channel, age: ++this.age, active: true, down: true, held: false, latched: this.drone, bloom: 0, stage: 0, env: 0, filterEnv: 1, ic1: 0, ic2: 0, velocity: (clamp(velocity, 1, 127) / 127) ** .65, frequency: frequencyOf(note), drift: this.random.next() * 2 - 1, phase1: this.random.next(), phase2: this.random.next(), phase3: this.random.next(), phase4: this.random.next(), sub: this.random.next(), ring: 0, modPhase: 0, extraPhase: 0, chipPhase: 0, seconds: 0, noiseLow: 0, noiseState: 947 + note * 7919 + channel * 101 });
    this.noteFrequency = chosen.frequency;
  }
  noteOff(note, channel = 16) {
    for (const voice of this.voices) if (voice.active && voice.note === note && voice.channel === channel) {
      voice.down = false;
      if (voice.stage === 2 && !voice.latched) continue;
      if (this.pedals[channel] || this.hold || voice.latched) voice.held = true; else voice.stage = 2;
    }
  }
  releaseUnheld() { for (const voice of this.voices) if (voice.active && !voice.down && !voice.latched && !this.hold && !this.pedals[voice.channel]) { voice.held = false; voice.stage = 2; } }
  releaseKeys(channel) { for (const voice of this.voices) if (voice.active && voice.channel === channel && voice.down) this.noteOff(voice.note, channel); }
  midi(status, note, value) {
    const channel = status & 15, command = status & 240;
    if (command === 144) this.noteOn(note, value, channel);
    else if (command === 128) this.noteOff(note, channel);
    else if (command === 224) this.bends[channel] = ((note + value * 128) - 8192) / 8192 * 2;
    else if (command === 176 && note === 64) { this.pedals[channel] = value >= 64 ? 1 : 0; this.releaseUnheld(); }
    else if (command === 176 && (note === 120 || note === 123)) { this.pedals[channel] = 0; for (const voice of this.voices) if (voice.channel === channel) { voice.down = voice.held = voice.latched = false; voice.stage = 2; if (note === 120) voice.active = false; } }
    else if (command === 176 && note === 121) { this.pedals[channel] = 0; this.bends[channel] = 0; this.releaseUnheld(); }
  }
  panic() {
    this.hold = this.drone = this.glitch = this.fragments = false;
    this.glitchSmooth = this.fragmentsSmooth = 0; this.glitchVolumeSmooth = this.glitchVolume;
    this.claritySmooth = this.clarity ? 1 : 0; this.noteFrequency = this.noteFrequencySmooth = 220;
    for (const voice of this.voices) voice.active = voice.down = voice.held = voice.latched = false;
    this.pedals.fill(0); this.bends.fill(0);
    for (const buffer of [this.delayLeft,this.delayRight,this.chorusLeft,this.chorusRight]) buffer.fill(0);
    for (const comb of [...this.reverbLeft,...this.reverbRight]) comb.clear();
    this.slices.clear();
    this.delayPosition = this.chorusPosition = this.echoDampLeft = this.echoDampRight = this.dcLeft = this.dcRight = this.lastLeft = this.lastRight = this.outputLeft = this.outputRight = this.previousLeft = this.previousRight = this.nextLeft = this.nextRight = this.transportPhase = 0;
    this.transportSpeed = 2 ** (this.pitch / 12); this.transportPrimed = false; this.peak = 0;
  }
  source(voice, frequency, firstStep, secondStep, wave) {
    const model = this.patch.model, rate = this.rate;
    const phase = voice.phase1 * TAU, otherPhase = voice.phase2 * TAU, subPhase = voice.sub * TAU;
    const modRatio = model === 3 ? 2.714 : model === 7 ? Math.SQRT2 : model === 6 ? 1.5 : 2;
    const extraRatio = model === 3 ? 4.213 : model === 7 ? 3.731 : 3;
    voice.modPhase = advance(voice.modPhase, Math.min(.42, frequency * modRatio / rate));
    voice.extraPhase = advance(voice.extraPhase, Math.min(.42, frequency * extraRatio / rate)); voice.seconds += 1 / rate;
    voice.noiseState ^= voice.noiseState << 13; voice.noiseState ^= voice.noiseState >>> 17; voice.noiseState ^= voice.noiseState << 5;
    const noise = (voice.noiseState >>> 0) / 4294967296 * 2 - 1;
    voice.noiseLow += .035 * (noise - voice.noiseLow);
    const strike = voice.filterEnv, modulator = Math.sin(voice.modPhase * TAU), extra = Math.sin(voice.extraPhase * TAU), limit = Math.min(1, 3000 / frequency);
    switch (model) {
      case 1: return .7 * pulse(voice.phase1, firstStep, .2) + .18 * saw(voice.phase2, secondStep) + .14 * Math.sin(subPhase);
      case 2: return 1.12 * (.78 * Math.sin(phase + limit * (.08 + 2.8 * strike * voice.velocity) * modulator) + .13 * partial(phase, 2, frequency, rate) * strike + .025 * noise * strike ** 8);
      case 3: return 1.08 * (.65 * Math.sin(phase + limit * 3.1 * strike * modulator) + .25 * extra * strike + .08 * partial(phase, 2, frequency, rate));
      case 4: return (.43 * partial(phase, 1, frequency, rate) + .25 * partial(phase, 3, frequency, rate) + .15 * partial(phase, 5, frequency, rate) + .09 * partial(phase, 7, frequency, rate)) * (.78 + .22 * wave) + .13 * (noise - voice.noiseLow);
      case 5: return 1.2 * (.78 * Math.sin(subPhase + .15 * wave) + .14 * (1 - 4 * Math.abs(voice.phase1 - .5)) + .08 * Math.sin(otherPhase));
      case 6: return .53 * Math.sin(phase + limit * .55 * modulator) + .27 * Math.sin(otherPhase) + .23 * modulator * (.65 + .35 * wave);
      case 7: return .64 * Math.sin(phase + limit * (2.6 + .8 * wave) * modulator) + .24 * extra + .12 * Math.sin(subPhase);
      case 8: return 1.2 * (.34 * Math.sin(subPhase) + .26 * partial(phase, 1, frequency, rate) + .2 * partial(phase, 2, frequency, rate) + .12 * partial(phase, 3, frequency, rate) + .05 * partial(phase, 4, frequency, rate) + .03 * partial(phase, 8, frequency, rate)) + .035 * noise * Math.exp(-voice.seconds * 200);
      case 9: return .62 * Math.sin(phase + limit * 2.8 * Math.sin(phase)) + .3 * pulse(voice.phase2, secondStep, .18) + .08 * Math.sin(subPhase);
      case 10: {
        const position = Math.floor(voice.seconds * (7 + this.motion * 12)) % 4, ratio = position === 0 ? 1 : position === 2 ? 1.5 : 2;
        const step = Math.min(.42, frequency * ratio / rate); voice.chipPhase = advance(voice.chipPhase, step);
        return .75 * pulse(voice.chipPhase, step, .125) + .15 * Math.round((1 - 4 * Math.abs(voice.sub - .5)) * 7) / 7;
      }
      default: return .47 * saw(voice.phase1, firstStep) + .43 * saw(voice.phase2, secondStep) + .1 * Math.sin(subPhase);
    }
  }
  bloomTone(phase, step) {
    const model = this.patch.model;
    if (model === 0) return saw(phase, step);
    if (model === 1 || model === 9) return pulse(phase, step, .42);
    if (model === 10) return pulse(phase, step, .125);
    if (model === 4 || model === 8) return .7 * Math.sin(phase * TAU) + (step * 2 < .45 ? .2 * Math.sin(phase * TAU * 2) : 0) + (step * 3 < .45 ? .1 * Math.sin(phase * TAU * 3) : 0);
    return Math.sin(phase * TAU) * (model === 5 ? .35 : 1);
  }
  tick() {
    const rate = this.rate, patch = this.patch;
    if ((this.sampleCounter++ & 15) === 0) {
      for (let index = 0; index < 8; index++) this.smooth[index] += .012 * (this.target[index] - this.smooth[index]);
      this.bloomSmooth += .006 * (this.bloom - this.bloomSmooth); this.echoSmooth += .0015 * (this.echo - this.echoSmooth); this.masterSmooth += .025 * (this.master - this.masterSmooth);
      this.cutoffHertz = Math.min(rate * .4, 80 * 150 ** this.smooth[0]); this.filter = Math.tan(Math.PI * this.cutoffHertz / rate); this.resonance = 2 - 1.9 * this.smooth[1];
      this.detune = this.smooth[2] * 28; this.drive = 1 + this.smooth[3] * 7; this.ringRatio = Math.SQRT2 + this.smooth[6] * 3.72;
      this.echoAmount = this.smooth[4]; this.space = this.smooth[5]; this.motion = this.smooth[7];
    }
    this.claritySmooth += .0018 * ((this.clarity ? 1 : 0) - this.claritySmooth); this.noteFrequencySmooth += .0018 * (this.noteFrequency - this.noteFrequencySmooth);
    this.lfo = (this.lfo + TAU * (.12 + this.motion * 1.9) / rate) % TAU; this.slowLfo = (this.slowLfo + TAU * .035 / rate) % TAU;
    const slowWave = Math.sin(this.slowLfo), wave = Math.sin(this.lfo);
    let left = 0, right = 0, spaceBloom = 0;
    for (const voice of this.voices) {
      if (!voice.active) continue;
      const expanded = voice.latched || this.hold || this.pedals[voice.channel];
      if (voice.stage !== 2) voice.bloom += .0002 * ((expanded ? this.bloomSmooth : 0) - voice.bloom);
      const sustain = voice.latched ? Math.max(.92, patch.sustain) : expanded ? patch.sustain + (1 - patch.sustain) * voice.bloom * .88 : patch.sustain;
      if (voice.stage === 0) { voice.env += this.attackStep; if (voice.env >= 1) { voice.env = 1; voice.stage = 1; } }
      else if (voice.stage === 1) voice.env = sustain + (voice.env - sustain) * this.decayMultiplier;
      else { const release = voice.bloom > .01 ? Math.exp(-7 / (rate * Math.max(patch.release, 3 + 11 * voice.bloom))) : this.releaseMultiplier; voice.env *= release; if (voice.env < .00008) { voice.active = false; continue; } }
      spaceBloom = Math.max(spaceBloom, voice.bloom); voice.filterEnv *= this.decayMultiplier;
      const drift = this.detune * (.55 + .3 * voice.drift + .15 * wave), frequency = voice.frequency * 2 ** ((this.bends[voice.channel] + wave * this.motion * .1) / 12);
      const firstStep = Math.min(.42, frequency * 2 ** (-drift / 1200) / rate), secondStep = Math.min(.42, frequency * 2 ** (drift / 1200) / rate);
      let source = this.source(voice, frequency, firstStep, secondStep, wave);
      voice.phase1 = advance(voice.phase1, firstStep); voice.phase2 = advance(voice.phase2, secondStep); voice.sub = advance(voice.sub, Math.min(.42, frequency * .5 / rate));
      if (voice.bloom > .0001) {
        const spread = 14 + this.detune * .65 + slowWave * 2, thirdStep = Math.min(.42, frequency * 2 ** (-spread / 1200) / rate), fourthStep = Math.min(.42, frequency * 2 ** (spread / 1200) / rate);
        source = (source + voice.bloom * .24 * (this.bloomTone(voice.phase3, thirdStep) + this.bloomTone(voice.phase4, fourthStep))) / (1 + voice.bloom * .48);
        voice.phase3 = advance(voice.phase3, thirdStep); voice.phase4 = advance(voice.phase4, fourthStep);
      }
      voice.ring = advance(voice.ring, Math.min(.45, frequency * this.ringRatio / rate)); source *= 1 - this.smooth[6] + this.smooth[6] * Math.sin(voice.ring * TAU);
      const tracked = this.claritySmooth > .00001 && frequency * 1.5 > this.cutoffHertz ? Math.tan(Math.PI * Math.min(rate * .36, frequency * 1.5) / rate) : this.filter;
      const cutoff = this.filter + Math.max(0, tracked - this.filter) * this.claritySmooth;
      const filter = Math.min(1.8, cutoff * (1 + patch.envTone * voice.filterEnv) * (1 + wave * this.motion * .32));
      const first = 1 / (1 + filter * (filter + this.resonance)), second = filter * first, third = filter * second;
      const input = saturate(source * (1 + (this.drive - 1) * this.driveScale)) * .8, difference = input - voice.ic2;
      const band = first * voice.ic1 + second * difference, low = voice.ic2 + second * voice.ic1 + third * difference;
      voice.ic1 = 2 * band - voice.ic1; voice.ic2 = 2 * low - voice.ic2;
      const filtered = patch.model === 7 ? .4 * low + .6 * band : low;
      const signal = saturate(filtered * 1.3) * voice.env * voice.velocity * .2, pan = voice.drift * (.22 + .28 * voice.bloom) + slowWave * .13 * voice.bloom;
      left += signal * (1 - pan); right += signal * (1 + pan);
    }
    this.chorusLeft[this.chorusPosition] = left; this.chorusRight[this.chorusPosition] = right;
    const cloudLeft = readRing(this.chorusLeft, this.chorusPosition - rate * (.014 + .004 * slowWave)), cloudRight = readRing(this.chorusRight, this.chorusPosition - rate * (.022 + .005 * Math.cos(this.slowLfo)));
    this.chorusPosition = (this.chorusPosition + 1) % this.chorusLeft.length;
    const cloudMix = spaceBloom * .38; left = (left + cloudLeft * cloudMix) / (1 + cloudMix * .55); right = (right + cloudRight * cloudMix) / (1 + cloudMix * .55);
    this.glitchSmooth += .0018 * ((this.glitch ? this.glitchAmount : 0) - this.glitchSmooth); this.fragmentsSmooth += .0018 * ((this.fragments ? this.fragmentsAmount : 0) - this.fragmentsSmooth); this.glitchVolumeSmooth += .0018 * (this.glitchVolume - this.glitchVolumeSmooth);
    this.slices.process(left, right, this.glitchSmooth, this.fragmentsSmooth, this.glitchType, this.glitchVolumeSmooth, 220 + (this.noteFrequencySmooth - 220) * this.claritySmooth);
    left = this.slices.outputLeft; right = this.slices.outputRight;
    const distance = rate * (this.echoSmooth + .0018 * this.motion * wave), delayedLeft = readRing(this.delayLeft, this.delayPosition - distance), delayedRight = readRing(this.delayRight, this.delayPosition - distance * 1.013);
    this.echoDampLeft += .17 * (delayedLeft - this.echoDampLeft); this.echoDampRight += .17 * (delayedRight - this.echoDampRight);
    this.delayLeft[this.delayPosition] = saturate(left + this.echoDampRight * (.18 + this.echoAmount * .74)); this.delayRight[this.delayPosition] = saturate(right + this.echoDampLeft * (.18 + this.echoAmount * .74));
    this.delayPosition = (this.delayPosition + 1) % this.delayLeft.length;
    const wetLeft = left + this.echoDampLeft * this.echoAmount * .95, wetRight = right + this.echoDampRight * this.echoAmount * .95;
    let roomLeft = 0, roomRight = 0;
    for (let index = 0; index < 4; index++) { roomLeft += this.reverbLeft[index].tick((wetLeft + wetRight) * .13, .72 + this.space * .22); roomRight += this.reverbRight[index].tick((wetLeft + wetRight) * .13, .72 + this.space * .22); }
    const outputLeft = wetLeft + roomLeft * this.space * .65, outputRight = wetRight + roomRight * this.space * .65;
    this.dcLeft = outputLeft - this.lastLeft + .995 * this.dcLeft; this.dcRight = outputRight - this.lastRight + .995 * this.dcRight; this.lastLeft = outputLeft; this.lastRight = outputRight;
    this.outputLeft = saturate(this.dcLeft * this.masterSmooth) * .915; this.outputRight = saturate(this.dcRight * this.masterSmooth) * .915;
    if (!Number.isFinite(this.outputLeft) || !Number.isFinite(this.outputRight)) { this.invalidSamples++; this.panic(); }
  }
  render(left, right) {
    if (this.stopped) { left.fill(0); right.fill(0); this.peak = 0; return; }
    let peak = 0;
    if (!this.transportPrimed) { this.tick(); this.previousLeft = this.outputLeft; this.previousRight = this.outputRight; this.tick(); this.nextLeft = this.outputLeft; this.nextRight = this.outputRight; this.transportPrimed = true; }
    const speed = 2 ** (this.pitch / 12);
    for (let index = 0; index < left.length; index++) {
      this.transportSpeed += .0015 * (speed - this.transportSpeed);
      left[index] = this.previousLeft + (this.nextLeft - this.previousLeft) * this.transportPhase; right[index] = this.previousRight + (this.nextRight - this.previousRight) * this.transportPhase;
      peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index])); this.transportPhase += this.transportSpeed;
      while (this.transportPhase >= 1) { this.transportPhase -= 1; this.previousLeft = this.nextLeft; this.previousRight = this.nextRight; this.tick(); this.nextLeft = this.outputLeft; this.nextRight = this.outputRight; }
    }
    this.peak = peak;
  }
  activeNotes() { return this.voices.filter(voice => voice.active && (voice.down || voice.held || voice.latched)).map(voice => voice.note); }
}
