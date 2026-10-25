import {TECHNOLOGIES,TECHNOLOGY_LABELS,TECHNOLOGY_DESCRIPTIONS} from './tcko2-technologies.js';

export class TechnologyControls {
  constructor({send,startAudio}) {
    this.send=send;this.enabled=false;
    this.type=document.getElementById('technology-type');this.keyboard=document.getElementById('technology-keyboard');this.character=document.getElementById('technology-character');this.volume=document.getElementById('technology-volume');
    const placeholder=new Option('Choose a technology…','',true,true);placeholder.disabled=true;placeholder.hidden=true;this.type.add(placeholder);
    TECHNOLOGIES.forEach((name,i)=>{const option=new Option(TECHNOLOGY_LABELS[i],i);option.title=name;this.type.add(option);});
    try{const saved=JSON.parse(localStorage.getItem('tcko2-technologies')||'null');if(saved){this.enabled=saved.enabled===true;if(this.enabled)this.type.value=Math.max(0,Math.min(11,Math.round(saved.type||0))); this.character.value=Math.max(0,Math.min(100,saved.character??50));this.volume.value=Math.max(0,Math.min(100,saved.volume??35));}}catch{}
    this.type.addEventListener('change',async()=>{this.enabled=true;const selected=+this.type.value,character=+this.character.value/100,level=+this.volume.value/100;this.render();this.save();if(await startAudio())this.send({type:'technology',action:'configure',enabled:true,selected,character,level});});


    for(const input of [this.character,this.volume])input.addEventListener('input',()=>{this.sync();this.save();});
    this.render();
  }
  save(){try{localStorage.setItem('tcko2-technologies',JSON.stringify({type:+this.type.value,enabled:this.enabled,character:+this.character.value,volume:+this.volume.value}));}catch{}}
  render(){
    document.getElementById('technology-description').textContent=this.type.value===''?'Choose a sound to add it. Previous sounds stay in the mix.':TECHNOLOGY_DESCRIPTIONS[+this.type.value];this.type.title=this.type.value===''?'Add a sound technology':TECHNOLOGIES[+this.type.value];
    for(const [id,input] of [['technology-character-value',this.character],['technology-volume-value',this.volume]])document.getElementById(id).textContent=input.value+'%';
    this.keyboard.textContent=this.enabled?'Added to the keyboard mix':'Select a technology, then play keys';this.keyboard.setAttribute('aria-pressed',String(this.enabled));
  }
  sync(){this.render();this.send({type:'technology',action:'configure',enabled:this.enabled,selected:+this.type.value,character:+this.character.value/100,level:+this.volume.value/100});}
  deactivate(){this.enabled=false;this.render();this.save();}
  cancelPending(){}
  handleMessage(data){if(data.type!=='technologyStatus')return false;this.enabled=data.selected>=0;this.type.value=this.enabled?data.selected:'';if(this.enabled&&Number.isFinite(data.character)){this.character.value=Math.round(data.character*100);this.volume.value=Math.round(data.level*100);}this.render();return true;}
}
