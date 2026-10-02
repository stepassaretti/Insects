import {detailMaterials,createMantisHindwing,addMantisMicroDetails,createSpikeField} from './mantis-detail.js';
import {mantisSurfaces,photoPlate,setTegmenTranslucency,translucentShadow} from './mantis-surface.js';
import * as THREE from 'three';
import {ellipsoid,rod,placeRod,contactMarker,up} from './parts.js';
import {LegIK,LocomotionController,AntennaController,solveIK,clamp} from './simulation.js';
import {MantisWingMotion} from './mantis-wing-motion.js';
import {createMantisAbdomen} from './mantis-abdomen.js';


// Raptorial strike timeline (seconds) and the two key poses, per side (x is
// mirrored). Reach: forelegs fully extended and converging in front of the
// head. Clasp: tibiae snapped shut against the femora, still held forward.
const STRIKE={reach:.07,clasp:.13,back:.3,
 elbow:[[.24,.18,-1.74],[.22,.16,-1.60]],
 wrist:[[.16,.30,-2.70],[.14,.30,-2.50]],
 tip:[[.06,.26,-3.39],[.10,.20,-1.83]]};
// The walking-leg pole bends knees outward and slightly down. When a foot
// swings close under its hip (turning, reversing), that can push the knee
// below the floor, hiding part of the leg. Feet stay exactly where the gait
// puts them; only the knee is lifted, by tipping the pole upward until clear.
const KNEE_CLEARANCE=.08,liftedPole=new THREE.Vector3();
function kneeAboveGround(hip,foot,pole){
 let knee=solveIK(hip,foot,.95,1.15,pole);
 for(let k=1;k<=8&&knee.y<KNEE_CLEARANCE;k++){liftedPole.copy(pole).lerp(up,k/8);knee=solveIK(hip,foot,.95,1.15,liftedPole);}
 return knee;
}
function strikeWeights(time){
 if(time<0)return {reach:0,clasp:0,rest:1};
 const ease=x=>1-(1-x)**3;
 if(time<STRIKE.reach){const u=ease(time/STRIKE.reach);return {reach:u,clasp:0,rest:1-u};}
 if(time<STRIKE.clasp){const u=ease((time-STRIKE.reach)/(STRIKE.clasp-STRIKE.reach));return {reach:1-u,clasp:u,rest:0};}
 const u=THREE.MathUtils.smoothstep(time,STRIKE.clasp,STRIKE.back);return {reach:0,clasp:1-u,rest:u};
}

