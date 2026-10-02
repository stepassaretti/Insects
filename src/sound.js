// Close-mic insect foley. Footfalls are individual taps sliced from the
// recordings in /Sounds and triggered by planted-foot transitions; wing
// flutter is procedural; the wasp flies on a looped hornet recording.
// Nothing plays before the first user interaction.
import footstepsA from '../Sounds/yodguard-giant-insect-footsteps-1-482548.mp3?url';
import footstepsB from '../Sounds/yodguard-giant-insect-footsteps-2-482547.mp3?url';
import footstepsC from '../Sounds/yodguard-giant-insect-footsteps-3-482549.mp3?url';
const footstepRecordings=[footstepsA,footstepsB,footstepsC];
import hornetFlight from '../Sounds/alex_jauk-hornet-flying-noise-600662.mp3?url';
const clamp01=value=>Math.max(0,Math.min(1,value));

// Finds each tap in a recording (2 ms peak envelope over an adaptive noise
// floor) and copies it into its own short, peak-normalized buffer.
function sliceFootsteps(ctx,buffer){
 const rate=buffer.sampleRate,channels=Array.from({length:buffer.numberOfChannels},(_,c)=>buffer.getChannelData(c));
 const win=Math.round(rate*.002),env=[];
 for(let start=0;start+win<=buffer.length;start+=win){let peak=0;for(const data of channels)for(let i=start;i<start+win;i++)peak=Math.max(peak,Math.abs(data[i]));env.push(peak);}
 const loudest=Math.max(...env),floor=[...env].sort((a,b)=>a-b)[Math.floor(env.length*.2)],threshold=Math.max(loudest*.12,floor*4);
 const onsets=[];
 for(let j=0;j<env.length;j++){
  if(env[j]<=threshold)continue;
  let k=j,peak=0;while(k<env.length&&(env[k]>threshold*.25||k-j<5)){peak=Math.max(peak,env[k]);k++;}
  onsets.push({at:j*win,peak});j=k+10;
 }
 return onsets.map((hit,n)=>{
  const start=Math.max(0,hit.at-Math.round(rate*.003));
  const next=n+1<onsets.length?onsets[n+1].at-Math.round(rate*.002):buffer.length;
  const length=Math.max(1,Math.min(next,hit.at+Math.round(rate*.055),buffer.length)-start);
  const fade=Math.min(length,Math.round(rate*.012)),gain=.9/hit.peak;
  const slice=ctx.createBuffer(channels.length,length,rate);
  channels.forEach((data,c)=>{const out=slice.getChannelData(c);for(let i=0;i<length;i++)out[i]=data[start+i]*gain*Math.min(1,(length-i)/fade);});
  return {buffer:slice,strength:hit.peak};
 });
}

