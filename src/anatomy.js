import {createMembrane} from './membrane.js';
import {WingMotion} from './wing-motion.js';
import * as THREE from 'three';

// Seeded, multi-scale variation: broad pigment clouds, fine cuticle grain and
// faint longitudinal wing fibres. Maps are baked once, never animated.
function hash(x,y,seed){const n=Math.sin(x*127.1+y*311.7+seed*74.7)*43758.5453;return n-Math.floor(n);}
function noise(x,y,seed){const ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iy,seed),hash(ix+1,iy,seed),fx),THREE.MathUtils.lerp(hash(ix,iy+1,seed),hash(ix+1,iy+1,seed),fx),fy);}
export function createChitinMaterial({seed=1,wing=false,dark=1,base=[67,32,18]}={}){
 const size=512;const canvases=Array.from({length:3},()=>{const c=document.createElement('canvas');c.width=c.height=size;return c;});
 const contexts=canvases.map(c=>c.getContext('2d'));const images=contexts.map(c=>c.createImageData(size,size));
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/(size-1),v=y/(size-1),i=(y*size+x)*4;
  const cloud=noise(u*9,v*13,seed)-.5,grain=noise(u*87,v*113,seed+9)-.5,micro=hash(x,y,seed+3)-.5;
  const fibres=wing?Math.pow(.5+.5*Math.sin(u*195+noise(u*6,v*12,seed)*7+v*9),12)*.025:0;
  const edge=Math.exp(-Math.min(u,1-u)*65)*.09+Math.exp(-Math.min(v,1-v)*50)*.07;
  const tone=(1+cloud*.09+grain*.065+micro*.025-edge-fibres)*dark;
  base.forEach((channel,j)=>images[0].data[i+j]=Math.min(255,Math.round(channel*tone)));
  const rough=210+cloud*15+grain*14+micro*6;
  const height=128+grain*19+micro*8-fibres*180;
  for(let j=0;j<3;j++){images[1].data[i+j]=rough;images[2].data[i+j]=height;}
  images.forEach(im=>im.data[i+3]=255);
 }
 const maps=canvases.map((c,i)=>{contexts[i].putImageData(images[i],0,0);const tex=new THREE.CanvasTexture(c);tex.anisotropy=4;return tex;});maps[0].colorSpace=THREE.SRGBColorSpace;
 return new THREE.MeshPhysicalMaterial({color:0xffffff,map:maps[0],roughnessMap:maps[1],roughness:.88,bumpMap:maps[2],bumpScale:.003,metalness:0,clearcoat:0,specularIntensity:.28,transparent:false,opacity:1,transmission:0});
}

// A plate is one shallow, closed shell rather than a scaled sphere. Both wing
// halves share the same width profile and crown, forming a continuous dorsum.
function widthAt(profile,z){
 for(let i=1;i<profile.length;i++)if(z<=profile[i][0]){
  const a=profile[i-1],b=profile[i],prev=profile[Math.max(0,i-2)],next=profile[Math.min(profile.length-1,i+1)];
  const span=b[0]-a[0],u=(z-a[0])/span;
  const m0=(b[1]-prev[1])/(b[0]-prev[0])*span,m1=(next[1]-a[1])/(next[0]-a[0])*span;
  return Math.max(.001,(2*u**3-3*u*u+1)*a[1]+(u**3-2*u*u+u)*m0+(-2*u**3+3*u*u)*b[1]+(u**3-u*u)*m1);
 }
 return profile.at(-1)[1];
}
function plate(parent,material,profile,{side=0,y=.08,crown=.045,asymmetry=0,referenceUV=false,overlap=false}={}){
 const rows=64,cols=32,positions=[],uvs=[],indices=[];
 for(let layer=0;layer<2;layer++)for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
  const v=j/rows,u=i/cols,z=THREE.MathUtils.lerp(profile[0][0],profile.at(-1)[0],v);const width=widthAt(profile,z);const inner=overlap?-(.12+.73*Math.sin(v*Math.PI*.72)):0;const across=side===0?u*2-1:side*(inner+(1-inner)*u);
  const x=across*width*(1+asymmetry*Math.sin(v*7+1));
  const top=y+crown*Math.sqrt(Math.max(0,1-across*across))*Math.sin(Math.PI*v)**.35;
  positions.push(x,layer===0?top:y-.028,z);uvs.push(...(referenceUV?[(240+x/.01)/472,1-(475+z/.009)/742]:[u,v]));
 }
 const layerSize=(rows+1)*(cols+1);
 for(let layer=0;layer<2;layer++)for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const a=layer*layerSize+j*(cols+1)+i,b=a+1,c=a+cols+1,d=c+1;
  const reverse=(side!==-1)!==(layer===1);indices.push(...(reverse?[a,c,b,b,c,d]:[a,b,c,b,d,c]));
 }
 // Seal all four edges so the material remains solid from every angle.
 const boundary=[];for(let i=0;i<=cols;i++)boundary.push(i);for(let j=1;j<=rows;j++)boundary.push(j*(cols+1)+cols);for(let i=cols-1;i>=0;i--)boundary.push(rows*(cols+1)+i);for(let j=rows-1;j>0;j--)boundary.push(j*(cols+1));
 for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length];indices.push(a,b,a+layerSize,b,b+layerSize,a+layerSize);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
