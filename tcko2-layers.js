import {TECHNOLOGY_LABELS} from './tcko2-technologies.js';
import { SynthEngine, PATCHES, GLITCH_TYPES } from './tcko2-engine.js';

const SETTINGS = ['technologyType','technologyCharacter','technologyLevel','master','pitch','clarity','bloom','echo','glitch','fragments','glitchAmount','fragmentsAmount','glitchVolume','glitchType','hold','drone'];
const ceiling = value => Math.abs(value) <= .8 ? value : Math.sign(value) * (.8 + .15 * (1 - Math.exp(-((Math.abs(value) - .8) / .15))));

export class LiveLayers {
  constructor(rate, voiceLimit = 8, emit = () => {}) {
    this.rate = rate; this.voiceLimit = voiceLimit; this.emit = emit; this.enabled = false;
    this.slots = Array.from({ length: voiceLimit <= 4 ? 2 : 4 }, (_, id) => ({ id, synth: new SynthEngine(rate, voiceLimit), active: false, touched: false, gain: 1, retiring: false }));
    this.current = this.slots[0]; this.current.active = true;
    this.left = new Float32Array(128); this.right = new Float32Array(128);
    this.peak = 0; this.invalidSamples = 0;
  }
  settings() {
    const synth = this.current.synth;
    return { preset: synth.patchIndex, macros: Array.from(synth.target), flow: this.enabled, ...Object.fromEntries(SETTINGS.map(name => [name, synth[name]])) };
  }
  status(message = '', rejected = false) {
    return { type: 'layers', enabled: this.enabled, maximum: this.slots.length, voiceLimit: this.voiceLimit, message, rejected, current: this.settings(), kept: this.slots.filter(slot => slot.active && slot !== this.current && !slot.retiring).map(slot => ({ id: slot.id, name: slot.synth.technologyType>=0?TECHNOLOGY_LABELS[slot.synth.technologyType]:PATCHES[slot.synth.patchIndex].name, glitch: slot.synth.glitch ? GLITCH_TYPES[slot.synth.glitchType] : '', fragments: slot.synth.fragments })) };
  }
  notify(message = '', rejected = false) { this.emit(this.status(message, rejected)); }
  hasSound(slot = this.current) { return slot.synth.fadeGain !== 0 && (slot.touched || slot.synth.voices.some(voice => voice.active)); }
  fork(seed) {
    if (!this.enabled || !this.hasSound()) return true;
    const next = this.slots.find(slot => !slot.active);
    const notes = seed ? this.current.synth.voices.filter(voice => voice.active && voice.stage !== 2) : [];
    if (!next || this.voiceCount() + notes.length > this.voiceLimit) {
      this.notify('Layers are full; nothing was cut off. Remove a kept layer, or capture a loop to make room.', true);
      return false;
    }
    const settings = this.settings(), previous = this.current;
    for (const voice of previous.synth.voices) if (voice.active && voice.stage !== 2) { voice.flowHeld = voice.held = true; voice.down = false; }
    next.synth.setPatch(settings.preset);
    settings.macros.forEach((value, index) => next.synth.set(index, value));
    for (const name of SETTINGS) next.synth.control(name, settings[name]);
    next.synth.control('flow', this.enabled);
    next.synth.bends.set(previous.synth.bends); next.synth.pedals.set(previous.synth.pedals);
    next.active = true; next.touched = false; next.gain = 1; next.retiring = false;
    this.current = next;
    for (const voice of notes) {
      next.synth.noteOn(voice.note, Math.round(127 * voice.velocity ** (1 / .65)), voice.channel);
      if (!voice.down) next.synth.noteOff(voice.note, voice.channel);
      next.touched = true;
    }
    return true;
  }
  setPatch(index, preserve = false, macros) {
    if (index === this.current.synth.patchIndex && this.current.synth.technologyType<0 && preserve) return;
    if (preserve && !this.fork(false)) return;
    this.current.synth.setPatch(index, preserve);
    if (Array.isArray(macros)) macros.forEach((value, macro) => this.current.synth.set(macro, value));
    this.notify();
  }
  selectTechnology(index) {
    if(index===this.current.synth.technologyType)return;
    if(!this.fork(false))return;
    this.current.synth.selectTechnology(index);this.notify();
  }
  set(index, value) { this.current.synth.set(index, value); }
  control(name, value) {
    if (name === 'flow') {
      this.enabled = Boolean(value);
      for (const slot of this.slots) slot.synth.control('flow', this.enabled);
      this.notify(); return;
    }
    if (name === 'master') { for (const slot of this.slots) slot.synth.control(name, value); return; }
    const synth = this.current.synth;
    const changed = name === 'glitchType' ? synth.glitch && synth.glitchType !== Number(value) : (name === 'glitch' || name === 'fragments') && Boolean(value) && !synth[name];
    if (changed && !this.fork(true)) return;
    this.current.synth.control(name, value);
    if (changed) this.notify();
  }
  voiceCount() { return this.slots.reduce((count, slot) => count + (slot.active ? slot.synth.voices.filter(voice => voice.active).length : 0), 0); }
  noteOn(note, velocity = 100, channel = 16) {
    if (!Number.isInteger(note) || note < 0 || note > 127 || !Number.isInteger(channel) || channel < 0 || channel > 17 || this.current.synth.stopped) return;
    if (velocity <= 0) { this.noteOff(note, channel); return; }
    const synth = this.current.synth;
    const existing = synth.voices.some(voice => voice.active && voice.note === note && voice.channel === channel && voice.patchVersion === synth.patchVersion);
    const protectedVoices = this.slots.some(slot => slot.active && slot !== this.current && slot.synth.voices.some(voice => voice.active));
    if ((this.enabled || protectedVoices) && !existing && this.voiceCount() >= this.voiceLimit) { this.notify('All live voices are in use; kept layers were left playing. Remove a layer or use the loop for more space.'); return; }
    for (const slot of this.slots) if (slot.active && slot.synth.fadeFrames > 0) { slot.synth.fadeFrames = slot.synth.fadeStep = 0; }
    synth.noteOn(note, velocity, channel); this.current.touched = true;
  }
  noteOff(note, channel = 16) { for (const slot of this.slots) if (slot.active) slot.synth.noteOff(note, channel); }
  releaseKeys(channel) { for (const slot of this.slots) if (slot.active) slot.synth.releaseKeys(channel); }
  midi(status, note, value) {
    const command = status & 240, channel = status & 15;
    if (command === 144) this.noteOn(note, value, channel);
    else if (command === 128) this.noteOff(note, channel);
    else if (command === 176 && (note === 120 || note === 123 || note === 64 || note === 121)) { for (const slot of this.slots) if (slot.active) slot.synth.midi(status, note, value); }
    else this.current.synth.midi(status, note, value);
  }
  remove(id) {
    const slot = this.slots.find(candidate => candidate.id === id && candidate.active && candidate !== this.current);
    if (slot) { slot.retiring = true; this.notify('Removing that layer; the other sounds keep playing.'); }
  }
  clear() { for (const slot of this.slots) if (slot.active && slot !== this.current) slot.retiring = true; this.notify('Kept layers cleared; live keys and loop are untouched.'); }
  panic() {
    for (const slot of this.slots) { slot.synth.panic(); slot.active = slot === this.current; slot.retiring = slot.touched = false; slot.gain = 1; }
    this.notify();
  }
  stop(value) { if (value) this.panic(); for (const slot of this.slots) slot.synth.stopped = Boolean(value); }
  fadeOut(seconds) { for (const slot of this.slots) if (slot.active) slot.synth.fadeOut(seconds); }
  activeNotes() { return [...new Set(this.slots.flatMap(slot => slot.active && !slot.retiring ? slot.synth.activeNotes() : []))]; }
  render(left, right) {
    if (this.left.length !== left.length) { this.left = new Float32Array(left.length); this.right = new Float32Array(left.length); }
    this.current.synth.render(left, right);
    let mixed = false;
    for (const slot of this.slots) {
      if (!slot.active || slot === this.current) continue;
      slot.synth.render(this.left, this.right); mixed = true;
      for (let index = 0; index < left.length; index++) {
        if (slot.retiring) slot.gain = Math.max(0, slot.gain - 1 / (this.rate * .02));
        left[index] += this.left[index] * slot.gain; right[index] += this.right[index] * slot.gain;
      }
      if (slot.gain === 0 || slot.synth.fadeGain === 0) {
        slot.synth.panic(); slot.active = slot.touched = slot.retiring = false; this.notify();
      }
    }
    let peak = 0;
    for (let index = 0; index < left.length; index++) {
      if (mixed) { left[index] = ceiling(left[index]); right[index] = ceiling(right[index]); }
      peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
    }
    this.peak = peak; this.invalidSamples = this.slots.reduce((count, slot) => count + slot.synth.invalidSamples, 0);
  }
}
