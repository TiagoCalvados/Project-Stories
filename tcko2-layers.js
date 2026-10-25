import {TECHNOLOGY_LABELS} from './tcko2-technologies.js';
import {SynthEngine,PATCHES,SliceEffects} from './tcko2-engine.js';
const ceiling=x=>{const a=Math.abs(x);return a<=.8?x:Math.sign(x)*(.8+.15*(1-Math.exp(-(a-.8)/.15)));};
const clip=(x,a,b)=>Math.max(a,Math.min(b,Number.isFinite(x)?x:a));
const shared=['master','pitch','clarity','bloom','echo','hold','drone'];
const effectControls=['glitch','fragments','glitchAmount','fragmentsAmount','glitchVolume','glitchType'];
export class LiveLayers {
 constructor(rate,voiceLimit=8,emit=()=>{}){
  this.rate=rate;this.voiceLimit=voiceLimit<=4?8:16;this.emit=emit;this.enabled=true;
  this.slots=Array.from({length:voiceLimit<=4?4:8},(_,id)=>({id,synth:new SynthEngine(rate,8),active:false,retiring:false,gain:0,kind:0,index:3}));
  this.mainIndex=3;this.current=this.slots[0];this.current.active=true;this.current.gain=1;this.technology=null;
  this.keys=new Map();this.pedals=new Uint8Array(18);this.bends=new Float64Array(18);
  this.global={master:.2,pitch:0,clarity:true,bloom:.75,echo:.85,hold:false,drone:false,glitch:false,fragments:false,glitchAmount:.65,fragmentsAmount:.65,glitchVolume:2,glitchType:0};
  this.mixEffects=new SliceEffects(rate);this.glitchSmooth=this.fragmentsSmooth=0;this.volumeSmooth=2;this.noteFrequency=220;
  this.fadeFrames=0;this.fadeGain=1;this.stopped=false;this.left=new Float32Array(128);this.right=new Float32Array(128);this.peak=this.invalidSamples=0;
  for(const slot of this.slots)this.configure(slot);
 }
 configure(slot){for(const name of shared)slot.synth.control(name,this.global[name]);slot.synth.control('flow',false);slot.synth.stopped=this.stopped;slot.synth.bends.set(this.bends);slot.synth.pedals.set(this.pedals);}
 name(slot){return slot.kind===1?TECHNOLOGY_LABELS[slot.index]:PATCHES[slot.index].name;}
 settings(){return {preset:this.mainIndex,macros:Array.from(this.current.synth.target),flow:this.enabled,...this.global};}
 get selectedTechnologyType(){return this.technology?.active&&!this.technology.retiring?this.technology.index:-1;}
 saved(){return {version:1,mainPreset:this.mainIndex,current:{kind:this.current.kind,index:this.current.index},technology:this.selectedTechnologyType,layers:this.slots.filter(s=>s.active&&!s.retiring).map(s=>({kind:s.kind,index:s.index,character:s.synth.technologyCharacter??.5,level:s.synth.technologyLevel??.35,macros:Array.from(s.synth.target)}))};}
 status(message='',rejected=false){const active=this.slots.filter(s=>s.active&&!s.retiring);return {type:'layers',enabled:this.enabled,count:active.length,maximum:this.slots.length,voiceLimit:this.voiceLimit,message,rejected,current:this.settings(),saved:this.saved(),kept:active.map(s=>({id:s.id,kind:s.kind,index:s.index,name:this.name(s),glitch:'',fragments:false}))};}
 notify(message='',rejected=false){this.emit(this.status(message,rejected));}
 seed(slot){if(this.stopped)return;for(const key of this.keys.values()){slot.synth.noteOn(key.note,key.velocity,key.channel);if(!key.down)slot.synth.noteOff(key.note,key.channel);}}
 add(kind,index,macros){
  const existing=this.slots.find(s=>s.active&&!s.retiring&&s.kind===kind&&s.index===index);
  if(existing){this.current=existing;if(kind===0)this.mainIndex=index;if(kind===1)this.technology=existing;this.notify('Already in the mix: '+this.name(existing));return existing;}
  let next=this.slots.find(s=>!s.active);const count=this.slots.filter(s=>s.active&&!s.retiring).length;
  if(!this.enabled){next=this.current;next.synth.panic();}
  if(!next||(this.enabled?count+1:count)*this.keys.size>this.voiceLimit){this.notify('Mix is full. Remove a layer or release notes; previous sounds were kept.',true);return null;}
  next.synth.setPatch(kind===1?3:index);if(kind===1)next.synth.selectTechnology(index);this.configure(next);
  if(Array.isArray(macros))macros.forEach((x,i)=>next.synth.set(i,x));
  next.kind=kind;next.index=index;if(kind===0)this.mainIndex=index;next.active=true;next.retiring=false;next.gain=this.keys.size?0:1;this.current=next;if(kind===1)this.technology=next;
  this.seed(next);this.notify('Added '+this.name(next)+'. All layers follow the same keys.');return next;
 }
 setPatch(index,preserve=false,macros){
  index=Math.round(clip(index,0,PATCHES.length-1));
  if(!preserve){for(const slot of this.slots){slot.synth.panic();slot.active=false;slot.retiring=false;slot.gain=0;}this.keys.clear();this.technology=null;this.current=this.slots[0];}
  this.add(PATCHES[index].vintage?2:0,index,macros);
 }
 selectTechnology(index){return this.add(1,Math.round(clip(index,0,11)));}
 set(index,value){this.current.synth.set(index,value);this.notify();}
 control(name,value){
  if(name==='flow'){this.enabled=Boolean(value);this.notify();return;}
  if(effectControls.includes(name)){
   const ranges={glitchAmount:[0,1],fragmentsAmount:[0,1],glitchVolume:[0,4],glitchType:[0,6]};
   if(name==='glitch'||name==='fragments')this.global[name]=Boolean(value);else this.global[name]=clip(value,...ranges[name]);
   if(name==='glitchType'){this.global[name]=Math.round(this.global[name]);this.mixEffects.resetGlitch();}this.notify();return;
  }
  if(name==='technologyCharacter'||name==='technologyLevel'){if(this.technology?.active){this.technology.synth.control(name,value);this.notify();}return;}
  if(!shared.includes(name))return;
  if(name==='hold'||name==='drone'){this.global[name]=Boolean(value);if(value)this.global[name==='hold'?'drone':'hold']=false;}
  else this.global[name]=value;
  for(const slot of this.slots){slot.synth.control(name,value);if((name==='hold'||name==='drone')&&value)slot.synth.control(name==='hold'?'drone':'hold',false);}
  this.releaseUnheld();this.notify();
 }
 releaseUnheld(){for(const [id,key] of this.keys)if(!key.down&&!this.global.hold&&!this.global.drone&&!this.pedals[key.channel])this.keys.delete(id);}
 voiceCount(){return this.slots.reduce((n,s)=>n+(s.active?s.synth.voices.filter(v=>v.active).length:0),0);}
 noteOn(note,velocity=100,channel=16){
  if(!Number.isInteger(note)||note<0||note>127||!Number.isInteger(channel)||channel<0||channel>17||this.stopped)return;
  if(velocity<=0){this.noteOff(note,channel);return;}const id=channel*128+note,existing=this.keys.get(id),active=this.slots.filter(s=>s.active&&!s.retiring);
  if(this.global.drone&&existing&&!existing.down){this.keys.delete(id);for(const slot of active){slot.synth.noteOn(note,velocity,channel);slot.synth.noteOff(note,channel);}return;}
  if(!active.length){this.notify('Select a sound to add a layer.');return;}
  if(!existing&&(this.keys.size>=8||(this.keys.size+1)*active.length>this.voiceLimit)){this.notify('All mix voices are in use. Release notes or remove a layer; old notes were kept.');return;}
  this.keys.set(id,{note,velocity,channel,down:true});this.fadeFrames=0;this.fadeGain=1;this.noteFrequency=440*2**((note-69)/12);
  for(const slot of active)slot.synth.noteOn(note,velocity,channel);
 }
 noteOff(note,channel=16){const key=this.keys.get(channel*128+note);if(key)key.down=false;for(const slot of this.slots)if(slot.active)slot.synth.noteOff(note,channel);this.releaseUnheld();}
 releaseKeys(channel){for(const key of [...this.keys.values()])if(key.channel===channel)this.noteOff(key.note,channel);}
 midi(status,note,value){const command=status&240,channel=status&15;if(command===144)this.noteOn(note,value,channel);else if(command===128)this.noteOff(note,channel);else{
  if(command===224)this.bends[channel]=((note+value*128)-8192)/8192*2;
  if(command===176&&note===64)this.pedals[channel]=value>=64?1:0;
  if(command===176&&(note===120||note===123)){this.pedals[channel]=0;for(const [id,key]of this.keys)if(key.channel===channel)this.keys.delete(id);}
  if(command===176&&note===121){this.pedals[channel]=0;this.bends[channel]=0;}
  for(const slot of this.slots)if(slot.active)slot.synth.midi(status,note,value);this.releaseUnheld();
 }}
 remove(id){const slot=this.slots.find(s=>s.id===id&&s.active&&!s.retiring);if(slot){slot.retiring=true;if(this.current===slot)this.current=this.slots.find(s=>s.active&&!s.retiring)||this.slots.find(s=>!s.active)||slot;if(this.technology===slot)this.technology=this.slots.filter(s=>s.active&&!s.retiring&&s.kind===1).at(-1)||null;this.notify('Removing that layer; the others keep playing.');}}
 clear(){for(const slot of this.slots)if(slot.active&&slot!==this.current)slot.retiring=true;if(this.technology?.retiring)this.technology=this.current.kind===1?this.current:null;this.notify('Earlier layers removed; the selected sound remains.');}
 panic(){for(const slot of this.slots)slot.synth.panic();this.keys.clear();this.pedals.fill(0);this.bends.fill(0);this.global.hold=this.global.drone=this.global.glitch=this.global.fragments=false;this.glitchSmooth=this.fragmentsSmooth=0;this.mixEffects.clear();this.fadeFrames=0;this.fadeGain=1;this.notify('Notes stopped; your sound layers are kept.');}
 stop(value){if(value)this.panic();this.stopped=Boolean(value);for(const slot of this.slots)slot.synth.stopped=this.stopped;}
 fadeOut(seconds){this.fadeFrames=Math.max(1,Math.round(clip(seconds,1,12)*this.rate));this.fadeStep=this.fadeGain/this.fadeFrames;}
 activeNotes(){return [...new Set([...this.keys.values()].map(key=>key.note))];}
 restore(data){
  const saved=Array.isArray(data)?data:data?.version===1?data.layers:null;
  if(!Array.isArray(saved)||saved.length>this.slots.length||saved.some(s=>![0,1,2].includes(s.kind)||!Number.isInteger(s.index)||s.index<0||s.index>=(s.kind===1?12:PATCHES.length)||!Array.isArray(s.macros)||s.macros.length!==8||s.macros.some(x=>!Number.isFinite(x)||x<0||x>1))){this.notify('Saved mix exceeds this device capacity or contains invalid settings; current layers were kept.',true);return false;}
  for(const slot of this.slots){slot.synth.panic();slot.active=slot.retiring=false;slot.gain=0;}this.keys.clear();this.technology=null;
  const stacking=this.enabled;this.enabled=true;for(const item of saved){const slot=this.add(item.kind,item.index,item.macros);if(slot&&item.kind===1){slot.synth.control('technologyCharacter',clip(item.character,0,1));slot.synth.control('technologyLevel',clip(item.level,0,1));}}
  this.enabled=stacking;const selected=this.slots.find(s=>s.active&&!s.retiring&&s.kind===data?.current?.kind&&s.index===data?.current?.index);if(selected)this.current=selected;const technology=this.slots.find(s=>s.active&&!s.retiring&&s.kind===1&&s.index===data?.technology);if(technology)this.technology=technology;if(this.slots.some(s=>s.active&&s.kind===0&&s.index===data?.mainPreset))this.mainIndex=data.mainPreset;this.notify('Sound layers restored. Play the keys to begin.');return true;
 }
 render(left,right){
  if(this.left.length!==left.length){this.left=new Float32Array(left.length);this.right=new Float32Array(right.length);}left.fill(0);right.fill(0);
  let changed=false;for(const slot of this.slots){if(!slot.active)continue;slot.synth.render(this.left,this.right);for(let i=0;i<left.length;i++){slot.gain+=.006*((slot.retiring?0:1)-slot.gain);if(slot.retiring&&slot.gain<.000001)slot.gain=0;left[i]+=this.left[i]*slot.gain;right[i]+=this.right[i]*slot.gain;}if(slot.retiring&&slot.gain===0){slot.synth.panic();slot.active=slot.retiring=false;changed=true;}}
  let peak=0;for(let i=0;i<left.length;i++){
   this.glitchSmooth+=.0018*((this.global.glitch?this.global.glitchAmount:0)-this.glitchSmooth);this.fragmentsSmooth+=.0018*((this.global.fragments?this.global.fragmentsAmount:0)-this.fragmentsSmooth);this.volumeSmooth+=.0018*(this.global.glitchVolume-this.volumeSmooth);
   this.mixEffects.process(left[i],right[i],this.glitchSmooth,this.fragmentsSmooth,this.global.glitchType,this.volumeSmooth,this.global.clarity?this.noteFrequency:220);
   if(this.fadeFrames>0){this.fadeGain=Math.max(0,this.fadeGain-this.fadeStep);if(--this.fadeFrames===0){this.panic();this.fadeGain=0;}}
   left[i]=this.stopped||this.global.master===0?0:ceiling(this.mixEffects.outputLeft*this.fadeGain);right[i]=this.stopped||this.global.master===0?0:ceiling(this.mixEffects.outputRight*this.fadeGain);peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
  }
  this.peak=peak;this.invalidSamples=this.slots.reduce((n,s)=>n+s.synth.invalidSamples,0);if(changed)this.notify();
 }
}
