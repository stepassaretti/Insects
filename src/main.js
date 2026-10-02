import {CockroachSound} from './sound.js';
import {createCockroach} from './cockroach.js';
import {createMantis} from './mantis.js';
import {createWasp} from './wasp.js';
import {setupTouchControls} from './touch-controls.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import './style.css';
import {params,CockroachController,IdleBehaviour,clamp} from './simulation.js';
const sound=new CockroachSound();
const canvas=document.querySelector('#scene');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,stencil:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0xd9ddd5);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xd9ddd5,25,90);
const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.05,160);let portraitLayout=innerHeight>innerWidth;camera.position.set(0,portraitLayout?20:15,1.1);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.enablePan=false;controls.enableRotate=false;controls.minDistance=12;controls.maxDistance=40;controls.maxPolarAngle=Math.PI*.47;controls.target.set(0,.4,0);
scene.add(new THREE.HemisphereLight(0xf3f5e7,0x706450,2.4));const sun=new THREE.DirectionalLight(0xffedce,4.3);sun.position.set(-5,10,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:.1,far:30});sun.shadow.normalBias=.018;sun.shadow.bias=-.0002;sun.shadow.radius=4;scene.add(sun,sun.target);const fill=new THREE.DirectionalLight(0xe1ecff,1.1);fill.position.set(4,3,-6);scene.add(fill);
// Infinite ground: finite floor and grid patches that follow the camera
// (see animate). Only the area around the view is ever drawn; fog hides the rim.
const GROUND_SIZE=600,GRAIN_TILE=2;
const floor=new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE,GROUND_SIZE),new THREE.MeshStandardMaterial({color:0xc3c9b8,roughness:.94}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const grainCanvas=document.createElement('canvas');grainCanvas.width=grainCanvas.height=128;const grainContext=grainCanvas.getContext('2d');const grain=grainContext.createImageData(128,128);for(let i=0;i<grain.data.length;i+=4){const value=225+Math.floor(Math.random()*25);grain.data[i]=grain.data[i+1]=grain.data[i+2]=value;grain.data[i+3]=255;}grainContext.putImageData(grain,0,0);const grainTexture=new THREE.CanvasTexture(grainCanvas);grainTexture.wrapS=grainTexture.wrapT=THREE.RepeatWrapping;grainTexture.repeat.set(GROUND_SIZE/GRAIN_TILE,GROUND_SIZE/GRAIN_TILE);floor.material.map=grainTexture;floor.material.bumpMap=grainTexture;floor.material.bumpScale=.012;floor.material.needsUpdate=true;
// Background grid (1-unit cells, darker centre axes). WebGL ignores line
// width, so it is drawn in a shader: anti-aliased lines of constant on-screen
// width, with the same colours, opacity and fog as the former GridHelper.
const GRID_STROKE=2;
const grid=new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE,GROUND_SIZE),new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
 uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{lineColor:{value:new THREE.Color(0xa7b09c)},axisColor:{value:new THREE.Color(0x9ba58e)},opacity:{value:.359},stroke:{value:GRID_STROKE}}]),
 vertexShader:`#include <fog_pars_vertex>
varying vec2 vGrid;
void main(){vec4 world=modelMatrix*vec4(position,1.);vGrid=world.xz;vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
 fragmentShader:`uniform vec3 lineColor;uniform vec3 axisColor;uniform float opacity;uniform float stroke;
