import test from 'node:test';
import assert from 'node:assert/strict';
import {WingMotion} from '../src/wing-motion.js';
test('wings spread, beat rapidly, then settle fully closed',()=>{const w=new WingMotion(()=>.5);for(let i=0;i<120;i++)w.update(1/120,true);assert.ok(w.spread>.99);assert.ok(w.phase/(Math.PI*2)>23);for(let i=0;i<300;i++)w.update(1/120,false);assert.equal(w.spread,0);});
test('idle adjustment occurs occasionally and settles',()=>{const w=new WingMotion(()=>.5);let twitch=false;for(let i=0;i<1000;i++){w.update(.01,false);twitch||=w.twitch>0;}assert.ok(twitch);assert.equal(w.twitch,0);assert.equal(w.spread,0);});
