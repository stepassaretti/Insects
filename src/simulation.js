import * as THREE from 'three';
export const defaults={walkSpeed:3.8,sprintSpeed:10,flightSpeed:18,acceleration:15,deceleration:11,turnSpeed:2.7,strideLength:1.1,strideFrequency:5,footLift:.22,bodyOscillation:.025,antennaSpeed:1.6,antennaRandomness:.6};
export const params={...defaults};
export const clamp=THREE.MathUtils.clamp;const up=new THREE.Vector3(0,1,0);
export function solveIK(hip,foot,a,b,pole){const delta=foot.clone().sub(hip);const distance=clamp(delta.length(),.001,a+b-.001);const direction=delta.normalize();const along=(a*a-b*b+distance*distance)/(2*distance);const height=Math.sqrt(Math.max(0,a*a-along*along));const bend=pole.clone().addScaledVector(direction,-pole.dot(direction)).normalize();return hip.clone().addScaledVector(direction,along).addScaledVector(bend,height);}
// Vertical flight, independent of the walking gait. F toggles it: the first
// press takes off (after a species-specific take-off ramp) and climbs on its own
// to the maximum height, where it hovers; pressing F again at any point lands
// quickly. While airborne the body floats gently, and `drag` lags behind the
// motion so hanging legs can trail against it.
const CLIMB_RATE=2.2,MAX_ALTITUDE=9,LEG_CLEARANCE=.35;
export class FlightController{
 constructor(){this.drag=new THREE.Vector3();this.reset();}
 reset(){this.active=false;this.impact=0;this.sinceTouchdown=0;this.settle=0;this.altitude=0;this.vy=0;this.ramp=0;this.rampTime=1;this.landing=false;this.lifting=false;this.takingOff=false;this.time=0;this.bob=0;this.drag.set(0,0,0);}
 // 0 on the ground, 1 once the feet have cleared it.
 get blend(){return THREE.MathUtils.smoothstep(this.altitude,0,LEG_CLEARANCE);}
 get airborne(){return this.altitude>0;}
 // Wings beat from the take-off press until touchdown.
 get wingsActive(){return this.active||this.altitude>.05;}
 toggle(){this.active=!this.active;if(this.active)this.landing=false;else if(this.altitude>0)this.landing=true;}
 update(dt,{takeoff,speed,turn}){
  this.time+=dt;const lift=this.active&&this.altitude<MAX_ALTITUDE;
  if(lift&&!this.lifting){this.ramp=0;this.takingOff=this.altitude===0;this.rampTime=this.takingOff?takeoff:.25;}
  this.lifting=lift;if(!lift)this.takingOff=false;
  if(lift&&this.takingOff){
   // Take-off: the body eases up so the legs clear the ground in exactly the
   // species' take-off time, leaving with the speed that curve reaches.
   this.landing=false;this.ramp+=dt;const x=Math.min(1,this.ramp/this.rampTime);
   this.altitude=LEG_CLEARANCE*x*x;this.vy=2*LEG_CLEARANCE*x/this.rampTime;if(x>=1)this.takingOff=false;
  }else{
   let target=0;
   // Climb eases in, and eases out into a hover near the maximum height.
   if(lift){this.landing=false;this.ramp+=dt;target=CLIMB_RATE*THREE.MathUtils.smoothstep(this.ramp,0,this.rampTime)*Math.min(1,(MAX_ALTITUDE-this.altitude)/1.5+.05);}
   else if(this.landing)target=-clamp(this.altitude*4,1.5,7);
   // Landing drops fast.
   this.vy=THREE.MathUtils.damp(this.vy,target,lift||this.landing?6:12,dt);
   this.altitude=clamp(this.altitude+this.vy*dt,0,MAX_ALTITUDE);
  }
  // Touchdown: the body keeps falling onto the planted legs, which flex and
  // rebound in a quick damped bounce scaled by the landing speed.
  if(this.altitude===0&&this.vy<0&&this.landing){this.impact=Math.min(.14,.04+.025*-this.vy);this.sinceTouchdown=0;}
  this.sinceTouchdown+=dt;
  this.settle=this.impact?-this.impact*Math.exp(-5.5*this.sinceTouchdown)*Math.sin(Math.PI*2*2.2*this.sinceTouchdown):0;
  if(this.sinceTouchdown>1.5)this.impact=0;
  if(this.altitude===0){this.vy=Math.max(0,this.vy);this.landing=false;}
  if(this.altitude===MAX_ALTITUDE)this.vy=Math.min(0,this.vy);
  const air=this.blend;
  this.bob=(Math.sin(this.time*2.1)*.07+Math.sin(this.time*3.3+1)*.025)*air;
  // Lagged reaction: x follows turning, y vertical speed, z forward speed.
  this.drag.x=THREE.MathUtils.damp(this.drag.x,turn*air,3,dt);
  this.drag.y=THREE.MathUtils.damp(this.drag.y,this.vy*air,3,dt);
  this.drag.z=THREE.MathUtils.damp(this.drag.z,speed*air,3,dt);
 }
}
export class CockroachController{
 constructor(){this.position=new THREE.Vector3();this.yaw=0;this.speed=0;this.turn=0;this.accel=0;this.keys=new Set();this.joystick={forward:0,turn:0};this.profile={sprint:true,sReverses:true};this.flight=new FlightController();}
 update(dt,idle){const k=this.keys;const forward=k.has('KeyW')||k.has('ArrowUp');const back=(this.profile.sReverses&&k.has('KeyS'))||k.has('ArrowDown');const sprint=this.profile.sprint&&(k.has('ShiftLeft')||k.has('ShiftRight'));const cautious=k.has('KeyC');const moveInput=clamp(Number(forward)-Number(back)+this.joystick.forward,-1,1);const turnInput=clamp(Number(k.has('KeyA')||k.has('ArrowLeft'))-Number((this.profile.dTurns!==false&&k.has('KeyD'))||k.has('ArrowRight'))+this.joystick.turn,-1,1);this.active=Math.abs(moveInput)>.03||Math.abs(turnInput)>.03;// Walking pace per species (the cockroach walks at the sprint setting and Shift
  // doubles it); flight is much faster, scaled per species.
  const airborne=this.flight.airborne;this.walkSpeed=this.profile.fastWalk?params.sprintSpeed:params.walkSpeed;this.flightSpeed=params.flightSpeed*(this.profile.flightScale??1);
  this.topSpeed=airborne?this.flightSpeed:this.profile.sprint?this.walkSpeed*2:this.walkSpeed;
  let target=moveInput*(airborne?this.flightSpeed:sprint?this.walkSpeed*2:this.walkSpeed)*(cautious?.23:1);if(target<0)target*=airborne?.4:.27;if(!this.active)target=this.flight.airborne?0:idle.creep;const previous=this.speed;const boost=airborne?2.2:1;this.speed+=clamp(target-this.speed,-(target===0?params.deceleration:params.acceleration)*boost*dt,(target===0?params.deceleration:params.acceleration)*boost*dt);this.accel=(this.speed-previous)/dt;this.turn=THREE.MathUtils.damp(this.turn,turnInput*params.turnSpeed/(1+Math.abs(this.speed)*.035),12,dt);this.yaw+=this.turn*dt;this.position.x-=Math.sin(this.yaw)*this.speed*dt;this.position.z-=Math.cos(this.yaw)*this.speed*dt;this.flight.update(dt,{takeoff:this.profile.takeoff??.6,speed:this.speed,turn:this.turn});this.position.y=this.flight.altitude+this.flight.bob;}
 local(x,y,z){return new THREE.Vector3(x,y,z).applyAxisAngle(new THREE.Vector3(0,1,0),this.yaw).add(this.position);}
 reset(){this.position.set(0,0,0);this.yaw=0;this.speed=0;this.turn=0;this.keys.clear();this.joystick.forward=0;this.joystick.turn=0;this.flight.reset();}
}
export class IdleBehaviour{constructor(){this.next=3;this.creep=0;this.until=0;this.adjust=-1;}update(t,active){this.creep=0;this.adjust=-1;if(active){this.next=t+3;this.until=0;return;}if(t>this.next){this.until=t+.2+Math.random()*.25;this.next=t+4+Math.random()*7;this.adjust=Math.floor(Math.random()*6);}if(t<this.until)this.creep=.22;}}
export class TripodGaitController{constructor(){this.phase=0;this.frequency=0;}update(dt,speed,turn,scale=1){const demand=Math.abs(speed)+Math.abs(turn)*1.2;this.frequency=demand>.025?Math.min(17,Math.max(.7,demand/(params.strideLength*scale)*.62)*(params.strideFrequency/5)):0;this.phase+=this.frequency*dt;}legPhase(group){return (this.phase+group*.5)%1;}}
export class LegIK{constructor(hip,rest,side,group,index){Object.assign(this,{hip,rest,side,group,index});this.foot=new THREE.Vector3();this.start=new THREE.Vector3();this.target=new THREE.Vector3();this.swing=false;this.initialized=false;this.planted=true;}}
export class LocomotionController{
 constructor(controller,legs,scale=1){this.controller=controller;this.legs=legs;this.scale=scale;this.gait=new TripodGaitController();}
 update(dt,t,idle){const c=this.controller;const sc=this.scale;const air=c.flight?c.flight.blend:0;
 if(air>0){this.hang(air);return;}
 this.gait.update(dt,c.speed,c.turn,sc);for(const leg of this.legs){if(!leg.initialized){leg.foot.copy(c.local(...leg.rest));leg.initialized=true;}const phase=this.gait.legPhase(leg.group);const wantsSwing=this.gait.frequency>0&&phase>.56;const rest=c.local(...leg.rest);const drift=leg.foot.distanceTo(rest);if(wantsSwing&&!leg.swing){leg.start.copy(leg.foot);const horizon=.5/Math.max(this.gait.frequency,.7);const rx=leg.rest[0],rz=leg.rest[2];const dx=c.turn*rz*horizon;const dz=(-c.speed-c.turn*rx)*horizon;leg.target.copy(c.local(rx+clamp(dx,-.7*sc,.7*sc),.025,rz+clamp(dz,-params.strideLength*.6*sc,params.strideLength*.6*sc)));leg.target.x+=Math.sin(t*7+leg.index*19)*.035*sc;leg.target.z+=Math.cos(t*9+leg.index*7)*.025*sc;leg.swing=true;}
 if(leg.swing){if(wantsSwing){const u=clamp((phase-.56)/.44,0,1);const smooth=u*u*(3-2*u);leg.foot.lerpVectors(leg.start,leg.target,smooth);leg.foot.y=.025+Math.sin(Math.PI*u)*params.footLift*sc*(.55+Math.min(Math.abs(c.speed)/6,.8));}else{leg.foot.copy(leg.target);leg.swing=false;}}
 // Emergency reach recovery is used only after resets or unusually abrupt control changes.
 if(drift>1.65*sc&&!leg.swing){leg.foot.lerp(rest,Math.min(1,dt*12));leg.foot.y=.025;}
 if(idle.adjust===leg.index&&!this.gait.frequency){leg.foot.x+=.025*leg.side;leg.foot.z+=.02;}
 leg.planted=!leg.swing;}}
 // Airborne legs leave their planted spots and hang slightly lower, drawn in
 // under the body so they stay bent, trailing against the flight motion.
 // Near the ground they blend with the planted feet (take-off) or with the
 // rest pose under the body (landing), so touchdown is seamless.
 hang(air){const c=this.controller,sc=this.scale,drag=c.flight.drag;
  for(const leg of this.legs){
   const [rx,,rz]=leg.rest;
   if(!leg.initialized){leg.foot.copy(c.local(rx,0,rz));leg.foot.y=.025;leg.initialized=true;}
   // Take-off footholds are kept relative to the body: a take-off while
   // walking or flying off fast must not leave the feet pinned to the ground.
   if(!leg.takeoff)leg.takeoff=leg.foot.clone().sub(c.position).applyAxisAngle(up,-c.yaw);
   const dx=clamp(-drag.x*rz*.09,-.3*sc,.3*sc),dz=clamp(drag.x*rx*.09+drag.z*.045,-.4*sc,.4*sc),dy=clamp(-drag.y*.05,-.16*sc,.2*sc);
   const hang=c.local(rx*.8+dx,.025-.1*sc+dy,rz*.88+dz);
   // Rising: ease off the take-off footholds. Descending: settle onto the rest pose.
   const ground=(c.flight.vy>=0&&!c.flight.landing?c.local(leg.takeoff.x,0,leg.takeoff.z):c.local(rx,0,rz)).setY(.025);
   leg.foot.lerpVectors(ground,hang,air);
   leg.swing=false;leg.planted=air<.05;
  }
  // Once fully aloft, forget the old footholds so landing uses the rest pose.
  if(air>=1)for(const leg of this.legs)leg.takeoff=null;
 }
 reset(){this.gait.phase=0;for(const l of this.legs){l.initialized=false;l.swing=false;l.takeoff=null;}}
}
export class AntennaController{constructor(side){this.side=side;this.phase=Math.random()*6;this.next=0;this.bias=0;this.target=0;}update(t,dt,speed,turn){if(t>this.next){this.target=(Math.random()-.5)*params.antennaRandomness;this.next=t+.4+Math.random()*2;}this.bias=THREE.MathUtils.damp(this.bias,this.target,3,dt);this.phase+=dt*params.antennaSpeed*(1+Math.abs(speed)*.13+Math.abs(turn)*.4);return {sweep:Math.sin(this.phase*(this.side===1?1:1.13))*.24+this.bias-turn*.06,bend:Math.sin(this.phase*.73+2)*.15};}}