// Use the supplied specimen itself as the pigment/venation reference. The UVs
// sample only the matching anatomical region; the pale image background is
// outside the plate outlines. Articulation and locomotion remain fully 3D.
export function createDorsalBody(parent,ellipsoid,underside,shell){
 const dorsal=new THREE.Group();dorsal.position.y=-.11;parent.add(dorsal);
 // Upload through a power-of-two canvas. Native image-backed textures can
 // render black in embedded WebKit even when the same PNG works in Chromium.
 const referenceCanvas=document.createElement('canvas');referenceCanvas.width=512;referenceCanvas.height=1024;
 const referenceContext=referenceCanvas.getContext('2d');referenceContext.fillStyle='#633019';referenceContext.fillRect(0,0,512,1024);
 const reference=new THREE.CanvasTexture(referenceCanvas);reference.colorSpace=THREE.SRGBColorSpace;reference.anisotropy=1;
 const referenceImage=new Image();referenceImage.onload=()=>{referenceContext.drawImage(referenceImage,0,0,512,1024);reference.needsUpdate=true;};
 referenceImage.onerror=()=>console.warn('Cockroach reference texture failed to load; using chestnut fallback.');
 referenceImage.src=`${import.meta.env.BASE_URL}cockroach-reference.png`;
 const specimenMaterial=new THREE.MeshPhysicalMaterial({map:reference,color:0xb9a796,roughness:.34,metalness:0,clearcoat:.9,clearcoatRoughness:.1,specularIntensity:.8,transparent:false,opacity:1,transmission:0});
 ellipsoid(dorsal,underside,[0,-.05,.35],[.52,.085,1.08]);
 // Exposed abdomen: overlapping glossy tergites separated by dark sutures.
 const abdomenPlates=[];
 for(let i=0;i<9;i++){
  const z=-.38+i*.205;const width=.545*Math.sqrt(Math.max(.06,1-((z-.30)/1.2)**2));
  const cuticle=createChitinMaterial({seed:30+i,dark:.77+(i%3)*.08});
  cuticle.roughness=.31;cuticle.clearcoat=.68;cuticle.clearcoatRoughness=.2;cuticle.specularIntensity=.7;
  const plate=ellipsoid(dorsal,cuticle,[0,.002,z],[width,.073,.118]);abdomenPlates.push(plate);
  const band=new THREE.MeshPhysicalMaterial({color:0x241107,roughness:.36,clearcoat:.45,metalness:0});
  ellipsoid(dorsal,band,[0,-.003,z+.105],[width*.965,.066,.013]);
 }
 // Profiles traced from the image in pixel space, converted to model space.
 const profile=points=>points.map(([pixelY,halfWidth])=>[(pixelY-475)*.009,halfWidth*.01]);
 const wings=profile([[395,34],[409,52],[435,61],[472,64],[510,62],[553,50],[592,38],[620,23],[637,13],[642,1]]);
 const wingPairs=[];
 for(const side of [1,-1]){
  const hinge=new THREE.Vector3(side*.22,.09,-.67);
  const outerPivot=new THREE.Group();outerPivot.position.copy(hinge);dorsal.add(outerPivot);
  const outer=plate(outerPivot,specimenMaterial,wings,{side,y:side===-1?.113:.09,crown:.04,referenceUV:true,overlap:true});
  outer.geometry.translate(-hinge.x,-hinge.y,-hinge.z);
  // Two independently phased membrane pairs beneath the raised covers.
  const membranes=[];
  for(let kind=0;kind<2;kind++){
   const pivot=new THREE.Group();pivot.position.copy(hinge).add(new THREE.Vector3(0,-.032-kind*.015,kind*.04));dorsal.add(pivot);
   const membrane=createMembrane(pivot,side,kind);pivot.visible=false;
   membranes.push({pivot,kind,...membrane});
  }
  wingPairs.push({side,outerPivot,membranes});
 }
 const shield=profile([[340,14],[346,29],[357,41],[373,48],[386,46],[398,34],[404,15]]);
 plate(dorsal,specimenMaterial,shield,{y:.135,crown:.065,referenceUV:true});
 const head=profile([[320,9],[324,19],[334,24],[345,18],[350,8]]);
 plate(dorsal,specimenMaterial,head,{y:.075,crown:.025,referenceUV:true});
 const motion=new WingMotion();
 return {root:dorsal,motion,wingPairs,abdomenPlates,update(dt,active){
  motion.update(dt,active);
  for(const {side,outerPivot,membranes} of wingPairs){
   const twitch=motion.adjustmentSide===side?motion.twitch:motion.twitch*.22;
   const spread=motion.spread;const beat=Math.sin(motion.phase+side*.18);
   outerPivot.rotation.order='YXZ';
   outerPivot.rotation.y=side*(spread*.75+twitch);
   // Covers lift roughly 65 degrees; the delicate membranes do the fast work.
   outerPivot.rotation.x=-spread*(1.13+beat*.09)-twitch*.6;
   for(const membrane of membranes){
    const {pivot,kind}=membrane;const phase=motion.phase+side*.12+kind*.62;
    pivot.visible=spread>.08;pivot.rotation.order='YXZ';
    pivot.rotation.y=side*spread*(kind===0?1.10:.91);
    pivot.rotation.x=-spread*(.46+Math.sin(phase)*.40);
    pivot.rotation.z=side*spread*Math.cos(phase)*.11;
    pivot.scale.x=.025+spread*.975;
    membrane.update(phase,spread);
   }
  }
 }};
}
