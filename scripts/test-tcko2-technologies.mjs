import assert from 'node:assert/strict';
import {TechnologyVoice,TECHNOLOGIES} from '../tcko2-technologies.js';
import {performance} from 'node:perf_hooks';

const rate=44100,v=new TechnologyVoice(rate),identities=[];
for(let type=0;type<12;type++){
  v.Configure(type,48,.5,.35);v.Panic();v.Play(true);
  let energy=0,peak=0,signature=[];
  for(let i=0;i<rate*3;i++){v.Next();assert(Number.isFinite(v.Left)&&Number.isFinite(v.Right));assert(Math.abs(v.Left)<=.8&&Math.abs(v.Right)<=.8);energy+=v.Left*v.Left+v.Right*v.Right;peak=Math.max(peak,Math.abs(v.Left),Math.abs(v.Right));if(i%441===0)signature.push(v.Left);}
  assert(energy>.001);assert(peak<.8,'Default texture must not hit the limiter');identities.push(signature);
  for(const note of [24,96])for(const character of [0,1]){v.Configure(type,note,character,1);v.Play(true);for(let i=0;i<rate;i++){v.Next();assert(Number.isFinite(v.Left)&&Number.isFinite(v.Right));assert(Math.abs(v.Left)<=.8&&Math.abs(v.Right)<=.8);}}
  v.Play(false);for(let i=0;i<10000;i++)v.Next();assert.equal(v.Left,0);assert.equal(v.Right,0);
  v.Play(true);v.FadeOut(1);for(let i=0;i<rate+10;i++)v.Next();assert.equal(v.Playing,false);assert.equal(v.Left,0);
  console.log('PASS: '+TECHNOLOGIES[type]+' finite, audible PCM, no default clipping, extremes, independent stop and fade');
}
for(let a=0;a<12;a++)for(let b=0;b<a;b++)assert(identities[a].some((x,i)=>Math.abs(x-identities[b][i])>1e-5),'Textures must have different sample identities');
const begin=performance.now();v.Configure(8,48,1,1);v.Play(true);for(let i=0;i<rate*10;i++)v.Next();assert(performance.now()-begin<5000);console.log('PASS: different signal identities and render budget');

// Real note lifecycle, rather than a standalone audition source.
const {SynthEngine}=await import('../tcko2-engine.js');
const synth=new SynthEngine(rate);const left=new Float32Array(128),right=new Float32Array(128);
for(let type=0;type<12;type++){
  synth.selectTechnology(type);synth.panic();synth.render(left,right);assert(left.every(x=>x===0),'Selecting must be silent');
  synth.noteOn(48,100,0);synth.noteOn(60,100,0);let energy=0;
  for(let i=0;i<30;i++){synth.render(left,right);energy+=left.reduce((a,b)=>a+b*b,0);}assert(energy>0);assert.deepEqual(synth.activeNotes().sort((a,b)=>a-b),[48,60]);
  synth.noteOff(48,0);assert(!synth.activeNotes().includes(48)&&synth.activeNotes().includes(60));synth.noteOff(60,0);synth.panic();synth.render(left,right);assert(left.every(x=>x===0));
  synth.control('hold',true);synth.noteOn(48,100,0);synth.noteOff(48,0);assert(synth.activeNotes().includes(48));synth.control('hold',false);assert(!synth.activeNotes().includes(48));synth.panic();
}
console.log('PASS: all twelve keyboard technologies, silent selection, polyphony, note release, sustain and Panic');
let Processor;globalThis.sampleRate=rate;globalThis.AudioWorkletProcessor=class{constructor(){this.messages=[];this.port={postMessage:data=>this.messages.push(data)};}};globalThis.registerProcessor=(_,type)=>Processor=type;
await import('../tcko2-worklet.js');const worklet=new Processor();const send=data=>worklet.port.onmessage({data});
send({type:'technology',action:'configure',enabled:true,selected:5,character:.5,level:.6});worklet.process([],[[left,right]]);assert(left.every(x=>x===0));
send({type:'recordStart',id:77,maximumFrames:rate});send({type:'noteOn',note:48,velocity:100,channel:0});for(let i=0;i<30;i++)worklet.process([],[[left,right]]);send({type:'noteOff',note:48,channel:0});send({type:'recordStop',id:77});
assert(worklet.messages.some(m=>m.type==='recordingChunk'&&new Int16Array(m.buffer).some(x=>x!==0)));
send({type:'panic'});worklet.process([],[[left,right]]);assert(left.every(x=>x===0));send({type:'stop',value:true});send({type:'noteOn',note:48,velocity:100,channel:0});worklet.process([],[[left,right]]);assert(left.every(x=>x===0));
send({type:'stop',value:false});send({type:'control',name:'flow',value:true});send({type:'noteOn',note:48,velocity:100,channel:0});send({type:'technology',action:'configure',enabled:true,selected:6,character:.5,level:.6});assert(worklet.layers.slots.some(slot=>slot.active&&slot!==worklet.layers.current&&slot.synth.technologyType===5));assert.equal(worklet.synth.technologyType,6);assert.equal(worklet.synth.activeNotes().length,0);send({type:'noteOn',note:60,velocity:100,channel:0});assert(worklet.layers.activeNotes().includes(48)&&worklet.layers.activeNotes().includes(60));
send({type:'preset',index:0,preserve:true});assert.equal(worklet.synth.technologyType,-1);
console.log('PASS: worklet keyboard REC, Stop, keep-playing technology layers and return to normal presets');
