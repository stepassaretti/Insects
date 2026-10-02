import test from 'node:test';
import assert from 'node:assert/strict';
import {MantisWingMotion} from '../src/mantis-wing-motion.js';

test('mantis wings reverse smoothly and pass through explicit opening states',()=>{
 const wings=new MantisWingMotion();
 assert.equal(wings.state,'WINGS_CLOSED');
 wings.update(.25,true);
 assert.equal(wings.state,'WINGS_OPENING');
 const partial=wings.spread;
 wings.update(.05,false);
 assert.equal(wings.state,'WINGS_CLOSING');
 assert.ok(wings.spread>0&&wings.spread<partial);
 wings.update(1,true);
 assert.equal(wings.state,'WINGS_OPEN');
 wings.update(.2,false);
 assert.equal(wings.state,'WINGS_CLOSING');
 wings.update(1,false);
 assert.equal(wings.state,'WINGS_CLOSED');
 assert.equal(wings.spread,0);
});

test('F opens the tegmina and hindwings much faster than D',()=>{
 const display=new MantisWingMotion(),flight=new MantisWingMotion();
 for(let i=0;i<12;i++){
  display.update(1/60,true);
  flight.update(1/60,true,true);
 }
 assert.ok(display.spread<.3);
 assert.equal(flight.spread,1);
 assert.equal(display.state,'WINGS_OPENING');
 assert.equal(flight.state,'WINGS_OPEN');
});
