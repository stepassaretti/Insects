// The mantis display is independent of its walking gait and the other insects'
// wing controllers. Progress reverses smoothly if the key is released mid-open.
export class MantisWingMotion {
 constructor(frequency=37.3){this.frequency=frequency;this.reset();}
 reset(){this.spread=0;this.phase=0;this.state='WINGS_CLOSED';}
 update(dt,active,fast=false){
  // F snaps the same articulated sequence open in about a quarter of D's
  // display time. Closing keeps its measured tuck-under-the-covers timing.
  const openingTime=fast?.18:.72;
  this.spread=Math.max(0,Math.min(1,this.spread+(active?dt/openingTime:-dt/.9)));
  this.state=this.spread===0?'WINGS_CLOSED':this.spread===1?'WINGS_OPEN':active?'WINGS_OPENING':'WINGS_CLOSING';
  this.phase+=dt*Math.PI*2*this.frequency;
  return this;
 }
}
