import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {FlightController,CockroachController,LegIK,LocomotionController,params} from '../src/simulation.js';

const step=1/120,move={speed:0,turn:0};
function liftOffTime(takeoff){
 const f=new FlightController();f.toggle();let t=0;
 while(f.blend<1&&t<5){f.update(step,{takeoff,...move});t+=step;}
 return t;
}

test('legs clear the ground after each species take-off time',()=>{
 for(const takeoff of [1,.6,.3])assert.ok(Math.abs(liftOffTime(takeoff)-takeoff)<.02,`take-off ${takeoff}s`);
});

test('one F press climbs to the maximum height and hovers; a second press lands',()=>{
 const f=new FlightController();f.toggle();
 for(let i=0;i<120*8;i++)f.update(step,{takeoff:.3,...move});
 assert.ok(f.altitude>8.9&&Math.abs(f.vy)<.05&&f.wingsActive,'hovering at the top');
 f.toggle();for(let i=0;i<120*4;i++)f.update(step,{takeoff:.3,...move});
 assert.equal(f.altitude,0);assert.ok(!f.wingsActive&&!f.landing,'landed with wings off');
});

test('pressing F again during take-off lands straight away',()=>{
 const f=new FlightController();f.toggle();
 for(let i=0;i<60;i++)f.update(step,{takeoff:1,...move});
 assert.ok(f.altitude>0);f.toggle();
 for(let i=0;i<120;i++)f.update(step,{takeoff:1,...move});
 assert.equal(f.altitude,0);
});

test('taking off while walking fast keeps every foot within reach of its hip',()=>{
 const c=new CockroachController();c.profile={sprint:true,sReverses:true,fastWalk:true,takeoff:1,flightScale:1.3};
 const legs=[[-.3,-.7],[.3,-.7],[-.4,0],[.4,0],[-.4,.7],[.4,.7]].map(([x,z],i)=>new LegIK([x,-.16,z],[x*3,.025,z*1.4],Math.sign(x),i%2,i));
 const locomotion=new LocomotionController(c,legs),idle={creep:0,adjust:-1};
 c.keys.add('KeyW');for(let i=0;i<240;i++){c.update(step,idle);locomotion.update(step,i*step,idle);}
 c.flight.toggle();let worst=0;
 for(let i=0;i<360;i++){c.update(step,idle);locomotion.update(step,i*step,idle);
  for(const leg of legs){const hip=new Vector3(...leg.hip).applyAxisAngle(new Vector3(0,1,0),c.yaw).add(c.position).add(new Vector3(0,.43,0));worst=Math.max(worst,leg.foot.distanceTo(hip));}}
 assert.ok(worst<2.2,`foot stayed within ${worst.toFixed(2)} of its hip`);
});

test('flight is much faster than walking and the wasp is by far the fastest flier',()=>{
 const idle={creep:0},top={};
 for(const [name,profile] of Object.entries({cockroach:{sprint:true,sReverses:true,fastWalk:true,takeoff:1,flightScale:1.3},wasp:{sprint:false,sReverses:true,takeoff:.3,flightScale:2.2},mantis:{sprint:false,sReverses:true,takeoff:.6,flightScale:.8}})){
  const c=new CockroachController();c.profile=profile;c.keys.add('KeyW');
  for(let i=0;i<600;i++)c.update(step,idle);const walk=c.speed;
  assert.ok(Math.abs(walk-(profile.fastWalk?params.sprintSpeed:params.walkSpeed))<.01);
  if(profile.sprint){c.keys.add('ShiftLeft');for(let i=0;i<600;i++)c.update(step,idle);assert.ok(Math.abs(c.speed-2*walk)<.01,'Shift doubles');c.keys.delete('ShiftLeft');}
  c.flight.toggle();for(let i=0;i<600;i++)c.update(step,idle);
  assert.ok(c.position.y>1&&c.speed>walk*2,`${name} flies faster than it walks`);top[name]=c.speed;
 }
 assert.ok(top.wasp>top.cockroach*1.5&&top.wasp>top.mantis*1.5,'wasp is way faster in flight');
});

test('touchdown bounces the body on its legs, harder after a faster descent',()=>{
 const bounce=climbSteps=>{
  const f=new FlightController();f.toggle();for(let i=0;i<climbSteps;i++)f.update(step,{takeoff:.3,...move});
  f.toggle();let landed=-1,low=0,high=0;
  for(let i=0;i<120*5;i++){f.update(step,{takeoff:.3,...move});if(landed<0&&f.altitude===0)landed=i;if(landed>=0){low=Math.min(low,f.settle);high=Math.max(high,f.settle);}}
  return {low,high,final:f.settle};
 };
 const soft=bounce(60),hard=bounce(120*6);
 assert.ok(soft.low<-.03&&soft.high>0,'dips, then rebounds slightly');
 assert.ok(hard.low<soft.low,'a faster landing dips further');
 assert.equal(hard.final,0,'settles back to rest');
});
