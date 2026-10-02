import * as THREE from 'three';
import {createChitinMaterial} from './anatomy.js';
import {ellipsoid,rod,placeRod,contactMarker,up} from './parts.js';
import {params,LegIK,LocomotionController,AntennaController,solveIK,clamp} from './simulation.js';
import {WingMotion} from './wing-motion.js';

// Vespula (common wasp), modelled from a dorsal reference photograph. Every
// pigment pattern is painted procedurally in the surface's own (around, along)
// space, so stripes, anchors and spots follow the 3D shells exactly.
const TAU=Math.PI*2;
// Default specimen size relative to the modelled proportions; legs, stride
// and foot lift are scaled with it so the gait stays in proportion.
const S=.75;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const bump=(x,centre,width)=>Math.exp(-(((x-centre)/width)**2));
function random(seed){let s=seed>>>0||1;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

function canvasTexture(width,height,draw,srgb=true){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 draw(canvas.getContext('2d'),width,height);
 const texture=new THREE.CanvasTexture(canvas);if(srgb)texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture;
}
// Per-pixel cuticle grain and fine setal streaks over a painted pattern.
function grain(ctx,width,height,seed,amount=14){
 const image=ctx.getImageData(0,0,width,height),rand=random(seed);
 for(let i=0;i<image.data.length;i+=4){const n=(rand()-.5)*amount;for(let j=0;j<3;j++)image.data[i+j]=clamp(image.data[i+j]+n,0,255);}
 ctx.putImageData(image,0,0);
}
function bumpTexture(seed,scale=1){
 return canvasTexture(256,256,(ctx,w,h)=>{
  ctx.fillStyle='#808080';ctx.fillRect(0,0,w,h);const rand=random(seed);
  // Punctures and short hair sockets typical of vespid cuticle.
  for(let i=0;i<900*scale;i++){ctx.fillStyle=`rgba(0,0,0,${.12+rand()*.2})`;ctx.beginPath();ctx.arc(rand()*w,rand()*h,.6+rand()*1.1,0,TAU);ctx.fill();}
  grain(ctx,w,h,seed+1,30);
 },false);
}

// A closed body of revolution with an elliptical cross-section. u wraps around
// the body with the dorsal midline at u=.5; v runs front (t=0) to back (t=1).
function shellPoint(spec,t,angle){
 const w=spec.width(t),h=spec.height(t),y=spec.y?spec.y(t):0;
 return new THREE.Vector3(Math.sin(angle)*w,y+Math.cos(angle)*h,spec.z0+t*spec.length);
}
function shell(parent,material,spec,rows=56,cols=64){
 const positions=[],uvs=[],indices=[];
 for(let r=0;r<=rows;r++){const t=r/rows;for(let c=0;c<=cols;c++){const u=c/cols;const p=shellPoint(spec,t,(u-.5)*TAU);positions.push(p.x,p.y,p.z);uvs.push(u,1-t);}}
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const a=r*(cols+1)+c,b=a+1,d=a+cols+1,e=d+1;indices.push(a,d,b,b,d,e);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
// Fine setae baked into one static mesh (they never move relative to their
// shell), rooted in the surface and swept backwards. Baking rather than
// instancing keeps draw state simple and costs one draw call per patch.
const hairTemplate=new THREE.CylinderGeometry(.25,1,1,3,1,true).translate(0,.5,0).toNonIndexed();
function hairs(parent,material,spec,count,{seed=1,from=0,to=1,length=[.04,.08],radius=.0045,spread=Math.PI,sweep=.45,lift=.2,crown=.4}={}){
 const rand=random(seed),template=hairTemplate.attributes.position,templateNormal=hairTemplate.attributes.normal,n=template.count;
 const positions=new Float32Array(count*n*3),normals=new Float32Array(count*n*3);
 const m=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3(),q=new THREE.Quaternion(),scale=new THREE.Vector3(),direction=new THREE.Vector3(),v=new THREE.Vector3();
 for(let i=0;i<count;i++){
  const t=from+(to-from)*rand(),angle=(rand()*2-1)*spread;
  const p=shellPoint(spec,t,angle);const w=spec.width(t),h=spec.height(t);
  direction.set(Math.sin(angle)/Math.max(w,.01),Math.cos(angle)/Math.max(h,.01),0).normalize();
  direction.z+=sweep+(rand()-.5)*.5;direction.y+=lift;direction.x+=(rand()-.5)*.4;direction.normalize();
  p.addScaledVector(direction,-.006);
  q.setFromUnitVectors(up,direction);const len=(length[0]+(length[1]-length[0])*rand())*(crown+(1-crown)*Math.abs(Math.sin(angle)));scale.set(radius,len,radius);
  m.compose(p,q,scale);normalMatrix.getNormalMatrix(m);
  for(let j=0;j<n;j++){const o=(i*n+j)*3;v.fromBufferAttribute(template,j).applyMatrix4(m);positions.set([v.x,v.y,v.z],o);v.fromBufferAttribute(templateNormal,j).applyMatrix3(normalMatrix).normalize();normals.set([v.x,v.y,v.z],o);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
 const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=false;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}

const YELLOW=[228,168,42],YELLOW_DEEP=[204,134,30],BLACK=[27,21,15];
const rgb=([r,g,b],a=1)=>`rgba(${r|0},${g|0},${b|0},${a})`;
// Surface painter: callbacks receive (angle in degrees from the dorsal
// midline, t along the part) so patterns are written in anatomical terms.
function painted(width,height,seed,paint){
 return canvasTexture(width,height,(ctx,w,h)=>{
  const image=ctx.createImageData(w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const angle=(x/(w-1)-.5)*360,t=y/(h-1);const [r,g,b]=paint(angle,t);const i=(y*w+x)*4;image.data[i]=r;image.data[i+1]=g;image.data[i+2]=b;image.data[i+3]=255;}
  ctx.putImageData(image,0,0);grain(ctx,w,h,seed,12);
 });
}
const mix=(a,b,k)=>a.map((v,i)=>v+(b[i]-v)*k);
function ellipseMask(angle,t,a0,t0,ra,rt,edge=.35){const d=Math.hypot((angle-a0)/ra,(t-t0)/rt);return 1-smooth(1-edge,1,d);}

// Spindle-shaped leg segments, narrow at the joints and swollen in the
// middle as in the reference photo. Unit length along +y like the rod
// cylinder; `from`/`to` take a slice of one profile, so a segment drawn as
// two pieces (the femur) keeps a single continuous swelling.
function spindle(peak,ends,peakAt,from=0,to=1){
 const points=[],steps=20;
 for(let k=0;k<=steps;k++){
  const t=from+(to-from)*k/steps,warp=t<peakAt?.5*t/peakAt:.5+.5*(t-peakAt)/(1-peakAt);
  points.push(new THREE.Vector2(ends+(peak-ends)*Math.sin(Math.PI*warp)**1.1,k/steps-.5));
 }
 points.unshift(new THREE.Vector2(0,-.5));points.push(new THREE.Vector2(0,.5));
 return new THREE.LatheGeometry(points,14);
}
const FEMUR_SPLIT=.58;
const legShapes={coxa:spindle(1.2,.7,.45),femurBase:spindle(1.4,.6,.5,0,FEMUR_SPLIT),femurTip:spindle(1.4,.6,.5,FEMUR_SPLIT,1),tibia:spindle(1.35,.6,.6),tarsomere:spindle(1.3,.65,.6)};
function limb(parent,material,radius,geometry){const m=new THREE.Mesh(geometry,material);m.userData.radius=radius;m.castShadow=true;parent.add(m);return m;}
// Smooth, flat-capped ring for the tarsal joints and a cone for the claw point.
const ringGeometry=new THREE.CylinderGeometry(1,1,1,18),hookTipGeometry=new THREE.ConeGeometry(1,1,8);
function cuticle(map,{roughness=.42,clearcoat=.55,bumpSeed=1}={}){
 return new THREE.MeshPhysicalMaterial({map,roughness,metalness:0,clearcoat,clearcoatRoughness:.28,specularIntensity:.55,bumpMap:bumpTexture(bumpSeed),bumpScale:.0025});
}

// Forewing and hindwing venation in (span t, chord q) space, q=0 at the
// leading edge. Veins are amber, the costal cell smoky, the stigma dark.
function wingTexture(kind){
 return canvasTexture(1024,512,(ctx,w,h)=>{
  const X=t=>t*w,Y=q=>q*h;
  const membrane=ctx.createLinearGradient(0,0,0,h);membrane.addColorStop(0,'rgba(140,108,62,.52)');membrane.addColorStop(.35,'rgba(160,140,112,.4)');membrane.addColorStop(1,'rgba(175,165,150,.33)');
  ctx.fillStyle=membrane;ctx.fillRect(0,0,w,h);
  const rand=random(kind+40);
  for(let i=0;i<5000;i++){ctx.fillStyle=`rgba(90,70,45,${.04+rand()*.05})`;ctx.fillRect(rand()*w,rand()*h,1,1);}
  const vein=(points,width,alpha=.92,color='120,72,26')=>{
   ctx.beginPath();ctx.moveTo(X(points[0][0]),Y(points[0][1]));
   for(let i=1;i<points.length-1;i++){const mx=(points[i][0]+points[i+1][0])/2,my=(points[i][1]+points[i+1][1])/2;ctx.quadraticCurveTo(X(points[i][0]),Y(points[i][1]),X(mx),Y(my));}
   const last=points.at(-1);ctx.lineTo(X(last[0]),Y(last[1]));
   ctx.strokeStyle=`rgba(${color},${alpha})`;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
  };
  if(kind===0){
   const costal=ctx.createLinearGradient(0,0,X(.6),0);costal.addColorStop(0,'rgba(160,98,34,.62)');costal.addColorStop(1,'rgba(170,110,40,.3)');
   ctx.fillStyle=costal;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(X(.56),0);ctx.lineTo(X(.52),Y(.09));ctx.lineTo(0,Y(.1));ctx.fill();
   vein([[0,.012],[.3,.012],[.6,.012]],9,.95,'104,60,22');
   vein([[.6,.012],[.8,.01],[.96,.015]],4,.8);
   ctx.fillStyle='rgba(98,55,20,.95)';ctx.beginPath();ctx.ellipse(X(.555),Y(.045),X(.055),Y(.045),0,0,TAU);ctx.fill();
   vein([[0,.07],[.25,.085],[.5,.09]],6);
   vein([[.58,.08],[.72,.15],[.86,.13],[.935,.04],[.955,.012]],3.5);
   vein([[.45,.1],[.6,.22],[.78,.25],[.86,.2],[.9,.14]],3.2);
   vein([[.53,.1],[.535,.25]],2.8);vein([[.645,.14],[.64,.27]],2.8);vein([[.76,.15],[.755,.255]],2.6);vein([[.845,.13],[.85,.22]],2.4);
   vein([[0,.2],[.22,.24],[.45,.26]],5);vein([[.45,.26],[.66,.31],[.96,.37]],2.6,.72);
   vein([[.45,.1],[.455,.27]],3);
   vein([[0,.3],[.25,.41],[.48,.47],[.7,.52],[.93,.52]],3.6,.85);
   vein([[.49,.27],[.5,.47]],2.6);vein([[.66,.31],[.67,.51]],2.4,.8);
   vein([[.24,.4],[.26,.6]],2.6);
   vein([[0,.42],[.18,.6],[.36,.72]],3.2,.85);
   vein([[0,.99],[.5,.992],[1,.99]],2.4,.55);
  }else{
   vein([[0,.02],[.3,.02],[.56,.02]],6,.9,'104,60,22');
   for(let i=0;i<9;i++){const t=.5+i*.009;vein([[t,.01],[t+.004,.045]],1.5,.9,'70,40,15');}
   vein([[0,.08],[.4,.12],[.9,.1]],3.5,.8);
   vein([[0,.18],[.35,.28],[.85,.34]],3.2,.72);
   vein([[0,.28],[.3,.44],[.7,.55]],3,.72);
   vein([[.28,.1],[.3,.28]],2.4);vein([[.36,.29],[.38,.45]],2.2,.8);
   vein([[0,.5],[.15,.74]],2.4,.7);vein([[0,.6],[.1,.9]],1.8,.5);
   vein([[0,.99],[.5,.992],[1,.99]],2.2,.5);
  }
 });
}
// A grid wing whose outline is the geometry itself (no alpha cut-outs).
function wingGeometry(kind){
 const span=kind===0?2.45:1.6,chord=kind===0?.7:.5,rows=30,cols=10,positions=[],uvs=[],indices=[];
 for(let i=0;i<=rows;i++){const t=i/rows;
  let width=chord*(.16+.84*smooth(0,.5,t))*(t<.6?1:Math.sqrt(Math.max(0,1-((t-.6)/.4)**2)));
  if(kind===1)width+=chord*.3*bump(t,.16,.1);
  const leading=-chord*.14-(width-chord*.16)*.12;
  for(let j=0;j<=cols;j++){const q=j/cols;positions.push(t*span,0,leading+q*Math.max(width,.004));uvs.push(t,1-q);}
 }
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+1,c=a+cols+1,d=c+1;indices.push(a,b,c,b,d,c);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 return geometry;
}

export function createWasp(controller){
 const group=new THREE.Group();
 const body=new THREE.Group();body.scale.setScalar(S);group.add(body);
 const hairMat=new THREE.MeshStandardMaterial({color:0x8f7045,roughness:.85,metalness:0});
 const darkHairMat=new THREE.MeshStandardMaterial({color:0x3b2c1d,roughness:.9,metalness:0});
 const black=createChitinMaterial({seed:21,base:[22,18,14]});black.roughness=.34;black.clearcoat=.6;black.clearcoatRoughness=.25;black.specularIntensity=.6;
 const leg=createChitinMaterial({seed:23,base:[200,122,34]});leg.roughness=.48;leg.clearcoat=.35;const tarsus=createChitinMaterial({seed:24,base:[182,104,28]});tarsus.roughness=.5;
 // Tarsal rings a shade deeper than the shaft; the last tarsomere and its
 // claw hook in a darker orange.
 const tarsalRing=createChitinMaterial({seed:28,base:[168,90,22]});tarsalRing.roughness=.4;tarsalRing.clearcoat=.4;
 const tarsusTip=createChitinMaterial({seed:29,base:[140,62,14]});tarsusTip.roughness=.42;tarsusTip.clearcoat=.45;
 const legDark=createChitinMaterial({seed:25,base:[36,26,17]});legDark.roughness=.45;legDark.clearcoat=.4;
 const yellow=createChitinMaterial({seed:27,base:[226,170,46]});yellow.roughness=.45;yellow.clearcoat=.4;

 // Mesosoma: pronotal collar, glossy scutum, scutellum and propodeum as one
 // shell with shallow sutures; yellow marks follow the Vespula pattern.
 const thoraxSpec={z0:-1.12,length:1.14,
  width:t=>{const s=t<.42?t/.42*.5:.5+(t-.42)/.58*.5;return .41*Math.pow(Math.sin(Math.PI*s),.55)*(1-.1*bump(t,.63,.025))*(1-.13*bump(t,.78,.022));},
  height:t=>{const s=t<.42?t/.42*.5:.5+(t-.42)/.58*.5;return .27*Math.pow(Math.sin(Math.PI*s),.6)*(1-.12*bump(t,.63,.025))*(1-.16*bump(t,.78,.022));},
  y:t=>.12-.1*t*t};
 const thoraxMap=painted(512,512,31,(a,t)=>{
  const abs=Math.abs(a);let c=mix(BLACK,[12,10,8],smooth(20,0,abs)*.5);
  const collar=smooth(.02,.05,t)*(1-smooth(.075,.1,t))*smooth(25,40,abs);
  const shoulder=ellipseMask(abs-(50-t*18),t,0,.25,5,.19,.5)*(t>.06&&t<.46?1:0);
  const tegula=ellipseMask(abs,t,86,.42,9,.05);
  const scutellum=ellipseMask(abs,t,15,.69,10,.035);
  const metanotum=ellipseMask(abs,t,0,.785,14,.012);
  const propodeum=ellipseMask(abs,t,32,.89,9,.03);
  const ventral=smooth(110,125,abs)*ellipseMask(abs,t,140,.3,25,.12);
  const yellowK=Math.max(collar,shoulder,scutellum,metanotum,propodeum,ventral);
  c=mix(c,YELLOW,yellowK);c=mix(c,[150,92,30],tegula);return c;
 });
 const thorax=cuticle(thoraxMap,{roughness:.3,clearcoat:.75,bumpSeed:33});
 shell(body,thorax,thoraxSpec);
 hairs(body,hairMat,thoraxSpec,1500,{seed:35,from:.02,to:.98,length:[.035,.065],spread:Math.PI*.95,sweep:.15,lift:.35,crown:.25});
 hairs(body,darkHairMat,thoraxSpec,500,{seed:36,from:.08,to:.62,length:[.02,.035],spread:1.2,sweep:.3,lift:.1});
 // Tegulae: small translucent amber scales over the wing bases.
 const tegulaMat=new THREE.MeshPhysicalMaterial({color:0x9a5c1e,roughness:.35,clearcoat:.7,metalness:0});
 for(const s of [-1,1])ellipsoid(body,tegulaMat,[s*.31,.2,-.62],[.06,.035,.09]);

 // Petiole and gaster. Tergites overlap like telescoping rings; each is a
 // separate shell so the gaster can pump, lift and swing.
 const petioleSpec={z0:-.01,length:.2,width:t=>.075*Math.pow(Math.sin(Math.PI*t),.4)+.01,height:t=>.07*Math.pow(Math.sin(Math.PI*t),.4)+.01,y:t=>.0-.05*t};
 shell(body,black,petioleSpec,16,24);
 const gaster=new THREE.Group();gaster.position.set(0,-.05,.13);body.add(gaster);
 // One ovoid envelope: steep anterior face on the petiole, widest at T2,
 // tapering to the sting. Each tergite flares slightly then tucks its rim.
 const envelopeW=z=>z<.62?.06+.415*Math.pow(Math.sin(Math.PI/2*Math.min(1,z/.62)),.6):.475*Math.pow(Math.max(0,1-((z-.62)/.8)**2),.62);
 const envelopeY=z=>-.02-.07*smooth(.5,1.42,z);
 const segmentSpans=[[0,.36],[.3,.34],[.58,.3],[.82,.26],[1.02,.22],[1.18,.24]],overlap=.06,gasterEnd=1.42;
 const segments=[];
 segmentSpans.forEach(([z0,length],k)=>{
  const last=k===segmentSpans.length-1;
  const rim=t=>last?1:Math.sqrt(Math.max(0,1-(smooth(.9,1,t))**2)*(1-smooth(.985,1,t)))*(1+.035*smooth(.3,.9,t));
  const spec={z0:0,length,width:t=>envelopeW(z0+t*length)*rim(t)+.003,height:t=>envelopeW(z0+t*length)*.66*rim(t)+.003,y:t=>envelopeY(z0+t*length)};
  const hidden=k===0?0:overlap/length,band=k===0?.52:hidden+[.24,.21,.18,.14,.08][k-1];
  const map=painted(512,256,50+k,(a,t)=>{
   const abs=Math.abs(a);
   let c=mix(YELLOW,YELLOW_DEEP,smooth(.3,1,t)*.5+smooth(70,150,abs)*.35);
   let edge=band+(k>0&&k<5?.2:.06)*Math.max(0,1-abs/15)+(k>0?.06:0)*bump(abs,38,10)+.01*Math.sin(abs*.35+k);
   if(k===0)edge=.54-.06*bump(abs,0,12)+.05*bump(abs,55,20);
   let dark=1-smooth(edge-.015,edge+.015,t);
   if(k>0&&k<4)dark=Math.max(dark,ellipseMask(abs,t,30,band+.17,6,.06));
   if(k===0)dark=Math.max(dark,ellipseMask(abs,t,0,.64,4,.05));
   c=mix(c,k===0?[40,29,18]:BLACK,dark);
   c=mix(c,[150,92,28],smooth(.88,1,t)*.45*(last?0:1));
   return c;
  });
  const material=cuticle(map,{roughness:.4,clearcoat:.5,bumpSeed:60+k});
  // Each tergite hangs off the previous one, so per-segment bends compound
  // into a curl and per-link shortening telescopes the whole abdomen.
  const parent=k===0?gaster:segments[k-1].holder,offset=k===0?0:z0-segmentSpans[k-1][0];
  const holder=new THREE.Group();holder.position.z=offset;parent.add(holder);holder.userData.base=offset;
  shell(holder,material,spec,40,56);
  hairs(holder,hairMat,spec,[520,260,180,130,90,70][k],{seed:70+k,from:hidden,to:.93,length:k===0?[.03,.055]:[.018,.035],radius:.004,spread:Math.PI*.92,sweep:.7,lift:.05,crown:.3});
  segments.push({holder});
 });
 // Sting: a tapered, glossy shaft housed in the last tergite. It slides out
 // along the curl when G is held, jabs, and beads a venom droplet at full reach.
 const stingerMat=new THREE.MeshPhysicalMaterial({color:0x24140a,roughness:.25,clearcoat:.8,clearcoatRoughness:.1});
 const tipSegment=segments.at(-1).holder,tipLength=segmentSpans.at(-1)[1],tipY=envelopeY(gasterEnd);
 const stinger=new THREE.Mesh(new THREE.CylinderGeometry(0,1,1,10),stingerMat);stinger.userData.radius=.02;stinger.castShadow=true;tipSegment.add(stinger);
 const venom=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),new THREE.MeshPhysicalMaterial({color:0xf1ead0,roughness:.04,clearcoat:1,transparent:true,opacity:.6,specularIntensity:1}));venom.visible=false;tipSegment.add(venom);
 const stingDirection=new THREE.Vector3(0,-.12,1).normalize();

 // Head: hypognathous, black vertex with three ocelli, large emarginate
 // compound eyes, yellow face and genae, yellow mandibles with dark teeth.
 const head=new THREE.Group();head.position.set(0,.08,-1.31);body.add(head);
 const headSpec={z0:-.2,length:.4,width:t=>.39*Math.pow(Math.sin(Math.PI*Math.min(1,t*1.02)),.32)*(.84+.16*t)+.004,height:t=>.22*Math.pow(Math.sin(Math.PI*Math.min(1,t*1.02)),.5)+.004,y:t=>-.05+.05*t};
 const headMap=painted(512,256,41,(a,t)=>{
  const abs=Math.abs(a);let c=BLACK;
  const face=(1-smooth(.2,.32,t))*(1-smooth(55,75,abs));
  const frontalMark=ellipseMask(abs,t,0,.1,6,.12);
  const gena=ellipseMask(abs,t,78,.72,14,.15);
  const ventral=smooth(110,130,abs);
  c=mix(c,YELLOW,Math.max(face*(1-frontalMark),gena,ventral));return c;
 });
 shell(head,cuticle(headMap,{roughness:.32,clearcoat:.7,bumpSeed:43}),headSpec,40,56);
 hairs(head,hairMat,headSpec,420,{seed:45,from:.05,to:.95,length:[.025,.045],spread:Math.PI*.8,sweep:-.1,lift:.4,crown:.35});
 const facets=canvasTexture(256,256,(ctx,w,h)=>{ctx.fillStyle='#8a8a8a';ctx.fillRect(0,0,w,h);for(let y=0;y<h;y+=5)for(let x=0;x<w;x+=5.6){ctx.fillStyle='#b8b8b8';ctx.beginPath();ctx.arc(x+(y/5%2)*2.8,y,1.8,0,TAU);ctx.fill();}},false);
 facets.wrapS=facets.wrapT=THREE.RepeatWrapping;facets.repeat.set(3,3);
 const eyeMat=new THREE.MeshPhysicalMaterial({color:0x4b4038,roughness:.38,metalness:0,clearcoat:1,clearcoatRoughness:.12,specularIntensity:.8,bumpMap:facets,bumpScale:.004});
 for(const s of [-1,1]){
  const eye=ellipsoid(head,eyeMat,[s*.28,.035,-.01],[.12,.14,.2]);eye.rotation.y=s*.28;
  // Inner emargination: the yellow frons fills the notch of the kidney.
  const notch=ellipsoid(head,yellow,[s*.18,.07,-.15],[.05,.055,.06]);notch.rotation.y=s*.3;
 }
 const ocellusMat=new THREE.MeshPhysicalMaterial({color:0x9c3e16,roughness:.2,clearcoat:1,clearcoatRoughness:.05,specularIntensity:1});
 for(const [x,zz] of [[0,-.02],[-.055,.04],[.055,.04]])ellipsoid(head,ocellusMat,[x,.145,zz],[.022,.014,.022]);
 const mandibles=[-1,1].map(side=>({side,base:rod(head,yellow,.03),tooth:rod(head,legDark,.02)}));

 // Wings: four translucent membranes; forewings folded longitudinally along
 // the gaster at rest. Two faint motion ghosts give the beating stroke blur.
 const wingGeo=[wingGeometry(0),wingGeometry(1)],wingTex=[wingTexture(0),wingTexture(1)];
 const wingMaterial=(kind,opacity)=>new THREE.MeshPhysicalMaterial({map:wingTex[kind],color:0xffffff,roughness:.22,metalness:0,clearcoat:.6,clearcoatRoughness:.15,specularIntensity:.7,iridescence:.55,iridescenceIOR:1.33,iridescenceThicknessRange:[200,480],transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide});
 const motion=new WingMotion(Math.random,47);
 const wings=[];
 for(const side of [-1,1])for(const kind of [0,1]){
  // Hinges sit high enough that the folded wings clear the gaster's crown.
  const hinge=new THREE.Vector3(side*.3,kind===0?.28:.26,kind===0?-.64:-.44);
  const layers=[1,.42,.2].map((opacity,ghost)=>{
   const pivot=new THREE.Group();pivot.position.copy(hinge);body.add(pivot);
   const mesh=new THREE.Mesh(wingGeo[kind],wingMaterial(kind,opacity));mesh.scale.x=side;mesh.renderOrder=2+kind;pivot.add(mesh);mesh.castShadow=false;
   pivot.visible=ghost===0;return {pivot,mesh,ghost};
  });
  wings.push({side,kind,layers});
 }
 function flexWings(phase,spread){
  for(const [kind,geometry] of wingGeo.entries()){const attr=geometry.attributes.position,uv=geometry.attributes.uv;for(let i=0;i<attr.count;i++){const t=uv.getX(i),q=1-uv.getY(i);attr.setY(i,(Math.sin(phase-2.4*t+kind*.4)*t*t*.14+Math.cos(phase)*q*t*.06)*spread+q*(1-q)*.02*(1-spread*.5));}attr.needsUpdate=true;geometry.computeVertexNormals();}
 }
 function poseWings(){
  const s=motion.spread;
  for(const {side,kind,layers} of wings){
   const twitch=motion.adjustmentSide===side?motion.twitch:motion.twitch*.3;
   for(const {pivot,mesh,ghost} of layers){
    const phase=motion.phase-ghost*.55-kind*.12;
    const restYaw=-side*(Math.PI/2-(kind===0?.03:.07)),openYaw=-side*(kind===0?.12:.42);
    pivot.rotation.order='YZX';
    pivot.rotation.y=THREE.MathUtils.lerp(restYaw,openYaw,s)+side*Math.cos(phase)*.18*s;
    pivot.rotation.z=side*(THREE.MathUtils.lerp(kind===0?-.02:-.015,.12,s)+Math.sin(phase)*.72*s+twitch*2.2);
    pivot.rotation.x=Math.cos(phase)*.5*s;
    // Longitudinal fold narrows the resting forewing; hindwing tucks beneath.
    mesh.scale.z=THREE.MathUtils.lerp(kind===0?.42:.5,1,s);
    // At rest the longitudinal pleat doubles the membrane, so ghost 1 (posed
    // identically when still) stacks on the wing; in flight it becomes blur.
    const folded=ghost===1?1-smooth(0,.3,s):0;
    pivot.visible=ghost===0||s>.35||folded>0;
    if(ghost)mesh.material.opacity=Math.max([0,.42,.2][ghost]*smooth(.35,.9,s),folded*.85);
   }
  }
  flexWings(motion.phase,s);
 }

 // Legs: black coxae and femoral bases, yellow-orange tibiae and five-part
 // tarsi ending in a mantis-like toed foot. Hind legs are longest and reach past the waist.
 const legs=[];
 const hips=[[.15,-.1,-.9],[.21,-.12,-.52],[.21,-.12,-.26]],rests=[[.95,-1.72],[1.46,-.12],[1.18,.98]];
 const lengths=[[.56,.62,.42],[.62,.72,.46],[.7,.86,.5]];
 for(let row=0;row<3;row++)for(const side of [-1,1]){
  const i=legs.length,lg=(row+(side===-1?0:1))%2;
  const l=new LegIK([side*hips[row][0],hips[row][1],hips[row][2]],[side*rests[row][0]*S,.025,rests[row][1]*S],side,lg,i);
  [l.femurLength,l.tibiaLength,l.tarsusLength]=lengths[row].map(v=>v*S);l.row=row;
  l.coxa=limb(group,legDark,.052*S,legShapes.coxa);l.trochanter=ellipsoid(group,legDark,[0,0,0],[.036*S,.036*S,.036*S]);
  l.femurBase=limb(group,legDark,.034*S,legShapes.femurBase);l.femurTip=limb(group,leg,.034*S,legShapes.femurTip);l.knee=ellipsoid(group,leg,[0,0,0],[.029*S,.029*S,.029*S]);
  l.tibia=limb(group,leg,.026*S,legShapes.tibia);l.ankleJoint=ellipsoid(group,tarsus,[0,0,0],[.023*S,.023*S,.023*S]);
  l.tarsi=Array.from({length:5},(_,j)=>limb(group,j===4?tarsusTip:tarsus,(.02-j*.0016)*S,legShapes.tarsomere));
  // A fat, crisp-edged ring at the end of each tarsomere.
  l.tarsalRings=Array.from({length:5},(_,j)=>{const m=new THREE.Mesh(ringGeometry,j===4?tarsusTip:tarsalRing);m.userData.radius=(.031-j*.0022)*S;m.castShadow=true;group.add(m);return m;});
  // A tiny curved claw hook at the tip of the foot.
  l.hook=[.0075,.006,.0042].map(r=>rod(group,tarsusTip,r*S));l.hookTip=new THREE.Mesh(hookTipGeometry,tarsusTip);l.hookTip.castShadow=true;group.add(l.hookTip);
  l.spurs=[rod(group,tarsus,.006*S),rod(group,tarsus,.005*S)];
  l.setae=Array.from({length:7},()=>rod(group,hairMat,.004*S));
  l.marker=contactMarker(group,lg);legs.push(l);
 }
 const locomotion=new LocomotionController(controller,legs,S);
 const antennae=[-1,1].map(side=>({side,brain:new AntennaController(side),scape:rod(head,legDark,.03),pedicel:ellipsoid(head,legDark,[0,0,0],[.034,.034,.034]),segments:Array.from({length:12},(_,i)=>rod(head,i%2?legDark:black,.03-i*.0008))}));
 let flick={next:3,start:-10,amount:0},pumpLevel=0,lift=0,stingLevel=0;
 const tmp=new THREE.Vector3(),horizontal=new THREE.Vector3();

 function update(dt,t,{idle,debug,flying}){
  locomotion.update(dt,t,idle);motion.update(dt,flying);poseWings();
  const moving=Math.min(1,Math.abs(controller.speed)+Math.abs(controller.turn));const phase=locomotion.gait.phase*TAU;const osc=params.bodyOscillation*moving;
  lift=THREE.MathUtils.damp(lift,motion.spread,4,dt);
  stingLevel=THREE.MathUtils.damp(stingLevel,Number(controller.keys.has('KeyG')),stingLevel<.5?9:6,dt);
  body.position.copy(controller.position);body.position.y=controller.position.y+controller.flight.settle+(.56+lift*.07+stingLevel*.1)*S+Math.cos(phase*2)*osc*.45+Math.sin(t*1.7)*.002+Math.sin(motion.phase*.5)*.004*motion.spread;
  body.rotation.set(clamp(-controller.accel*.0012,-.035,.035)-lift*.05,controller.yaw+Math.sin(phase)*osc*.16,Math.sin(phase)*osc*.38-controller.turn*controller.speed*.0016);body.updateMatrixWorld(true);
  head.rotation.y=THREE.MathUtils.damp(head.rotation.y,clamp(controller.turn*.09,-.18,.18)+Math.sin(t*.7)*.03,8,dt);head.rotation.x=Math.sin(t*.5+1)*.02;

  // Gaster: respiratory pumping (stronger after buzzing), turn-following
  // swing and an occasional dorsoventral flick.
  pumpLevel=THREE.MathUtils.damp(pumpLevel,.35+motion.spread*.65+moving*.2,1.2,dt);
  const pump=Math.sin(t*TAU*1.35)*pumpLevel;
  if(t>flick.next){flick.start=t;flick.amount=.06+Math.random()*.08;flick.next=t+4+Math.random()*7;}
  const fp=(t-flick.start)/.45,flickAngle=fp>=0&&fp<1?Math.sin(fp*Math.PI)**2*flick.amount:0;
  const jab=stingLevel*Math.max(0,Math.sin(t*8.5))**6;
  gaster.rotation.x=THREE.MathUtils.damp(gaster.rotation.x,.1+stingLevel*.04+jab*.05+flickAngle+clamp(controller.accel*.002,-.04,.04)+Math.cos(phase*2)*osc*.6,10,dt);
  gaster.rotation.y=THREE.MathUtils.damp(gaster.rotation.y,clamp(-controller.turn*.07,-.14,.14),6,dt);
  // Stinging contracts the gaster: tergites telescope (-.045 per link),
  // squeeze slightly and curl the tip down and under.
  const curl=[0,.02,.05,.08,.11,.14];
  segments.forEach(({holder},k)=>{const link=k>0?1:0;holder.position.z=holder.userData.base+(pump*.009-stingLevel*.045)*link;holder.rotation.x=stingLevel*curl[k]+jab*.03*link;holder.scale.y=1+(pump*.035-stingLevel*.04)*link;holder.scale.x=1+(pump*.012-stingLevel*.05)*link;});
  const reach=.03+stingLevel*.3+jab*.06;
  const base=new THREE.Vector3(0,tipY+.012,tipLength-.1),tip=new THREE.Vector3(0,tipY,tipLength-.01).addScaledVector(stingDirection,reach);
  placeRod(stinger,base,tip,.022+stingLevel*.006);
  venom.visible=stingLevel>.85;venom.position.copy(tip).addScaledVector(stingDirection,.008);venom.scale.setScalar(.004+smooth(.85,1,stingLevel)*.014);

  for(const {side,base,tooth} of mandibles){const open=.05+Math.max(0,Math.sin(t*1.3+side))**6*.08;const a=new THREE.Vector3(side*.1,-.13,-.16),b=new THREE.Vector3(side*(.05-open),-.16,-.28),c=new THREE.Vector3(side*(-.005-open*.5),-.16,-.31);placeRod(base,a,b);placeRod(tooth,b,c);}

  for(const l of legs){
   const hip=new THREE.Vector3(...l.hip).applyMatrix4(body.matrixWorld);
   const coxa=new THREE.Vector3(l.hip[0]+l.side*.13,l.hip[1]-.06,l.hip[2]+(l.row-1)*.03).applyMatrix4(body.matrixWorld);
   horizontal.copy(l.foot).sub(hip).setY(0).normalize();
   const ankle=l.foot.clone().addScaledVector(horizontal,-l.tarsusLength*.82).add(tmp.set(0,.13*S,0));
   const pole=new THREE.Vector3(l.side*.75,1,l.row===0?-.25:l.row===2?.35:0).applyAxisAngle(up,controller.yaw);
   const knee=solveIK(coxa,ankle,l.femurLength,l.tibiaLength,pole);
   placeRod(l.coxa,hip,coxa);l.trochanter.position.copy(coxa);
   const femurMid=coxa.clone().lerp(knee,FEMUR_SPLIT);placeRod(l.femurBase,coxa,femurMid);placeRod(l.femurTip,femurMid,knee);l.knee.position.copy(knee);
   placeRod(l.tibia,knee,ankle);l.ankleJoint.position.copy(ankle);
   // Tarsus arcs down from the ankle and lies along the ground to the foot.
   const control=l.foot.clone().addScaledVector(horizontal,-l.tarsusLength*.3).add(tmp.set(0,.012*S,0));
   const share=[0,.36,.56,.71,.84,1];let prev=ankle;
   for(let j=0;j<5;j++){const u=share[j+1];const p=ankle.clone().multiplyScalar((1-u)**2).addScaledVector(control,2*u*(1-u)).addScaledVector(l.foot,u*u);placeRod(l.tarsi[j],prev,p);const dir=p.clone().sub(prev).normalize(),width=(.017-j*.0012)*S;placeRod(l.tarsalRings[j],p.clone().addScaledVector(dir,-width),p.clone().addScaledVector(dir,width*.35));prev=p;}
   const across=new THREE.Vector3(-horizontal.z,0,horizontal.x);
   // Hook: out along the ground, then curling down to a sharp point.
   const hookPoints=[l.foot,l.foot.clone().addScaledVector(horizontal,.028*S).add(tmp.set(0,.004*S,0)),l.foot.clone().addScaledVector(horizontal,.046*S).add(tmp.set(0,-.004*S,0)),l.foot.clone().addScaledVector(horizontal,.052*S).add(tmp.set(0,-.018*S,0))];
   l.hook.forEach((seg,k)=>placeRod(seg,hookPoints[k],hookPoints[k+1]));
   const tipDir=hookPoints[3].clone().sub(hookPoints[2]).normalize();l.hookTip.position.copy(hookPoints[3]).addScaledVector(tipDir,.006*S);l.hookTip.quaternion.setFromUnitVectors(up,tipDir);l.hookTip.scale.set(.0042*S,.012*S,.0042*S);
   const tibiaDir=ankle.clone().sub(knee).normalize();
   l.spurs.forEach((spur,j)=>{const a=ankle.clone().addScaledVector(tibiaDir,-.02*S);placeRod(spur,a,a.clone().addScaledVector(tibiaDir,.08*S).addScaledVector(across,(j?.025:-.025)*S).add(tmp.set(0,-.02*S,0)));});
   l.setae.forEach((seta,j)=>{const a=knee.clone().lerp(ankle,.15+j*.11);placeRod(seta,a,a.clone().addScaledVector(across,(j%2?-.045:.045)*S).add(tmp.set(0,-.02*S,0)).addScaledVector(tibiaDir,.04*S));});
   l.marker.position.copy(l.foot);l.marker.position.y=.01;l.marker.visible=debug;l.marker.material.opacity=l.planted?1:.3;
  }

  // Elbowed antennae: short scape rising from the frons, then a thick
  // 12-part flagellum that curls outward and taps the ground while walking.
  for(const a of antennae){
   const {sweep,bend}=a.brain.update(t,dt,controller.speed,controller.turn);
   const socket=new THREE.Vector3(a.side*.075,.03,-.2);
   const scapeDir=new THREE.Vector3(a.side*(.28+sweep*.35),.5,-1).normalize();
   const elbow=socket.clone().addScaledVector(scapeDir,.27);placeRod(a.scape,socket,elbow);a.pedicel.position.copy(elbow);
   const tap=(moving>.05?Math.max(0,Math.sin(t*7.5+a.side*1.6))**3*.35:0)+Math.max(0,Math.sin(t*1.1+a.side*2))**12*.25;
   let angle=a.side*(.3+sweep*.9),pitch=.1,previous=elbow.clone();
   for(let i=0;i<a.segments.length;i++){
    const u=(i+1)/a.segments.length;angle+=a.side*(.055+bend*.04);pitch-=.07+tap*.05+u*.02;
    const p=previous.clone().add(tmp.set(Math.sin(angle)*Math.cos(pitch),Math.sin(pitch),-Math.cos(angle)*Math.cos(pitch)).multiplyScalar(.062));
    placeRod(a.segments[i],previous,p);previous=p;
   }
  }
 }
 function reset(){locomotion.reset();motion.reset();stingLevel=0;poseWings();}
 poseWings();
 // No sprint; G holds the sting.
 return {id:'wasp',group,body,legs,locomotion,wings:{motion},bodyLength:2.9*S,profile:{sprint:false,sReverses:true,takeoff:.3,flightScale:2.2},get stinging(){return stingLevel>.5;},get stingLevel(){return stingLevel;},update,reset};
}
