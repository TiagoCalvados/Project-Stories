import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {LiveLayers} from '../tcko2-layers.js';
const rate=44100,left=new Float32Array(128),right=new Float32Array(128);
function render(mix,blocks=20){let energy=0;for(let b=0;b<blocks;b++){mix.render(left,right);for(let i=0;i<left.length;i++){assert(Number.isFinite(left[i])&&Number.isFinite(right[i]));assert(Math.abs(left[i])<1&&Math.abs(right[i])<1);energy+=left[i]**2+right[i]**2;}}return energy;}
const mix=new LiveLayers(rate);mix.setPatch(0);const velvet=mix.current.synth;
mix.noteOn(48,100,0);render(mix);const originalVoice=velvet.voices.find(v=>v.active),phase=originalVoice.phase1;assert(Number.isFinite(phase));
mix.selectTechnology(2);mix.selectTechnology(6);mix.setPatch(13,true);mix.setPatch(10,true);
assert.equal(mix.status().count,5);assert.equal(mix.slots[0].synth,velvet);assert.equal(originalVoice.phase1,phase,'Adding does not restart the existing oscillator');
for(const slot of mix.slots.filter(s=>s.active))assert(slot.synth.activeNotes().includes(48),'Each sound must join the held note');
assert(render(mix)>0);mix.noteOn(60,90,0);assert.equal(mix.activeNotes().length,2);
for(const slot of mix.slots.filter(s=>s.active))assert.deepEqual(slot.synth.activeNotes().sort((a,b)=>a-b),[48,60]);
mix.setPatch(10,true);assert.equal(mix.status().count,5,'Reselecting a kept sound does not restart or duplicate it');
mix.control('hold',true);mix.noteOff(48,0);mix.noteOff(60,0);assert.equal(mix.activeNotes().length,2);mix.control('hold',false);assert.equal(mix.activeNotes().length,0);
mix.midi(0x90,52,100);mix.midi(0xb0,64,127);mix.midi(0x80,52,0);assert(mix.activeNotes().includes(52));mix.midi(0xb0,64,0);assert(!mix.activeNotes().includes(52));
const remove=mix.slots.find(s=>s.kind===1&&s.index===6);mix.noteOn(48,100,0);const untouched=mix.slots[0].synth.voices.find(v=>v.active&&v.note===48);
mix.remove(remove.id);assert.equal(mix.status().count,4);assert.equal(mix.slots[0].synth.voices.find(v=>v.active&&v.note===48),untouched);assert(render(mix)>0);
const saved=mix.saved(),restored=new LiveLayers(rate);assert(restored.restore(saved));assert.deepEqual(restored.saved(),saved);assert.equal(render(restored),0,'Restoring the stack never restores held notes');
const before=JSON.stringify(restored.saved());assert.equal(restored.restore({version:1,layers:[{kind:1,index:999,macros:[]}]}),false);assert.equal(JSON.stringify(restored.saved()),before);
mix.panic();assert.equal(render(mix),0);assert.equal(mix.status().count,4);mix.noteOn(48,100,0);mix.control('master',0);assert.equal(render(mix),0);mix.control('master',.2);assert(render(mix)>0);mix.fadeOut(1);render(mix,350);assert.equal(render(mix),0);assert.equal(mix.status().count,4);
console.log('PASS: additive selections across and within boxes; held chords, normal release, sustain, MIDI, removal, silent session restore, mute, Panic and fade');

// Glitch must transform the sum itself, with identical source engines on either side.
const dry=new LiveLayers(rate),wet=new LiveLayers(rate);
for(const rack of [dry,wet]){rack.setPatch(0);rack.selectTechnology(6);rack.setPatch(13,true);rack.noteOn(48,100,0);}
wet.control('glitchType',1);wet.control('glitch',true);wet.control('glitchAmount',1);
let difference=0;const dl=new Float32Array(128),dr=new Float32Array(128);for(let b=0;b<150;b++){dry.render(dl,dr);wet.render(left,right);for(let i=0;i<128;i++)difference+=Math.abs(dl[i]-left[i]);}
assert(difference>1);for(let s=0;s<3;s++)assert.equal(dry.slots[s].synth.voices.find(v=>v.active).phase1,wet.slots[s].synth.voices.find(v=>v.active).phase1);
assert.equal(wet.status().count,3,'Glitch is a mix processor, never another instrument');console.log('PASS: Glitch processes the complete live waveform while all source oscillators continue');

const full=new LiveLayers(rate);full.setPatch(0);for(let i=1;i<8;i++)full.selectTechnology(i);const keys=JSON.stringify(full.saved());assert.equal(full.selectTechnology(9),null);assert.equal(JSON.stringify(full.saved()),keys);
full.noteOn(48,100,0);full.noteOn(60,100,0);full.noteOn(64,100,0);assert.deepEqual(full.activeNotes(),[48,60]);
const begin=performance.now();render(full,Math.ceil(rate*3/128));const ms=performance.now()-begin;assert(ms<3000,`8 layers × 2 keys must render in real time (${ms}ms)`);
const phone=new LiveLayers(rate,4);phone.setPatch(0);for(let i=0;i<3;i++)phone.selectTechnology(i);assert.equal(phone.selectTechnology(7),null);assert.equal(phone.status().count,4);console.log(`PASS: capacity refuses extra layers/notes without stealing sounds; worst supported desktop chord renders 3s in ${(ms/1000).toFixed(2)}s`);

// Exercise the same processor and recording tap used by the browser.
let Processor;globalThis.sampleRate=rate;globalThis.AudioWorkletProcessor=class{constructor(){this.messages=[];this.port={postMessage:d=>this.messages.push(d)};}};globalThis.registerProcessor=(_,p)=>Processor=p;
await import('../tcko2-worklet.js');const worklet=new Processor(),send=data=>worklet.port.onmessage({data});
send({type:'layersRestore',saved});send({type:'recordStart',id:100,maximumFrames:rate});send({type:'noteOn',note:48,velocity:100,channel:0});const expected=[];
for(let b=0;b<40;b++){worklet.process([],[[left,right]]);for(let i=0;i<128;i++)expected.push(Math.round(Math.max(-1,Math.min(1,left[i]))*32767),Math.round(Math.max(-1,Math.min(1,right[i]))*32767));}
send({type:'recordStop',id:100});const recorded=worklet.messages.filter(m=>m.type==='recordingChunk').flatMap(m=>Array.from(new Int16Array(m.buffer)));assert.equal(recorded.length,expected.length);assert(recorded.some(x=>x!==0));assert(recorded.every((x,i)=>Math.abs(x-expected[i])<=1),'REC captures the combined post-effects performance');
console.log('PASS: worklet routes the restored stack and records the combined performed waveform');