export class CockroachSound {
 constructor(){
  this.context=null;this.muted=false;this.volume=.55;this.previousContacts=[];this.blocked=false;this.footsteps=[];this.lastRecording=-1;this.lastFootstep=null;this.species='cockroach';
  try{this.muted=localStorage.getItem('cockroach-muted')==='true';const saved=localStorage.getItem('cockroach-volume');if(saved!==null)this.volume=Math.max(0,Math.min(1,Number(saved)||0));}catch{}
 }
 async unlock(){
  if(!this.context){
   const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
   const ctx=this.context=new AudioContext();
   this.master=ctx.createGain();this.master.gain.value=0;
   const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-16;limiter.knee.value=10;limiter.ratio.value=5;limiter.attack.value=.003;limiter.release.value=.12;
   this.analyser=ctx.createAnalyser();this.analyser.fftSize=1024;
   this.master.connect(limiter).connect(this.analyser).connect(ctx.destination);
   this.noise=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);const samples=this.noise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
   const loop=()=>{const node=ctx.createBufferSource();node.buffer=this.noise;node.loop=true;node.start(0,Math.random()*2);return node;};
   const filter=(type,hz,q=.7)=>{const node=ctx.createBiquadFilter();node.type=type;node.frequency.value=hz;node.Q.value=q;return node;};
   // Fallback while recordings load: a sharp attack followed by tiny,
   // rapidly damped cuticle/floor resonances. No continuous scuff or hiss.
   this.footClicks=Array.from({length:8},(_,variant)=>{
    const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.014),ctx.sampleRate);
    const data=buffer.getChannelData(0);const pitch=1+(variant-3.5)*.045;
    for(let i=0;i<data.length;i++){
     const t=i/ctx.sampleRate,attack=Math.min(1,t/.00012);
     const impact=(Math.random()*2-1)*Math.exp(-t/.00038)*.48;
     const body=Math.sin(2*Math.PI*1850*pitch*t)*Math.exp(-t/.00145)*.34;
     const edge=Math.sin(2*Math.PI*4100*pitch*t)*Math.exp(-t/.00075)*.18;
     data[i]=attack*(impact+body+edge);
    }
    return buffer;
   });
   // Broadband papery flutter, amplitude-modulated at the animated wing rate.
   this.wings=ctx.createGain();this.wings.gain.value=0;
   const flutter=ctx.createGain();flutter.gain.value=.58;
   loop().connect(filter('highpass',220)).connect(filter('lowpass',5200)).connect(flutter).connect(this.wings);
   this.flap=ctx.createOscillator();this.flap.frequency.value=37.3;this.flap.type='sine';const modulation=ctx.createGain();modulation.gain.value=.39;this.flap.connect(modulation).connect(flutter.gain);this.flap.start();
   // A subdued harmonic body tone adds weight without a motor-like pure buzz.
   for(const [multiple,level]of [[2,.024],[3,.015],[5,.006]]){const osc=ctx.createOscillator();osc.type='sine';osc.frequency.value=37.3*multiple;const gain=ctx.createGain();gain.gain.value=level;osc.connect(gain).connect(this.wings);osc.start();}
   this.wings.connect(this.master);
   // Wasp buzz fallback until the hornet recording decodes: two slightly
   // detuned sawtooth wingbeat tones (~150 Hz) through
   // a soft low-pass, plus breathy band-passed air from the stroke.
   this.buzz=ctx.createGain();this.buzz.gain.value=0;
   const tone=filter('lowpass',2300,.8);
   this.buzzTones=[[1,.42],[1.007,.3],[2.003,.07]].map(([ratio,level])=>{const osc=ctx.createOscillator();osc.type='sawtooth';osc.frequency.value=150*ratio;osc.userData=ratio;const gain=ctx.createGain();gain.gain.value=level;osc.connect(gain).connect(tone);osc.start();return osc;});
   tone.connect(this.buzz);
   const air=ctx.createGain();air.gain.value=.3;loop().connect(filter('bandpass',1100,.7)).connect(air).connect(this.buzz);
   this.buzz.connect(this.master);
   void this.loadFootsteps();void this.loadHornet();
  }
  try{if(this.context.state==='suspended')await this.context.resume();}catch{}
 }
 async loadFootsteps(){
  const ctx=this.context;
  try{
   const decoded=await Promise.all(footstepRecordings.map(async url=>ctx.decodeAudioData(await (await fetch(url)).arrayBuffer())));
   // One pool per recording, each ranked quietest to hardest on its own, so
   // gait intensity picks a matching tap from every recording alike.
   this.footsteps=decoded.map(buffer=>sliceFootsteps(ctx,buffer).sort((a,b)=>a.strength-b.strength)).filter(taps=>taps.length);
  }catch{/* keep the synthesized clicks */}
 }
 // Wasp wings: the hornet recording, trimmed of its fade-in/out and looped
 // with an equal-power crossfade so the seam never clicks.
 async loadHornet(){
  const ctx=this.context;
  try{
   const source=await ctx.decodeAudioData(await (await fetch(hornetFlight)).arrayBuffer());
   const rate=source.sampleRate,start=Math.round(rate*.35),end=Math.round(source.length-rate*.35),fade=Math.round(rate*.25),length=end-start-fade;
   const loop=ctx.createBuffer(source.numberOfChannels,length,rate);let energy=0;
   for(let c=0;c<source.numberOfChannels;c++){const input=source.getChannelData(c),output=loop.getChannelData(c);for(let i=0;i<length;i++){let v=input[start+i];if(i<fade){const k=i/fade;v=v*Math.sin(k*Math.PI/2)+input[end-fade+i]*Math.cos(k*Math.PI/2);}output[i]=v;energy+=v*v;}}
   const level=.12/Math.sqrt(energy/(length*source.numberOfChannels));
   const player=ctx.createBufferSource();player.buffer=loop;player.loop=true;
   this.hornet=ctx.createGain();this.hornet.gain.value=0;this.hornetRate=player.playbackRate;
   const trim=ctx.createGain();trim.gain.value=level;player.connect(trim).connect(this.hornet).connect(this.master);player.start();
  }catch{/* keep the synthesized buzz */}
 }
 setSpecies(id){this.species=id;}
 setMuted(value){this.muted=value;try{localStorage.setItem('cockroach-muted',String(value));}catch{}if(value)this.silence();}
 setVolume(value){this.volume=Math.max(0,Math.min(1,value));try{localStorage.setItem('cockroach-volume',String(this.volume));}catch{}}
 silence(){if(!this.context)return;this.master.gain.setTargetAtTime(0,this.context.currentTime,.015);}
 contact(leg,speed){
  const ctx=this.context;
  // A few milliseconds between the three contacts preserves the tripod rhythm
  // while resolving it into small individual feet instead of one chunky clap.
  const now=ctx.currentTime+Math.floor(leg.index/2)*.004+Math.random()*.0015;
  const source=ctx.createBufferSource(),gain=ctx.createGain();
  if(this.footsteps.length){
   // Each footfall switches to a different recording, mixing all three evenly.
   // Scuttling draws from its light taps; running shifts toward heavy strikes,
   // louder and slightly quicker. Never the same slice twice in a row.
   const run=clamp01((speed-4)/6),pools=this.footsteps;
   let recording=Math.floor(Math.random()*pools.length);
   if(pools.length>1&&recording===this.lastRecording)recording=(recording+1+Math.floor(Math.random()*(pools.length-1)))%pools.length;
   const taps=pools[recording];
   let index=Math.round(clamp01(.22+run*.62+(Math.random()-.5)*.44)*(taps.length-1));
   if(taps[index].buffer===this.lastFootstep)index=(index+1)%taps.length;
   this.lastRecording=recording;this.lastFootstep=taps[index].buffer;source.buffer=this.lastFootstep;
   source.playbackRate.value=(1+run*.08)*(.94+Math.random()*.12);
   // Wasp tarsi are lighter: quieter, brighter taps from the same recordings.
   const light=this.species==='wasp';
   if(light)source.playbackRate.value*=1.18;
   gain.gain.value=(.07+clamp01(speed/4)*.08+run*.13)*(.82+Math.random()*.3)*(light?.62:1);
  }else{
   source.buffer=this.footClicks[Math.floor(Math.random()*this.footClicks.length)];source.playbackRate.value=.95+Math.random()*.1;
   gain.gain.value=(.112+Math.min(speed/10,1)*.105)*(.86+Math.random()*.23);
  }
  const pan=ctx.createStereoPanner();pan.pan.value=leg.side*.22;
  source.connect(gain).connect(pan).connect(this.master);source.start(now);
  source.onended=()=>{source.disconnect();gain.disconnect();pan.disconnect();};
 }
 update({speed,turn,legs,wingSpread,paused,hidden}){
  const contacts=legs.map(leg=>leg.planted);
  if(!this.context){this.previousContacts=contacts;return;}
  const ctx=this.context,now=ctx.currentTime;
  const silent=this.muted||paused||hidden||this.blocked;
  this.master.gain.setTargetAtTime(silent?0:this.volume,now,.025);
  const wingLevel=wingSpread<.05?0:Math.pow(wingSpread,1.4)*.23,wasp=this.species==='wasp';
  this.wings.gain.setTargetAtTime(silent||wasp?0:wingLevel,now,.03);
  // The recorded hornet spins up in pitch as the wings open; the synthesized
  // buzz only covers the moment before the recording has decoded.
  this.buzz.gain.setTargetAtTime(silent||!wasp||this.hornet?0:wingLevel*.62,now,.03);
  if(this.hornet){this.hornet.gain.setTargetAtTime(silent||!wasp?0:wingLevel*1.8,now,.03);this.hornetRate.setTargetAtTime(.84+wingSpread*.16,now,.06);}
  const pitch=118+wingSpread*38+Math.sin(now*5.3)*2.5;for(const osc of this.buzzTones)osc.frequency.setTargetAtTime(pitch*osc.userData,now,.05);
  if(!silent&&ctx.state==='running')for(let i=0;i<legs.length;i++)if(contacts[i]&&this.previousContacts[i]===false)this.contact(legs[i],Math.abs(speed)+Math.abs(turn));
  this.previousContacts=contacts;
 }
}
