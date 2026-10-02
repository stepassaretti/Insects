const codes={F:'KeyF',C:'KeyC',D:'KeyD',G:'KeyG',SHIFT:'ShiftLeft'};

export function setupTouchControls({controller,onActionDown,onActionUp}){
 const joystick=document.querySelector('.joystick');
 const thumb=joystick.querySelector('.joystick-thumb');
 const actions=document.querySelector('.touch-actions');
 const actionPointers=new Map();
 let joystickPointer=null;
 let toggleState={flying:false,displaying:false,cautious:false,sprint:false};

 function moveJoystick(event){
  const bounds=joystick.getBoundingClientRect();
  const radius=bounds.width/2;
  const rawX=event.clientX-(bounds.left+bounds.width/2);
  const rawY=event.clientY-(bounds.top+bounds.height/2);
  const scale=Math.min(1,radius/Math.max(radius,Math.hypot(rawX,rawY)));
  const x=rawX*scale,y=rawY*scale;
  thumb.style.transform=`translate(-50%,-50%) translate(${x}px,${y}px)`;
  controller.joystick.forward=Math.abs(y/radius)<.08?0:-y/radius;
  controller.joystick.turn=Math.abs(x/radius)<.08?0:-x/radius;
 }
 function resetJoystick(){
  joystickPointer=null;
  controller.joystick.forward=controller.joystick.turn=0;
  thumb.style.transform='translate(-50%,-50%)';
 }
 joystick.addEventListener('pointerdown',event=>{
  if(joystickPointer!==null)return;
  event.preventDefault();
  joystickPointer=event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  moveJoystick(event);
 });
 joystick.addEventListener('pointermove',event=>{if(event.pointerId===joystickPointer)moveJoystick(event);});
 for(const name of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(name,event=>{if(event.pointerId===joystickPointer)resetJoystick();});

 function setToggleStates(state){
  toggleState=state;
  for(const button of actions.querySelectorAll('.touch-action[data-toggle]')){
   const pressed={F:state.flying,D:state.displaying,C:state.cautious,SHIFT:state.sprint}[button.dataset.key];
   const pointerDown=[...actionPointers.values()].some(action=>action.button===button);
   button.classList.toggle('is-pressed',pressed||pointerDown);
   button.setAttribute('aria-pressed',String(pressed));
  }
 }
 function releaseAction(pointerId,event){
  const action=actionPointers.get(pointerId);
  if(!action)return;
  actionPointers.delete(pointerId);
  if(action.mode==='hold')onActionUp(action.code);
  if(action.mode==='toggle'&&event?.type==='pointerup'){
   const bounds=action.button.getBoundingClientRect();
   if(event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom)onActionDown(action.code,action.mode);
  }
  action.button.classList.remove('is-pressed');
  setToggleStates(toggleState);
 }
 actions.addEventListener('pointerdown',event=>{
  const button=event.target.closest('.touch-action');
  if(!button||actionPointers.has(event.pointerId))return;
  event.preventDefault();
  button.setPointerCapture(event.pointerId);
  const code=button.dataset.code,mode=button.dataset.mode;
  actionPointers.set(event.pointerId,{button,code,mode});
  button.classList.add('is-pressed');
  if(mode!=='toggle')onActionDown(code,mode);
 });
 for(const name of ['pointerup','pointercancel','lostpointercapture'])actions.addEventListener(name,event=>releaseAction(event.pointerId,event));
 actions.addEventListener('click',event=>{
  if(event.detail!==0)return;
  const button=event.target.closest('.touch-action');
  if(!button)return;
  const code=button.dataset.code,mode=button.dataset.mode;
  onActionDown(code,mode);
  if(mode==='hold')onActionUp(code);
 });
 function reset(){
  for(const pointerId of actionPointers.keys())releaseAction(pointerId);
  resetJoystick();
 }
 window.addEventListener('resize',()=>{if(innerWidth>=innerHeight)reset();});
 function setActions(legend,species){
  reset();
  actions.innerHTML=legend.map(([key,label,hint])=>{
   const mode=key==='G'?(species==='wasp'?'hold':'momentary'):'toggle';
   const actionHint=key==='C'||key==='SHIFT'?'Tap to turn on or off':hint;
   return `<button class="touch-action" type="button" data-key="${key}" data-code="${codes[key]}" data-mode="${mode}"${mode==='toggle'?' data-toggle="" aria-pressed="false"':''} aria-label="${label}: ${actionHint}"><strong>${key}</strong></button>`;
  }).join('');
  setToggleStates(toggleState);
 }
 return {setActions,setToggleStates,reset};
}
