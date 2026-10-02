import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {CockroachController,TripodGaitController,LegIK,LocomotionController,solveIK} from '../src/simulation.js';
test('IK preserves femur and tibia lengths',()=>{for(let x=.2;x<1.4;x+=.1){const hip=new Vector3(0,.4,0),foot=new Vector3(x,.02,.4);const knee=solveIK(hip,foot,.8,1,new Vector3(1,1,0));assert.ok(Math.abs(knee.distanceTo(hip)-.8)<1e-6);assert.ok(Math.abs(knee.distanceTo(foot)-1)<1e-6);}});
test('acceleration, reverse, braking and turning respond to controls',()=>{const c=new CockroachController(),idle={creep:0};c.keys.add('KeyW');c.update(1/120,idle);assert.ok(c.speed>0&&c.speed<.2);for(let i=0;i<120;i++)c.update(1/120,idle);assert.ok(c.position.z<0);c.keys.clear();for(let i=0;i<120;i++)c.update(1/120,idle);assert.equal(c.speed,0);c.keys.add('KeyS');for(let i=0;i<120;i++)c.update(1/120,idle);assert.ok(c.speed<0&&c.speed>-1.1);c.keys.clear();c.keys.add('KeyA');for(let i=0;i<120;i++)c.update(1/120,idle);assert.ok(c.yaw>1);});
test('tripods are half a cycle apart',()=>{const gait=new TripodGaitController();for(let i=0;i<100;i++){gait.update(.008,4,0);assert.ok(Math.abs(Math.abs(gait.legPhase(0)-gait.legPhase(1))-.5)<1e-9);}});
test('stance foot stays anchored in world space',()=>{const c=new CockroachController();const leg=new LegIK([-.4,0,-.7],[-1,.025,-1],-1,0,0);const l=new LocomotionController(c,[leg]);l.update(.001,0,{adjust:-1});const foot=leg.foot.clone();c.position.z=-.1;c.speed=2;l.update(.01,.01,{adjust:-1});assert.equal(leg.foot.distanceTo(foot),0);});
