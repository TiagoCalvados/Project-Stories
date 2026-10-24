// Original DATA RIOT synthesis. Arithmetic shared with SoundTechnologies.cs.
const TechnologyTables={Source:null};
export const TECHNOLOGIES=["Granular synthesis","Physical modelling","Spectral freezing","Modal resonance","Friction synthesis","Liquid simulation","Wavefolding","Frequency shifting","Convolution processing","Stochastic synthesis","Spatial modulation","Spectral morphing"];
export const TECHNOLOGY_LABELS=["Granular / grains","Vibrating objects","Frozen spectrum","Resonant metal","Friction / scrape","Liquid / bubbles","Wavefold","Frequency shift","Inside an object","Broken / random","Moving in stereo","Spectral morph"];
export const TECHNOLOGY_DESCRIPTIONS=["Pollock: scattered, windowed grains of an original impact.","Plucked digital waveguide: vibrating strings, from damp wood to ringing material.","Rothko: the held magnitude spectrum of an original impact.","Eight inharmonic resonators: struck metal, plates and stone.","Stick-slip excitation: rubbing and grinding a resonant surface.","Damped, rising bubble oscillators: drops and molten liquid.","A sine folded across multiple thresholds: electronic chaos.","Inharmonic metal partials shifted by the same frequency offset.","An original impact convolved with a short imaginary-object impulse response.","Seeded random events and a bounded pitch walk: broken beats.","A resonant scraping surface travelling through stereo space.","Interpolation between two original spectral envelopes: solid into liquid."];
export class TechnologyVoice {
    Playing=false;
    Left=0;Right=0;
    Type=0;Note=48;
    Character=.5;Level=.35;
    rate;frequency;phase=0;time=0;seed=123456789;gain=0;fade=1;fadeStep=0;
    low=0;previous=0;slip=0;walk=0;burst=0;nextEvent=0;
    cursor=0;pluckLength=100;grainSlot=0;tableStart=0;
    source=new Float64Array(2048);frozen=new Float64Array(16384);tableA=new Float64Array(16384);tableB=new Float64Array(16384);
    pluck=new Float64Array(4096);history=new Float64Array(256);impulse=new Float64Array(128);
    mode1=new Float64Array(8);mode2=new Float64Array(8);modeC=new Float64Array(8);modeR=new Float64Array(8);
    ages=new Float64Array(16);lengths=new Float64Array(16);starts=new Float64Array(16);speeds=new Float64Array(16);pans=new Float64Array(16);osc=new Float64Array(16);
    ratios=new Float64Array([1,1.593,2.135,2.917,3.598,4.421,5.713,7.271]);
    constructor(sampleRate){this.rate=sampleRate;if(TechnologyTables.Source==null){this.Prepare();TechnologyTables.Source=this.source;TechnologyTables.Frozen=this.frozen;TechnologyTables.A=this.tableA;TechnologyTables.B=this.tableB;}else{this.source=TechnologyTables.Source;this.frozen=TechnologyTables.Frozen;this.tableA=TechnologyTables.A;this.tableB=TechnologyTables.B;}this.Reset();}
    Random(){this.seed=(this.seed*1664525+1013904223)%4294967296.0;return this.seed/4294967296.0;}
    Noise(){return this.Random()*2-1;}
    Index(value){return Math.trunc(value);}
    Clamp(x,a,b){return Math.max(a,Math.min(b,x));}
    Read(data,index){index=index%data.length;if(index<0)index+=data.length;let i=Math.trunc(index);let a=index-i;return data[i]*(1-a)+data[(i+1)%data.length]*a;}
    Configure(selected,note,character,level){
        selected=this.Index(this.Clamp(selected,0,11));note=this.Index(this.Clamp(note,0,127));
        let restart=selected!=this.Type||note!=this.Note;
        this.Type=selected;this.Note=note;this.Character=this.Clamp(character,0,1);this.Level=this.Clamp(level,0,1);
        if(restart)this.Reset();
    }
    Play(enabled){this.Playing=enabled;if(enabled){this.Reset();this.fade=1;this.fadeStep=0;}}
    Repeat(){if(this.Playing)this.Reset();}
    Panic(){this.Playing=false;this.gain=0;this.Left=this.Right=0;this.fade=1;this.fadeStep=0;}
    FadeOut(seconds){this.fadeStep=1/(this.rate*this.Clamp(seconds,1,12));}
    Prepare(){
        for(let i=0;i<2048;i++){
            let t=i/2048.0;
            this.source[i]=(Math.sin(2*Math.PI*9*t)+.5*Math.sin(2*Math.PI*23*t)+this.Noise()*.25)*Math.exp(-t*7);
        }
        // A captured magnitude spectrum of a generated impact, held for Freeze.
        // Morph interpolates two this.phase-aligned spectral envelopes, not playback speed.
        for(let k=1;k<=48;k++){
            let re=0,im=0;
            for(let i=0;i<2048;i++){let a=2*Math.PI*k*i/2048;re+=this.source[i]*Math.cos(a);im-=this.source[i]*Math.sin(a);}
            let magnitude=2*Math.sqrt(re*re+im*im)/2048;
            for(let i=0;i<2048;i++){
                let wave=Math.sin(2*Math.PI*k*i/2048);
                for(let octave=0;octave<8;octave++)if(k<=Math.max(1,48/Math.pow(2,octave))){let at=octave*2048+i;this.frozen[at]+=wave*magnitude;this.tableA[at]+=wave/(k*k);this.tableB[at]+=wave*(k%3==0?.65/k:.08/k);}
            }
        }
    }
    Table(data){let index=this.phase*2048;let i=Math.trunc(index);let a=index-i;return data[this.tableStart+i]*(1-a)+data[this.tableStart+(i+1)%2048]*a;}
    Reset(){
        this.frequency=440*Math.pow(2,(this.Note-69)/12.0);this.phase=this.time=0;this.cursor=this.grainSlot=0;this.seed=123456789;
        this.tableStart=2048*this.Index(this.Clamp(Math.ceil(Math.log(this.frequency*48/(this.rate*.42))/Math.log(2)),0,7));
        this.nextEvent=this.burst=this.low=this.previous=this.slip=this.walk=0;this.fade=1;this.fadeStep=0;
        for(let i=0;i<16;i++){this.ages[i]=this.lengths[i]=this.osc[i]=0;}
        for(let i=0;i<4096;i++)this.pluck[i]=0;
        for(let i=0;i<256;i++)this.history[i]=0;
        this.pluckLength=this.Index(this.Clamp(this.rate/this.frequency,3,4095));
        for(let i=0;i<this.pluckLength;i++)this.pluck[i]=this.Noise()*.7;
        for(let i=0;i<8;i++){
            let f=Math.min(this.rate*.42,this.frequency*this.ratios[i]);
            this.modeR[i]=Math.exp(-1/(this.rate*(.15+1.1/(i+1))));
            this.modeC[i]=2*this.modeR[i]*Math.cos(2*Math.PI*f/this.rate);this.mode1[i]=this.mode2[i]=0;
        }
        for(let i=0;i<128;i++)this.impulse[i]=(Math.sin(i*.73*this.frequency/130.8128)+.5*Math.cos(i*1.37*this.frequency/130.8128))*Math.exp(-i/22.0)*.07;
    }
    Resonance(excitation){let sum=0;for(let i=0;i<8;i++){let y=excitation*.035/(i+1)+this.modeC[i]*this.mode1[i]-this.modeR[i]*this.modeR[i]*this.mode2[i];this.mode2[i]=this.mode1[i];this.mode1[i]=y;sum+=y;}return sum*.25;}
    Next(){
        this.Left=this.Right=0;if(!this.Playing&&this.gain<.000001){this.gain=0;return;}
        this.gain+=.002*((this.Playing?this.Level:0)-this.gain);
        if(this.fadeStep>0){this.fade=Math.max(0,this.fade-this.fadeStep);if(this.fade==0){this.Panic();return;}}
        let x=0,pan=0,c=this.Character,n=this.Noise();
        this.phase+=this.frequency/this.rate;if(this.phase>=1)this.phase-=1;
        this.time+=1/this.rate;
        switch(this.Type){
        case 0:
            if(this.nextEvent--<=0){let g=this.grainSlot++%16;this.ages[g]=0;this.lengths[g]=this.rate*(.018+.09*this.Random());this.starts[g]=this.Random()*1700;this.speeds[g]=(.3+this.Random()*2)*(this.Random()<.3?-1:1)*this.frequency/130.8128;this.pans[g]=this.Noise();this.nextEvent=this.rate/(6+c*90);}
            let l=0,r=0;
            for(let g=0;g<16;g++)if(this.ages[g]<this.lengths[g]){let envelope=.5-.5*Math.cos(2*Math.PI*this.ages[g]/this.lengths[g]);let s=this.Read(this.source,this.starts[g]+this.ages[g]*this.speeds[g])*envelope*.35;l+=s*Math.sqrt((1-this.pans[g])*.5);r+=s*Math.sqrt((1+this.pans[g])*.5);this.ages[g]++;}
            this.Left=l;this.Right=r;break;
        case 1:
            if(this.nextEvent--<=0){for(let i=0;i<this.pluckLength;i++)this.pluck[i]=this.Noise()*.7;this.nextEvent=this.rate*(1.2+.7*c);}
            let p=this.cursor%this.pluckLength;let value=this.pluck[p];this.pluck[p]=(value+this.pluck[(p+1)%this.pluckLength])*(.488+.011*c);this.cursor++;x=value*.5;break;
        case 2: x=this.Table(this.frozen)*(.6+.2*Math.sin(this.time*(.1+c)));pan=Math.sin(this.time*(.05+c*.4))*.6;break;
        case 3:
            let hit=0;if(this.nextEvent--<=0){hit=1;this.nextEvent=this.rate*(.2+this.Random()*(1.2-c));}x=this.Resonance(hit);break;
        case 4:
            this.slip+=(.0004+c*.005)*(1+.5*n);let force=0;if(this.slip>.025+this.Random()*.035){force=this.slip*12;this.slip*=.1;}this.low+=.03*(n-this.low);x=this.Resonance(force+(n-this.low)*(.08+c*.2))*.06;break;
        case 5:
            if(this.nextEvent--<=0){let g=this.grainSlot++%16;this.ages[g]=0;this.lengths[g]=this.rate*(.04+this.Random()*.22);this.starts[g]=this.frequency*(.7+this.Random()*4);this.osc[g]=0;this.pans[g]=this.Noise();this.nextEvent=this.rate/(2+c*35);}
            for(let g=0;g<16;g++)if(this.ages[g]<this.lengths[g]){let t=this.ages[g]/this.lengths[g];this.osc[g]+=2*Math.PI*Math.min(this.rate*.42,this.starts[g]*(1+t*.65))/this.rate;let s=Math.sin(this.osc[g])*Math.exp(-t*6)*.32;this.Left+=s*Math.sqrt((1-this.pans[g])*.5);this.Right+=s*Math.sqrt((1+this.pans[g])*.5);this.ages[g]++;}break;
        case 6:
            // Two sub-samples soften the folded edges before output filtering.
            for(let j=0;j<2;j++){let a=Math.sin(2*Math.PI*(this.phase+j*this.frequency/this.rate*.5))*(1+c*9);let folded=2*Math.abs(2*(a/4-Math.floor(a/4+.5)))-1;x+=folded*.4;}this.low+=.38*(x-this.low);x=this.low;break;
        case 7:
            if(this.nextEvent--<=0){this.burst=1;this.nextEvent=this.rate*(.7+c);}
            this.burst*=.99995;for(let k=1;k<=7;k++){let f=this.frequency*this.ratios[k-1]+(c*2-1)*173;if(Math.abs(f)<this.rate*.42)x+=Math.sin(2*Math.PI*f*this.time)/(k*k);}x*=.36*this.burst;break;
        case 8:
            this.burst*=.995;if(this.nextEvent--<=0){this.burst=1;this.nextEvent=this.rate*(.2+c*.9);}this.history[this.cursor%256]=n*this.burst;
            for(let k=0;k<128;k++){let back=(this.cursor-k+256)%256;x+=this.history[back]*this.impulse[k];}this.cursor=(this.cursor+1)%256;x*=1.5;break;
        case 9:
            if(this.nextEvent--<=0){this.walk=this.Clamp(this.walk+this.Noise()*.35,-1,1);this.burst=.4+this.Random()*.6;this.nextEvent=this.rate*(.025+this.Random()*(.5-.43*c));}this.burst*=.999;this.osc[0]+=this.frequency*Math.pow(2,this.walk*2)/this.rate;this.osc[0]%=1;x=Math.sin(2*Math.PI*this.osc[0])*this.burst*.4+n*this.burst*.06;pan=this.walk;break;
        case 10: this.low+=.02*(n-this.low);x=this.Resonance((n-this.low)*.06)*.16;pan=Math.sin(this.time*(.3+c*5));break;
        case 11:
            let morph=this.Clamp(c+.3*Math.sin(this.time*.5),0,1);x=(this.Table(this.tableA)*(1-morph)+this.Table(this.tableB)*morph)*.45;break;
        }
        if(this.Type!=0&&this.Type!=5){this.Left=x*Math.sqrt((1-pan)*.5);this.Right=x*Math.sqrt((1+pan)*.5);}
        // DC blocker also removes offsets introduced by asymmetric wavefolding.
        let mono=(this.Left+this.Right)*.5;this.previous+=.0008*(mono-this.previous);this.Left-=this.previous;this.Right-=this.previous;
        this.Left=this.Clamp(this.Left*this.gain*this.fade,-.8,.8);this.Right=this.Clamp(this.Right*this.gain*this.fade,-.8,.8);
    }
}
