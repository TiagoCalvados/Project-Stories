export class SoundFileControls {
  constructor({ startAudio, getContext, send }) {
    this.startAudio=startAudio; this.getContext=getContext; this.send=send; this.revision=0;
    const byId=id=>document.getElementById(id);
    this.open=byId('open-sound');this.input=byId('sound-file-input');this.play=byId('play-sound');this.stop=byId('stop-sound');this.status=byId('sound-file-status');
    this.open.addEventListener('click',()=>this.input.click());
    this.input.addEventListener('change',()=>{const file=this.input.files[0];if(file)void this.load(file);});
    this.play.addEventListener('click',async()=>{if(await this.startAudio())this.send({type:'soundFile',action:'play'});});
    this.stop.addEventListener('click',()=>{this.cancelPendingAutoplay();this.send({type:'soundFile',action:'stop'});});
  }
  cancelPendingAutoplay(){this.revision++;}
  handleMessage(data){if(data.type!=='soundFile')return false;this.play.disabled=!data.loaded;this.stop.disabled=!data.playing;return true;}
  async load(file){
    const revision=this.revision;this.open.disabled=true;
    try {
      if(file.size>512*1024*1024)throw new Error('Choose a sound smaller than 512 MB.');
      if(!await this.startAudio())throw new Error('The audio engine could not start.');
      const decoded=await this.getContext().decodeAudioData(await file.arrayBuffer());
      if(!decoded.length || decoded.duration>1800 || decoded.numberOfChannels>2)throw new Error('Use a mono or stereo sound up to 30 minutes long.');
      const left=new Float32Array(decoded.getChannelData(0)),right=new Float32Array(decoded.getChannelData(decoded.numberOfChannels===1?0:1));
      this.send({type:'soundFile',action:'load',left,right,autoplay:revision===this.revision&&!document.hidden},[left.buffer,right.buffer]);
      this.status.textContent=`${file.name} · ${decoded.duration.toFixed(1)} s`;
    }catch(error){this.status.textContent=`Current sound kept. Could not open ${file.name}: ${error.message}`;}
    finally{this.open.disabled=false;this.input.value='';}
  }
}