#include <common>
#include <fog_pars_fragment>
varying vec2 vGrid;
float lineAlpha(vec2 distance){vec2 px=distance/fwidth(vGrid);float d=min(px.x,px.y);return 1.-smoothstep(stroke*.5-.5,stroke*.5+.5,d);}
void main(){
 float cell=lineAlpha(abs(fract(vGrid-.5)-.5)),axis=lineAlpha(abs(vGrid));
 float alpha=max(cell,axis);if(alpha<.001)discard;
 gl_FragColor=vec4(mix(lineColor,axisColor,axis),alpha*opacity);
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`}));
grid.rotation.x=-Math.PI/2;grid.position.y=.001;scene.add(grid);
const controller=new CockroachController(),idle=new IdleBehaviour();
// All specimens are built once; the tab switch only swaps which is visible.
const species={cockroach:createCockroach(controller),wasp:createWasp(controller),mantis:createMantis(controller)};
for(const s of Object.values(species)){s.group.visible=false;scene.add(s.group);}
// Gait-panel silhouettes: each specimen is posed at rest and rendered once from
// directly above in solid black, then the six leg dots are placed on its feet
// (the mantis forelegs, which never touch the ground, get dots by its wrists).
// Meshes in `silhouetteSkip` (long antennae) don't count when framing, so the
// body fills the box and they are simply cropped at its edge.
const SILHOUETTE={width:98,height:112,pad:3,scale:4};
function buildSilhouette(specimen){
 const rest={idle:{adjust:-1,creep:0},debug:false,flying:false};
 specimen.group.visible=true;specimen.reset();for(let i=0;i<4;i++)specimen.update(1/60,.5+i/60,rest);specimen.group.updateMatrixWorld(true);
 const box=new THREE.Box3(),part=new THREE.Box3();
 const skip=new Set(specimen.silhouetteSkip??[]);
 specimen.group.traverseVisible(o=>{if(o.isMesh&&!o.isInstancedMesh&&!skip.has(o)){part.setFromObject(o,true);if(!part.isEmpty())box.union(part);}});
 const {width,height,pad,scale}=SILHOUETTE,spanX=box.max.x-box.min.x,spanZ=box.max.z-box.min.z;
 const unit=Math.min((width-2*pad)/spanX,(height-2*pad)/spanZ);
 const cropped=skip.size>0,w=cropped?width:Math.round(spanX*unit+2*pad),h=cropped?height:Math.round(spanZ*unit+2*pad),cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2;
 const camera=new THREE.OrthographicCamera(-w/2/unit,w/2/unit,h/2/unit,-h/2/unit,.1,50);camera.up.set(0,0,-1);camera.position.set(cx,box.max.y+10,cz);camera.lookAt(cx,0,cz);
 const target=new THREE.WebGLRenderTarget(w*scale,h*scale),pixels=new Uint8Array(w*scale*h*scale*4);
 const saved={fog:scene.fog,clear:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha()};
 scene.fog=null;scene.overrideMaterial=new THREE.MeshBasicMaterial({color:0x14170f,side:THREE.DoubleSide});floor.visible=grid.visible=false;
 renderer.setClearColor(0x000000,0);renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,w*scale,h*scale,pixels);renderer.setRenderTarget(null);
 scene.fog=saved.fog;scene.overrideMaterial.dispose();scene.overrideMaterial=null;floor.visible=grid.visible=true;renderer.setClearColor(saved.clear,saved.alpha);target.dispose();
 // Flip rows (GL is bottom-up) and downsample to a 2x image for crisp edges.
 const big=document.createElement('canvas');big.width=w*scale;big.height=h*scale;const image=big.getContext('2d').createImageData(w*scale,h*scale);
 for(let y=0;y<h*scale;y++)image.data.set(pixels.subarray((h*scale-1-y)*w*scale*4,(h*scale-y)*w*scale*4),y*w*scale*4);
 big.getContext('2d').putImageData(image,0,0);
 const out=document.createElement('canvas');out.width=w*2;out.height=h*2;const ctx=out.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(big,0,0,w*2,h*2);
 const toPixel=(x,z)=>[(x-cx)*unit+w/2,(z-cz)*unit+h/2];
 const dots=specimen.legs.map(l=>l.foot?toPixel(l.foot.x,l.foot.z):toPixel(cx+l.side*.55,-1.8));
 specimen.group.visible=false;specimen.reset();
 return {url:out.toDataURL(),width:w,height:h,dots};
}
const silhouettes=Object.fromEntries(Object.entries(species).map(([id,s])=>[id,buildSilhouette(s)]));
let active=species.cockroach;
let paused=false,debug=false,view='overhead',t=0,last=performance.now(),frame=0,fpsTime=0;const previousPosition=new THREE.Vector3();let dragging=false;controls.addEventListener('start',()=>dragging=true);controls.addEventListener('end',()=>dragging=false);
function animate(now){requestAnimationFrame(animate);const elapsed=Math.min((now-last)/1000,.05);last=now;let dt=paused?0:elapsed;if(dt){t+=dt;idle.update(t,controller.active);previousPosition.copy(controller.position);controller.update(dt,idle);active.update(dt,t,{idle,debug,flying:controller.flight.wingsActive});
// The camera rises with the insect, so in flight the ground, grid and shadow
// recede and shrink; it also tracks faster to keep up with flight speed.
const desiredTarget=controller.position.clone().add(new THREE.Vector3(0,.25,0));const followDelta=desiredTarget.clone().sub(controls.target).multiplyScalar(1-Math.exp(-dt*(7+10*controller.flight.blend)));camera.position.add(followDelta);controls.target.add(followDelta);
// Keep the ground under the view. The floor snaps to whole texture tiles so its
// grain stays fixed in the world; grid lines come from world coordinates.
floor.position.set(Math.round(controls.target.x/GRAIN_TILE)*GRAIN_TILE,0,Math.round(controls.target.z/GRAIN_TILE)*GRAIN_TILE);grid.position.set(controls.target.x,.001,controls.target.z);
// The sun steepens toward overhead as the insect climbs, so its shadow stays
// in view below it, shrinking with distance along with the grid.
const slant=1/(1+controller.flight.altitude*.3);sun.position.copy(controller.position).add(new THREE.Vector3(-5*slant,10,4*slant));sun.target.position.copy(controller.position);}
controls.update();const zoomOut=Math.max(0,camera.position.distanceTo(controls.target)-20);const altitude=controller.flight.altitude;scene.fog.near=25+zoomOut+altitude*1.2;scene.fog.far=90+zoomOut*2+altitude*2; // Screen-space offset leaves room for the instrumentation.
if(portraitLayout)camera.setViewOffset(innerWidth,innerHeight,0,innerHeight*.04,innerWidth,innerHeight);else camera.setViewOffset(innerWidth,innerHeight,-innerWidth*.09,innerHeight*.015,innerWidth,innerHeight);
sound.update({speed:controller.speed,turn:controller.turn,legs:active.legs,wingSpread:active.wings.soundLevel??active.wings.motion.spread,paused,hidden:document.hidden});
renderer.render(scene,camera);frame++;fpsTime+=elapsed;if(frame%6===0){touchControls?.setToggleStates(touchState());document.querySelector('#speed').textContent=(Math.abs(controller.speed)/active.bodyLength).toFixed(2);document.querySelector('#speedbar').style.width=`${clamp(Math.abs(controller.speed)/(controller.topSpeed||params.sprintSpeed)*100,0,100)}%`;const words=copy[active.id].states;document.querySelector('#state').textContent=paused?'PAUSED':active.attacking?'STRIKING':active.stinging?'STINGING':controller.flight.altitude>.05?(controller.flight.landing?'LANDING':'FLYING'):active.wings.motion.spread>.5&&words.wings?words.wings:Math.abs(controller.speed)>(controller.walkSpeed??params.walkSpeed)*1.2?words.fast:Math.abs(controller.speed)>.1?words.walk:Math.abs(controller.turn)>.1?'TURNING':'EXPLORING';document.querySelectorAll('.gait b').forEach((el,i)=>{el.style.background=active.legs[i].planted?'currentColor':'transparent';});}if(fpsTime>.5){document.querySelector('#fps').textContent=Math.round(frame/fpsTime);frame=0;fpsTime=0;}}
requestAnimationFrame(animate);
const movementCodes=['KeyW','KeyA','KeyS','KeyD','KeyC','KeyF','KeyG','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','ShiftLeft','ShiftRight'];
const physicalKeys=new Set(),touchKeys=new Set();let touchControls;
function syncKeys(){controller.keys.clear();for(const code of physicalKeys)controller.keys.add(code);for(const code of touchKeys)controller.keys.add(code);}
function touchState(){return {flying:controller.flight.active,displaying:active.displaying??false,cautious:controller.keys.has('KeyC'),sprint:controller.keys.has('ShiftLeft')||controller.keys.has('ShiftRight')};}
window.addEventListener('keydown',e=>{if(e.target.matches('input,button'))return;if(movementCodes.includes(e.code)){e.preventDefault();physicalKeys.add(e.code);syncKeys();if(!e.repeat){active.onKey?.(e.code);if(e.code==='KeyF')controller.flight.toggle();}}});
window.addEventListener('keyup',e=>{physicalKeys.delete(e.code);syncKeys();});
function releaseInputs(){physicalKeys.clear();touchControls?.reset();syncKeys();}
window.addEventListener('blur',()=>{releaseInputs();sound.blocked=true;sound.silence();});window.addEventListener('focus',()=>sound.blocked=false);document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseInputs();sound.silence();}last=performance.now();});
window.addEventListener('resize',()=>{const nextPortrait=innerHeight>innerWidth;if(nextPortrait!==portraitLayout){camera.position.sub(controls.target).multiplyScalar(nextPortrait?20/15:15/20).add(controls.target);portraitLayout=nextPortrait;}renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
window.__simulation={controller,params,renderer,camera,controls,sound,species,selectSpecies,get active(){return active;},get locomotion(){return active.locomotion;},get legs(){return active.legs;},get dorsalBody(){return active.wings;},get time(){return t;}};

// There is no sound toggle any more, so never start muted from an old preference.
sound.setMuted(false);
window.addEventListener('pointerdown',()=>{sound.blocked=false;void sound.unlock();});
window.addEventListener('keydown',e=>{if(!e.repeat){sound.blocked=false;void sound.unlock();}});

// Specimen tabs: swap the model, sound character and descriptive copy while
// keeping position and heading, so the new insect picks up where you are.
const copy={
 mantis:{brand:'M',family:'Mantodea',species:'TENODERA SINENSIS',headline:'Built to ambush.',lede:'Four walking legs. Two grasping forelegs.<br>Stillness, then a lightning-fast strike.',number:'03',common:'CHINESE MANTIS',detail:'Articulated forelegs · opening wings · grasping strike',title:'Mantodea — Locomotion study',states:{walk:'STALKING',fast:'WALKING',wings:'WINGS OPEN'},legend:[['D','WINGS','Open · close'],['F','FLY','Take off · land'],['C','CAUTIOUS','Hold to slow down'],['G','STRIKE','Press to strike']]},
 cockroach:{brand:'B',family:'Blattodea',species:'PERIPLANETA AMERICANA',headline:'Built to scuttle.',lede:'Six legs. Two tripods. A movement system<br>refined over millions of years.',number:'01',common:'AMERICAN COCKROACH',detail:'Procedural locomotion · articulated anatomy',title:'Blattodea — Locomotion study',states:{walk:'SCUTTLING',fast:'SPRINTING'},legend:[['F','FLY','Take off · land'],['C','CAUTIOUS','Hold to slow down'],['SHIFT','SPRINT','Hold to double speed']]},
 wasp:{brand:'V',family:'Vespidae',species:'VESPULA VULGARIS',headline:'Built to sting.',lede:'Six legs, four hooked wings and a<br>pinched waist, on the same tripod gait.',number:'02',common:'COMMON WASP',detail:'Procedural locomotion · painted cuticle · wing buzz',title:'Vespidae — Locomotion study',states:{walk:'WALKING',fast:'RUNNING',wings:'BUZZING'},legend:[['F','FLY','Take off · land'],['C','CAUTIOUS','Hold to slow down'],['G','STING','Hold to curl & sting']]},
};
touchControls=setupTouchControls({
 controller,
 onActionDown(code,mode){
  if(mode==='hold'){touchKeys.add(code);syncKeys();}
  else if(code==='KeyF')controller.flight.toggle();
  else if(code==='KeyD'||code==='KeyG')active.onKey?.(code);
  else{if(touchKeys.has(code))touchKeys.delete(code);else touchKeys.add(code);syncKeys();}
  touchControls.setToggleStates(touchState());
 },
 onActionUp(code){touchKeys.delete(code);syncKeys();},
});
function selectSpecies(id,{persist=true}={}){
 if(!species[id])id='cockroach';
 const next=species[id];
 if(next!==active||!next.group.visible){active.group.visible=false;active=next;active.reset();active.group.visible=true;}
 const c=copy[id];
 document.querySelector('.brand').firstChild.textContent=c.brand;document.querySelector('h1').firstChild.textContent=c.family;
 document.querySelector('aside .eyebrow').textContent=c.species;document.querySelector('aside h2').textContent=c.headline;document.querySelector('aside p').innerHTML=c.lede;
 document.querySelector('.common-name').textContent=c.common.charAt(0)+c.common.slice(1).toLowerCase();
 document.querySelector('.legend span:first-child').lastChild.textContent=id==='mantis'?'Diagonal A':'Tripod A';document.querySelector('.legend span:nth-child(2)').lastChild.textContent=id==='mantis'?'Diagonal B':'Tripod B';document.querySelector('#scene').setAttribute('aria-label',`Interactive three-dimensional ${id} simulation`);document.querySelector('#gait').dataset.species=id;{const art=silhouettes[id],img=document.querySelector('.bug-silhouette');img.src=art.url;img.style.width=`${art.width}px`;img.style.height=`${art.height}px`;img.style.left=`${(SILHOUETTE.width-art.width)/2}px`;img.style.top=`${(SILHOUETTE.height-art.height)/2}px`;document.querySelectorAll('.gait b').forEach((dot,i)=>{const [x,y]=art.dots[i];dot.style.left=`${x+(SILHOUETTE.width-art.width)/2-5}px`;dot.style.top=`${y+(SILHOUETTE.height-art.height)/2-5}px`;});}document.querySelector('#gait span').innerHTML=id==='mantis'?'FOUR-LEG WALK<br>GRASPING FORELEGS':'ALTERNATING<br>TRIPOD GAIT';document.title=c.title;
 controller.profile=next.profile;
 document.querySelector('.hint').innerHTML=id==='mantis'?'Scroll to zoom · F: take off / land · D: open/close wings · G: strike':'Fixed overhead camera · Scroll to zoom · F: take off / land';
 document.querySelector('.keys').innerHTML=c.legend.map(([key,label,hint])=>`<kbd${key.length>1?' class="wide"':''}>${key}</kbd><p>${label}<small>${hint}</small></p>`).join('');
 touchControls.setActions(c.legend,id);
 touchControls.setToggleStates(touchState());
 document.querySelectorAll('[role=tab][data-species]').forEach(tab=>{const on=tab.dataset.species===id;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;});
 sound.setSpecies(id);
 if(persist)try{localStorage.setItem('insect-species',id);}catch{}
}
const tabs=[...document.querySelectorAll('[role=tab][data-species]')];
tabs.forEach((tab,i)=>{tab.onclick=e=>{selectSpecies(tab.dataset.species);e.currentTarget.blur();};tab.onkeydown=e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();e.stopPropagation();const next=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];next.focus();selectSpecies(next.dataset.species);};});
let savedSpecies='cockroach';try{savedSpecies=localStorage.getItem('insect-species')||'cockroach';}catch{}
selectSpecies(savedSpecies,{persist:false});