export function createMantis(controller){
 const group=new THREE.Group(),body=new THREE.Group();group.add(body);
 const surfaces=mantisSurfaces(),details=detailMaterials();surfaces.limb.bumpMap=details.grain;surfaces.limb.bumpScale=.003;const green=surfaces.limb,edge=new THREE.MeshPhysicalMaterial({color:0x74913d,roughness:.4,clearcoat:.55,clearcoatRoughness:.25,specularIntensity:.6}),dark=new THREE.MeshPhysicalMaterial({color:0x3b4820,roughness:.38,clearcoat:.6,clearcoatRoughness:.22,specularIntensity:.6}),eye=details.eyes;
 createMantisAbdomen(body);
 // Cervical membrane connects the downward-facing head to the prothorax.
 const neck=ellipsoid(body,edge,[0,.09,-1.66],[.065,.04,.10]);
 // A slim, flattened prothorax with the widening and dorsal ridge of the reference.
 const prothorax=ellipsoid(body,green,[0,.10,-1.02],[.125,.065,.74]);
 // Pronotum: its front ends in a rounded, slightly pointed lobe that rises
 // and ends right where the head begins.
 const pronotum=[[0,558,608,612],[.0125,558,601,619],[.031,558,597,623],...[[0,558,596,624],[.15,601,592,649],[.32,650,604,660],[.65,751,628,681],[.93,828,650,701],[1,842,657,695]].map(([v,...rest])=>[(v*1.39+.09)/1.48,...rest])];
 const thorax=photoPlate(body,surfaces.mat,pronotum,-1.77,1.48,.0054,0,d=>.125*(1-THREE.MathUtils.smoothstep(d,0,.42)));thorax.position.y=.135;
 // Fill beneath the upturned front so it reads as a solid segment from the side.
 const collar=ellipsoid(body,green,[0,.13,-1.62],[.085,.06,.14]);
 const head=new THREE.Group();head.position.set(0,.17,-1.77);body.add(head);
 // The face is nearly vertical: vertex and eyes above, mouthparts below,
 // facing the floor rather than a flat triangular plate facing the camera.
 ellipsoid(head,green,[0,0,-.055],[.245,.075,.10]);
 const faceGeometry=new THREE.BufferGeometry();faceGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.235,.015,-.055,.235,.015,-.055,0,-.245,-.09,0,-.015,.065],3));faceGeometry.setIndex([0,2,1,0,3,2,1,2,3,0,1,3]);faceGeometry.computeVertexNormals();
 const face=new THREE.Mesh(faceGeometry,green);face.castShadow=true;head.add(face);
 for(const side of [-1,1]){const eyeMesh=ellipsoid(head,eye,[side*.225,.015,-.07],[.093,.072,.081]);eyeMesh.rotation.z=side*.18;
  ellipsoid(head,dark,[side*.029,-.229,-.095],[.035,.036,.028]);}
 const crown=photoPlate(head,surfaces.mat,[[0,513,567,633],[.5,532,555,638],[1,548,576,625]],-.12,.14,.0057);crown.position.y=.062;
 // Meso/metathorax: a green waist fixed to the rear body. It stays under the
 // torso's rear during strike lunges and turn leans, so no gap ever opens.
 const waist=ellipsoid(body,green,[0,.07,-.40],[.13,.075,.30]);
 const micro=addMantisMicroDetails(body,head,green,dark);
 const wingMotion=new MantisWingMotion(47),pairs=[];
 for(const side of [-1,1]){const pivot=new THREE.Group();pivot.position.set(0,side===-1?.206:.19,-.30);body.add(pivot);const cover=photoPlate(pivot,surfaces.tegmen,[[0,863,659,710],[.12,937,642,723],[.35,1073,624,744],[.6,1226,626,754],[.83,1369,649,744],[.96,1465,673,720],[1,1487,689,708]],0,2.27,.0062,side);cover.rotation.y=-side*.018;cover.renderOrder=side===-1?3:2;const coverShadow=translucentShadow();cover.customDepthMaterial=coverShadow.material;
  const membranePivot=new THREE.Group();membranePivot.position.set(side*.12,.165,-.25);body.add(membranePivot);const membrane=createMantisHindwing(membranePivot,side);const hindShadow=translucentShadow();for(const section of membrane.sections)section.mesh.customDepthMaterial=hindShadow.material;
  // Stroke-blur ghosts: the same tegmen and hindwing, posed a little earlier
  // in the beat and faint, as on the wasp. They show only during fast beats.
  const ghosts=[.55,1.1].map(lag=>{const ghostPivot=new THREE.Group();body.add(ghostPivot);const material=surfaces.tegmen.clone();material.opacity=0;const mesh=new THREE.Mesh(cover.geometry,material);mesh.rotation.y=cover.rotation.y;mesh.renderOrder=4;ghostPivot.add(mesh);ghostPivot.visible=false;return {pivot:ghostPivot,material,lag};});
  const trails=[.55,1.1].map(offset=>membrane.makeTrail(body,offset));
  pairs.push({side,pivot,cover,coverShadow,ghosts,membranePivot,membrane,trails,hindShadow});}
 const legs=[{planted:false,side:-1,index:0},{planted:false,side:1,index:1}],walking=[];
 for(let row=0;row<2;row++)for(const side of [-1,1]){
  const index=2+row*2+(side===1?1:0),hip=[side*.18,-.02,-.26+row*.53],rest=[side*(row?1.20:1.30),.025,row?1.40:-.37];
  const leg=new LegIK(hip,rest,side,(row+(side===1?1:0))%2,index);leg.links=[rod(group,green,.035),rod(group,edge,.022),rod(group,dark,.011)];leg.toes=Array.from({length:4},()=>rod(group,dark,.009));leg.marker=contactMarker(group,leg.group);legs.push(leg);walking.push(leg);
 }
 const locomotion=new LocomotionController(controller,walking,1.05);
 const arms=[];
 for(const side of [-1,1]){arms.push({side,links:[rod(body,edge,.045),ellipsoid(body,green,[0,0,0],[.07,.5,.045]),rod(body,edge,.033),rod(body,dark,.012)],spines:Array.from({length:22},()=>{const m=new THREE.Mesh(new THREE.ConeGeometry(1,1,6),dark);m.castShadow=true;body.add(m);return m;})});}
 const antennae=[-1,1].map(side=>({side,brain:new AntennaController(side),segments:Array.from({length:24},(_,i)=>rod(head,dark,.009*(1-i/27)))}));
 let attacking=false;
 const torsoPivot=new THREE.Group(),upper=new THREE.Group();torsoPivot.position.z=-.30;upper.position.z=.30;torsoPivot.add(upper);body.add(torsoPivot);
 for(const node of [neck,prothorax,thorax,collar,head,...arms.flatMap(a=>[...a.links,...a.spines])])upper.add(node);
 // Fine, pale setae along the outer edge of each foreleg only.
 const armSpikes=createSpikeField(upper,new THREE.MeshStandardMaterial({color:0xa9ad72,roughness:.6}),80);
 // The forelegs are drawn as a layer beneath the head: the head's solid parts
 // (not the antennae) mark their pixels in the stencil buffer, and foreleg
 // materials skip those pixels, so a raised foreleg never shows over the head.
 const HEAD_LAYER=2,antennaSegments=new Set(antennae.flatMap(a=>a.segments));
 const layered=(cache,material,settings)=>{if(!cache.has(material))cache.set(material,Object.assign(material.clone(),settings));return cache.get(material);};
 const headCache=new Map(),armCache=new Map();
 head.traverse(o=>{if(o.isMesh&&!antennaSegments.has(o))o.material=layered(headCache,o.material,{stencilWrite:true,stencilRef:HEAD_LAYER,stencilFunc:THREE.AlwaysStencilFunc,stencilZPass:THREE.ReplaceStencilOp});});
 for(const m of [...arms.flatMap(a=>[...a.links,...a.spines]),armSpikes.mesh]){m.material=layered(armCache,m.material,{stencilWrite:true,stencilRef:HEAD_LAYER,stencilFunc:THREE.NotEqualStencilFunc,stencilFail:THREE.KeepStencilOp,stencilZFail:THREE.KeepStencilOp,stencilZPass:THREE.KeepStencilOp});m.renderOrder=1;}
 let armOpen=0,fastBeat=0,displayOn=false,strikeTime=-1,stalk=0;
 // Open-wing display tremor: the held wings are never quite still. A mood is
 // picked every so often: a slow sway, a quick flutter burst, or near-stillness.
 // Amplitude and frequency glide between moods, so changes stay organic.
 const tremor={until:0,freq:1,targetFreq:1,amp:0,targetAmp:.02,phase:0};
 function updateTremor(dt,t){
  if(t>tremor.until){const r=Math.random();
   if(r<.35)Object.assign(tremor,{targetFreq:8+Math.random()*7,targetAmp:.01+Math.random()*.012,until:t+.25+Math.random()*.6});
   else if(r<.8)Object.assign(tremor,{targetFreq:.5+Math.random()*1.2,targetAmp:.02+Math.random()*.03,until:t+.8+Math.random()*2});
   else Object.assign(tremor,{targetFreq:1,targetAmp:.004,until:t+.4+Math.random()*1});}
  tremor.amp=THREE.MathUtils.damp(tremor.amp,tremor.targetAmp,8,dt);tremor.freq=THREE.MathUtils.damp(tremor.freq,tremor.targetFreq,6,dt);
  tremor.phase+=dt*Math.PI*2*tremor.freq;
 }
 const tremorAt=(side,offset=0)=>(Math.sin(tremor.phase+side*.7+offset)+Math.sin(tremor.phase*2.3+side*1.9+offset)*.35)*tremor.amp;
 for(const arm of arms)arm.walkSway=0;
 const wings={motion:wingMotion,pairs,get soundLevel(){return wingMotion.spread*fastBeat;}};
 function update(dt,t,{idle,debug,flying}){
  const fast=flying,display=displayOn;updateTremor(dt,t);
  // Cautious stalking (C): the forelegs draw in toward each other.
  stalk=THREE.MathUtils.damp(stalk,controller.keys.has('KeyC')?1:0,6,dt);
  locomotion.update(dt,t,idle);wingMotion.update(dt,display||fast,fast);micro.update(t,dt,controller.turn);
  fastBeat=THREE.MathUtils.damp(fastBeat,fast?1:0,12,dt);
  // Wing display raises the forelegs; a strike overrides that pose briefly.
  // C overrides the display pose: forelegs drawn in, wings stay as they are.
  const stalking=controller.keys.has('KeyC');armOpen=THREE.MathUtils.damp(armOpen,(display||fast)&&!stalking?.75:0,8,dt);
  const strike=armOpen;
  if(strikeTime>=0){strikeTime+=dt;if(strikeTime>=STRIKE.back)strikeTime=-1;}
  attacking=strikeTime>=0;
  const {reach:strikeReach,clasp,rest}=strikeWeights(strikeTime);
  const lunge=strikeReach+clasp*.6;
  upper.position.z=.30-lunge*.09;
  body.position.copy(controller.position);body.position.y=controller.position.y+controller.flight.settle+.50+Math.sin(t*1.1)*.007+Math.sin(wingMotion.phase)*.006*fastBeat*wingMotion.spread;body.rotation.set(-strike*.025-lunge*.03,controller.yaw,Math.sin(locomotion.gait.phase*Math.PI*2)*.008);
  const turnLean=clamp(controller.turn/2.7,-1,1)*THREE.MathUtils.degToRad(16);
  torsoPivot.rotation.y=THREE.MathUtils.damp(torsoPivot.rotation.y,turnLean,8,dt);
  head.rotation.y=THREE.MathUtils.damp(head.rotation.y,turnLean*.2+Math.sin(t*.7)*.025,7,dt);
  body.updateMatrixWorld(true);
  for(const leg of walking){const hip=new THREE.Vector3(...leg.hip).applyMatrix4(body.matrixWorld),foot=leg.foot.clone().add(new THREE.Vector3(0,.025,0));const pole=new THREE.Vector3(leg.side,-.35,leg.index<4?-.6:.35).applyAxisAngle(up,controller.yaw);const knee=kneeAboveGround(hip,foot,pole);placeRod(leg.links[0],hip,knee);placeRod(leg.links[1],knee,foot);const tarsus=foot.clone().add(new THREE.Vector3(leg.side*.12,-.015,.09).applyAxisAngle(up,controller.yaw));placeRod(leg.links[2],foot,tarsus);for(let q=0;q<4;q++){const a=foot.clone().add(new THREE.Vector3(leg.side*(.03+q*.025),-.015,.025+q*.024).applyAxisAngle(up,controller.yaw));const b=a.clone().add(new THREE.Vector3(leg.side*.025,-.003,.023).applyAxisAngle(up,controller.yaw));placeRod(leg.toes[q],a,b,.010-q*.0018);}leg.marker.position.copy(leg.foot);leg.marker.position.y=.012;leg.marker.visible=debug;leg.marker.material.opacity=leg.planted?1:.25;}
  armSpikes.begin();
  // Two diagonal support exchanges per gait cycle. Give each forearm
  // 2.5 walking steps for a gentle reach and return, then switch arms.
  const armTurn=locomotion.gait.phase*2/2.5;
  const activeSide=Math.floor(armTurn)%2===0?-1:1;
  const reach=Math.sin((armTurn%1)*Math.PI)**2;
  const walkingAmount=Math.min(1,Math.abs(controller.speed)/2);
  for(const arm of arms){
   const swayTarget=arm.side===activeSide?-reach*.075*walkingAmount*(1-armOpen)**2:0;
   arm.walkSway=THREE.MathUtils.damp(arm.walkSway,swayTarget,8,dt);
   const s=arm.side,breathe=Math.sin(t*1.4+s)*.018*(1-walkingAmount);
   const hip=new THREE.Vector3(s*.14,.10,-1.28),elbow=new THREE.Vector3(s*(.42+strike*.20),.20+strike*.23,-.89-strike*.57);
   const wrist=new THREE.Vector3(s*(.65+strike*.36),.27+strike*.43,-1.83-strike*.65+breathe);
   const tip=new THREE.Vector3(s*(.43+strike*.71),.25+strike*.43,-1.18-strike*1.89);
   elbow.z+=arm.walkSway*.45;wrist.z+=arm.walkSway;tip.z+=arm.walkSway*.9;
   elbow.x*=1-.3*stalk;wrist.x*=1-.5*stalk;tip.x*=1-.55*stalk;
   // Strike: both forelegs shoot forward and converge, the tibiae snap shut
   // against the femora, then the arms fold straight back to rest.
   if(rest<1)for(const [point,[r,c]] of [[elbow,STRIKE.elbow],[wrist,STRIKE.wrist],[tip,STRIKE.tip]])point.set(point.x*rest+s*(r[0]*strikeReach+c[0]*clasp),point.y*rest+r[1]*strikeReach+c[1]*clasp,point.z*rest+r[2]*strikeReach+c[2]*clasp);
   placeRod(arm.links[0],hip,elbow);const femurVector=wrist.clone().sub(elbow);arm.links[1].position.copy(elbow).add(wrist).multiplyScalar(.5);arm.links[1].quaternion.setFromUnitVectors(up,femurVector.clone().normalize());arm.links[1].scale.set(.075,femurVector.length()*.51,.047);placeRod(arm.links[2],wrist,tip);placeRod(arm.links[3],tip,tip.clone().add(new THREE.Vector3(-s*.035,0,-.13)));
   const outward=new THREE.Vector3(s,0,0);armSpikes.add(hip,elbow,.045,7,.018,outward);armSpikes.add(elbow,wrist,.06,14,.02,outward);armSpikes.add(wrist,tip,.033,12,.016,outward);
   for(let j=0;j<22;j++){const femur=j<12,index=femur?j:j-12;const base=(femur?elbow:wrist).clone().lerp(femur?wrist:tip,.12+index*(femur?.064:.077));
    const size=(femur?.052:.038)*(index%3===0?1.5:1);const direction=new THREE.Vector3(s*(femur?-1:1),-.10,.24).normalize();
    const spine=arm.spines[j];spine.position.copy(base).addScaledVector(direction,size*.5);spine.quaternion.setFromUnitVectors(up,direction);spine.scale.set(size*.19,size,size*.19);
   }
  }
  armSpikes.end();
  for(const a of antennae){const motion=a.brain.update(t,dt,controller.speed,controller.turn);let prev=new THREE.Vector3(a.side*.12,0,-.10);for(let i=0;i<24;i++){const u=(i+1)/24,p=new THREE.Vector3(a.side*(.12-.10*(1-Math.exp(-u*12))+u*.60)+motion.sweep*u*u*.24,.015+.09*(1-Math.exp(-u*10))+Math.sin(u*Math.PI)*.035,-.10-u*1.13+.065*(1-Math.exp(-u*14)));placeRod(a.segments[i],prev,p);prev=p;}}
  surfaces.tegmen.opacity=1-.45*fastBeat;
  for(const w of pairs){
   const spread=wingMotion.spread,beatAt=lag=>Math.sin(wingMotion.phase+w.side*.12-lag)*fastBeat;
   const coverLift=THREE.MathUtils.smoothstep(spread,0,.19);
   const coverSwing=THREE.MathUtils.smoothstep(spread,.09,.68);
   // The upper cover disengages first; both remain rigid leaf-like tegmina.
   w.pivot.position.y=(w.side===-1?.206:.19)+coverLift*(w.side===-1?.032:.014)+coverSwing*.07;
   w.pivot.rotation.order='YXZ';
   // Fast beats: a wide flapping stroke about the body axis, above horizontal.
   const coverRoll=lag=>-coverSwing*.72-(.12+beatAt(lag)*.5)*fastBeat*coverSwing;
   // Tremor only while the wings are held open for display, not in flight.
   const held=display?THREE.MathUtils.smoothstep(spread,.8,1)*(1-fastBeat):0;
   w.pivot.rotation.set(coverRoll(0)+tremorAt(w.side)*held,w.side*coverSwing*Math.PI/2+tremorAt(w.side,1.3)*.5*held,0);
   const translucency=THREE.MathUtils.smoothstep(spread,.04,.6);
   setTegmenTranslucency(w.cover,translucency);
   // Shadows thin with the wings: solid when closed, lighter once open
   // (beating wings keep the same open-wing shadow).
   w.coverShadow.set(1-.45*translucency);
   w.hindShadow.set(.45);
   for(const g of w.ghosts){
    g.pivot.visible=fastBeat>.05&&coverSwing>.5;g.material.opacity=(g.lag<1?.34:.17)*fastBeat;
    g.pivot.position.copy(w.pivot.position);g.pivot.rotation.order='YXZ';g.pivot.rotation.set(coverRoll(g.lag),w.pivot.rotation.y,0);
   }
   // Hindwings emerge only after the covers have cleared their centre seam.
   // Their individually hinged pleats then fan outward from the thorax.
   const unfold=THREE.MathUtils.smoothstep(spread,.20,.91+(w.side===1?.015:0));
   w.membranePivot.position.y=.165+unfold*.045;
   // Hindwings lead the tegmina slightly and sweep the widest stroke.
   const hindRoll=lag=>w.side*(.3+beatAt(lag-.6)*.62)*fastBeat*unfold,hindPitch=lag=>-Math.cos(wingMotion.phase+w.side*.12-lag+.6)*.25*fastBeat*unfold;
   w.membranePivot.rotation.set(hindPitch(0)+tremorAt(w.side,.6)*.6*held,0,hindRoll(0)+w.side*tremorAt(w.side,.4)*1.3*held);
   w.membrane.update(unfold,wingMotion.phase,fastBeat);
   // At full speed the real membranes are only glimpsed: fade them into the blur.
   w.membrane.material.opacity=1-.5*fastBeat;
   for(const {trail,hinges,offset} of w.trails){
    trail.visible=fastBeat>.05&&unfold>.8;
    trail.position.copy(w.membranePivot.position);
    trail.rotation.set(hindPitch(offset),0,hindRoll(offset));
    hinges.forEach((hinge,i)=>{hinge.rotation.copy(w.membrane.sections[i].hinge.rotation);hinge.children[0].material.opacity=(offset<1?.3:.15)*fastBeat;});
   }
  }
 }
 // D toggles the wing display; G launches one strike (restartable once it
 // is folding back). Both are edge-triggered so a quick tap is never lost.
 function onKey(code){
  if(code==='KeyD')displayOn=!displayOn;
  if(code==='KeyG'&&(strikeTime<0||strikeTime>STRIKE.clasp))strikeTime=0;
 }
 function reset(){locomotion.reset();wingMotion.reset();attacking=false;armOpen=0;fastBeat=0;displayOn=false;strikeTime=-1;stalk=0;upper.position.z=.30;for(const arm of arms)arm.walkSway=0;torsoPivot.rotation.y=0;}
 return {id:'mantis',group,body,legs,silhouetteSkip:antennae.flatMap(a=>a.segments),locomotion,wings,bodyLength:3.8,profile:{sprint:false,sReverses:true,dTurns:false,takeoff:.6,flightScale:.8},get attacking(){return attacking;},get armOpen(){return armOpen;},get displaying(){return displayOn;},get strikeTime(){return strikeTime;},torsoPivot,head,update,reset,onKey};
}
