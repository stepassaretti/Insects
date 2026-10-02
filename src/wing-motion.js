// Independent wing behaviour; never changes gait, velocity or antenna state.
export class WingMotion {
 constructor(random=Math.random,frequency=37.3){this.random=random;this.frequency=frequency;this.reset();}
 reset(){this.spread=0;this.phase=0;this.nextAdjustment=4+this.random()*5;this.adjustmentStart=-10;this.adjustmentSide=1;this.time=0;}
 update(dt,active){
  this.time+=dt;
  this.spread+=(Number(active)-this.spread)*(1-Math.exp(-dt*(active?8:5)));
  if(this.spread<.0001)this.spread=0;
  if(!active&&this.spread<.02&&this.time>this.nextAdjustment){this.adjustmentStart=this.time;this.adjustmentSide=this.random()<.5?-1:1;this.nextAdjustment=this.time+5+this.random()*9;}
  const elapsed=this.time-this.adjustmentStart;
  this.twitch=elapsed>=0&&elapsed<.7?Math.sin(elapsed/.7*Math.PI)**2*.045:0;
  this.phase+=dt*Math.PI*2*this.frequency;
  return this;
 }
}
