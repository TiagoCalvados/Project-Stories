import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PATCHES } from '../tcko2-engine.js';
import { encodeWav } from '../tcko2-recording.js';

const processors = new Map();
globalThis.sampleRate = 48000;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.messages = []; this.port = { onmessage: null, postMessage: message => this.messages.push(message) }; }
};
globalThis.registerProcessor = (name, implementation) => processors.set(name, implementation);
await import('./studio-audio.js');

test('the single synth produces finite audio for every existing TCKO2 patch', () => {
  const Synth = processors.get('studio-synth'), synth = new Synth();
  assert.equal(synth.engine.voices.length, 4);
  for (let preset = 0; preset < PATCHES.length; preset++) {
    synth.port.onmessage({ data: { type: 'preset', index: preset } });
    assert.equal(synth.engine.flow, false);
    assert.equal(synth.engine.drone, false);
    synth.port.onmessage({ data: { type: 'on', note: 60 } });
    let peak = 0;
    const left = new Float32Array(128), right = new Float32Array(128);
    for (let block = 0; block < 160; block++) {
      assert.equal(synth.process([], [[left, right]]), true);
      for (let frame = 0; frame < left.length; frame++) {
        assert.ok(Number.isFinite(left[frame]) && Number.isFinite(right[frame]));
        peak = Math.max(peak, Math.abs(left[frame]), Math.abs(right[frame]));
      }
    }
    assert.ok(peak > .000001, `Patch ${PATCHES[preset].name} was silent`);
    assert.equal(synth.engine.invalidSamples, 0);
    synth.port.onmessage({ data: { type: 'off', note: 60 } });
    synth.port.onmessage({ data: { type: 'panic' } });
    assert.equal(synth.engine.activeNotes().length, 0);
  }
});

test('mix capture preserves stereo playback and exports exact non-silent PCM samples', async () => {
  const Capture = processors.get('studio-capture'), capture = new Capture();
  const left = Float32Array.from({ length: 512 }, (_, n) => .25 * Math.sin(n / 10));
  const right = Float32Array.from(left, value => -value);
  const output = [new Float32Array(512), new Float32Array(512)];
  capture.port.onmessage({ data: { type: 'start', id: 1 } });
  assert.equal(capture.capture.take.limit, 48000 * 180);
  capture.process([[left, right]], [output]);
  assert.deepEqual(output[0], left); assert.deepEqual(output[1], right);
  capture.port.onmessage({ data: { type: 'stop' } });
  const finish = capture.messages.find(message => message.type === 'recordingFinished');
  assert.equal(finish.frames, 512); assert.equal(finish.reason, 'user');
  const chunks = capture.messages.filter(message => message.type === 'recordingChunk').map(message => message.buffer);
  const bytes = Buffer.from(await encodeWav(chunks, 48000).arrayBuffer());
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.readUInt16LE(22), 2); assert.equal(bytes.readUInt32LE(24), 48000);
  assert.equal(bytes.readUInt16LE(34), 16); assert.equal(bytes.length, 44 + 512 * 4);
  for (let frame = 0; frame < left.length; frame++) {
    assert.ok(Math.abs(bytes.readInt16LE(44 + frame * 4) / 32768 - left[frame]) < 1 / 16000);
    assert.ok(Math.abs(bytes.readInt16LE(46 + frame * 4) / 32768 - right[frame]) < 1 / 16000);
  }
});

test('silence is passed safely and high-rate recording is memory bounded', () => {
  const Capture = processors.get('studio-capture'), capture = new Capture();
  const output = [new Float32Array(128).fill(1), new Float32Array(128).fill(1)];
  capture.process([[]], [output]);
  assert.ok(output.every(channel => channel.every(value => value === 0)));
  globalThis.sampleRate = 192000;
  const highRate = new Capture(); highRate.port.onmessage({ data: { type: 'start', id: 2 } });
  assert.equal(highRate.capture.take.limit, 12000000);
  highRate.port.onmessage({ data: { type: 'stop' } });
  globalThis.sampleRate = 48000;
});
