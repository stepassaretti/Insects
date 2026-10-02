import * as THREE from 'three';
import {createChitinMaterial,createDorsalBody} from './anatomy.js';
import {ellipsoid,rod,placeRod,contactMarker,up} from './parts.js';
import {params,LegIK,LocomotionController,AntennaController,solveIK,clamp} from './simulation.js';

// Legs are drawn as a layer beneath the dorsal plates: the wing covers,
// pronotum and head shield mark their pixels in the stencil buffer, and leg
// materials skip those pixels, so a femur never shows over a forewing.
const COVER=1;
function coverLayer(material){Object.assign(material,{stencilWrite:true,stencilRef:COVER,stencilFunc:THREE.AlwaysStencilFunc,stencilZPass:THREE.ReplaceStencilOp});}
function underCovers(material){const m=material.clone();Object.assign(m,{stencilWrite:true,stencilRef:COVER,stencilFunc:THREE.NotEqualStencilFunc,stencilFail:THREE.KeepStencilOp,stencilZFail:THREE.KeepStencilOp,stencilZPass:THREE.KeepStencilOp});return m;}

// Periplaneta americana: specimen-textured dorsum, spined legs, long antennae
// and twitching cerci. Legs live in world space inside `group`.
export function createCockroach(controller){
 const group=new THREE.Group();
 const shell=createChitinMaterial({seed:5,dark:.83});const underside=createChitinMaterial({seed:7,dark:.53});const legmat=createChitinMaterial({seed:9,dark:1.18});const jointmat=createChitinMaterial({seed:11,dark:.85});const eyeMat=new THREE.MeshPhysicalMaterial({color:0x090b07,roughness:.55,metalness:0,clearcoat:0,specularIntensity:.25});
 const body=new THREE.Group();group.add(body);
 const dorsalBody=createDorsalBody(body,ellipsoid,underside,shell);const head=new THREE.Group();head.position.set(0,-.035,-1.08);body.add(head);ellipsoid(head,shell,[0,-.10,0],[.235,.105,.23]);for(const s of [-1,1])ellipsoid(head,eyeMat,[s*.19,-.07,-.1],[.05,.055,.075]);
 coverLayer(dorsalBody.wingPairs[0].outerPivot.children[0].material);
 const legCoxa=underCovers(underside),legShaft=underCovers(legmat),legTip=underCovers(jointmat);
 const palps=[],cerci=[];
 for(const side of [-1,1]){
  for(let j=0;j<2;j++){const p=rod(head,legmat,.015);palps.push({mesh:p,s:side,j});}
  const root=new THREE.Group();root.position.set(side*.22,-.02,1.12);body.add(root);
  const joint=new THREE.Vector3(side*.12,.02,.36);
  placeRod(rod(root,legmat,.03),new THREE.Vector3(),joint);
  const tip=new THREE.Group();tip.position.copy(joint);root.add(tip);
  placeRod(rod(tip,jointmat,.016),new THREE.Vector3(),new THREE.Vector3(side*.05,.02,.15));
  cerci.push({side,root,tip,next:1+Math.random()*3,start:-10,amplitude:0,duration:.4,phase:Math.random()*6});
 }
 const legs=[];
 for(let row=0;row<3;row++)for(const side of [-1,1]){const i=legs.length;const hip=[side*[.23,.29,.30][row],-.16,[-.69,-.2,.29][row]];const rest=[side*[1.1,1.42,1.26][row],.025,[-1.05,.05,1.23][row]];const lg=(row+(side===-1?0:1))%2;if(row===2){rest[0]=hip[0]+(rest[0]-hip[0])*1.1;rest[2]=hip[2]+(rest[2]-hip[2])*1.1;}const leg=new LegIK(hip,rest,side,lg,i);leg.femurLength=row===2?.81*1.1:.68;leg.tibiaLength=row===2?1.01*1.1:.94;leg.links=[rod(group,legCoxa,.063),rod(group,legShaft,row===2?.045:.032),rod(group,legShaft,.022),rod(group,legTip,.017)];leg.spines=Array.from({length:11},()=>rod(group,legTip,.008));for(const m of [...leg.links,...leg.spines])m.renderOrder=1;leg.marker=contactMarker(group,lg);legs.push(leg);}
 const locomotion=new LocomotionController(controller,legs);
 const antennae=[-1,1].map(side=>({side,brain:new AntennaController(side),segments:Array.from({length:38},(_,i)=>rod(head,i%4===0?legmat:jointmat,.018*(1-i/42)))}));
 function update(dt,t,{idle,debug,flying}){
  locomotion.update(dt,t,idle);dorsalBody.update(dt,flying);const moving=Math.min(1,Math.abs(controller.speed)+Math.abs(controller.turn));const phase=locomotion.gait.phase*Math.PI*2;const osc=params.bodyOscillation*moving;body.position.copy(controller.position);body.position.y=controller.position.y+controller.flight.settle+.43+Math.cos(phase*2)*osc*.45+Math.sin(t*1.7)*.002;body.rotation.set(clamp(-controller.accel*.0012,-.035,.035),controller.yaw+Math.sin(phase)*osc*.16,Math.sin(phase)*osc*.38-controller.turn*controller.speed*.0016);body.updateMatrixWorld(true);head.rotation.y=Math.sin(t*.8)*.024;
  for(const leg of legs){const hip=new THREE.Vector3(...leg.hip).applyMatrix4(body.matrixWorld);const coxa=new THREE.Vector3(leg.hip[0]+leg.side*.10,leg.hip[1]-.035,leg.hip[2]).applyMatrix4(body.matrixWorld);const ankle=leg.foot.clone().add(new THREE.Vector3(0,.055,0));const pole=new THREE.Vector3(leg.side*.8,.8,leg.index<2?-.45:.4).applyAxisAngle(up,controller.yaw);const knee=solveIK(coxa,ankle,leg.femurLength,leg.tibiaLength,pole);placeRod(leg.links[0],hip,coxa);placeRod(leg.links[1],coxa,knee);placeRod(leg.links[2],knee,ankle);const toe=leg.foot.clone().add(new THREE.Vector3(leg.side*.07,0,-.06).applyAxisAngle(up,controller.yaw));placeRod(leg.links[3],ankle,toe);for(let j=0;j<11;j++){const a=knee.clone().lerp(ankle,.10+j*.073);const b=a.clone().add(new THREE.Vector3(leg.side*(j%2?-.055:.065),-.04,.075).applyAxisAngle(up,controller.yaw));placeRod(leg.spines[j],a,b);}leg.marker.position.copy(leg.foot);leg.marker.position.y=.01;leg.marker.visible=debug;leg.marker.material.opacity=leg.planted?1:.3;}
  for(const a of antennae){const {sweep,bend}=a.brain.update(t,dt,controller.speed,controller.turn);let previous=new THREE.Vector3(a.side*.17,.07,-.21);for(let i=0;i<a.segments.length;i++){const u=(i+1)/a.segments.length;const reach=2.55;const angle=a.side*(.36+sweep)+Math.sin(u*2.3+t*1.7+a.side)*.08*u;const p=new THREE.Vector3(a.side*.17+Math.sin(angle)*reach*u+a.side*bend*u*u,.07+.35*Math.sin(u*Math.PI*.8)-.15*u*u+Math.sin(u*5-t*2+a.side)*.055*u,-.21-Math.cos(angle)*reach*u);placeRod(a.segments[i],previous,p);previous=p;}}
  for(const cercus of cerci){
   if(t>cercus.next){cercus.start=t;cercus.duration=.22+Math.random()*.3;cercus.amplitude=(Math.random()-.5)*.22;cercus.next=t+1.5+Math.random()*4;}
   const progress=(t-cercus.start)/cercus.duration;
   const twitch=progress>=0&&progress<1?Math.sin(progress*Math.PI)**2*cercus.amplitude:0;
   const drift=Math.sin(t*.85+cercus.phase)*.008;
   const turnResponse=clamp(-controller.turn*.025,-.07,.07);
   cercus.root.rotation.y=THREE.MathUtils.damp(cercus.root.rotation.y,twitch+drift+turnResponse,18,dt);
   cercus.root.rotation.x=THREE.MathUtils.damp(cercus.root.rotation.x,clamp(controller.accel*.001,-.025,.025)+Math.abs(twitch)*.2,12,dt);
   cercus.tip.rotation.y=THREE.MathUtils.damp(cercus.tip.rotation.y,twitch*.5+drift*.7,14,dt);
  }
  for(const p of palps){const a=new THREE.Vector3(p.s*(.09+p.j*.06),-.1,-.21);placeRod(p.mesh,a,new THREE.Vector3(p.s*(.12+p.j*.12+Math.sin(t*5+p.j+p.s)*.025),-.14,-.35-p.j*.05));}
 }
 function reset(){locomotion.reset();dorsalBody.motion.reset();dorsalBody.update(0,false);}
 return {id:'cockroach',group,body,legs,silhouetteSkip:antennae.flatMap(a=>a.segments),locomotion,wings:dorsalBody,bodyLength:2.6,profile:{sprint:true,sReverses:true,fastWalk:true,takeoff:1,flightScale:1.3},update,reset};
}
