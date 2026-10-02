import * as THREE from 'three';

// Outer edge of the closed tegmina (half width by position along them), less
// their slight inward toe-in. The abdomen stays inside it so the wing covers
// hide it completely from above, including the sides.
const tegmenEdge=[[0,.158],[.12,.245],[.35,.358],[.6,.372],[.83,.26],[.96,.107],[1,.018]];
const Z0=-.32,Z1=1.79,SEGMENTS=8;
function lerpTable(table,x){
 let i=1;while(i<table.length-1&&x>table[i][0])i++;
 const [a,w0]=table[i-1],[b,w1]=table[i];
 return THREE.MathUtils.lerp(w0,w1,THREE.MathUtils.clamp((x-a)/(b-a),0,1));
}
function halfWidth(t){
 const z=Z0+t*(Z1-Z0);
 return .8*lerpTable(tegmenEdge,(z+.30)/2.27);
}
// Rounder than a flat plate: a low dorsal dome over a deeper, fuller belly.
const DORSAL=.56,VENTRAL=.64,CENTER=-.02;

// Segment boundaries are painted, not modelled as bulges: a soft dark suture
// with a faint pale rim on the rear edge of the plate in front of it.
function drawSutures(ctx){
 for(let k=1;k<SEGMENTS;k++){
  const y=k/SEGMENTS*1024,shade=ctx.createLinearGradient(0,y-14,0,y+10);
  shade.addColorStop(0,'rgba(236,240,200,0)');shade.addColorStop(.35,'rgba(236,240,200,.16)');
  shade.addColorStop(.6,'rgba(52,56,26,.45)');shade.addColorStop(1,'rgba(52,56,26,0)');
  ctx.fillStyle=shade;ctx.fillRect(0,y-14,512,24);
 }
}
function abdomenTexture(){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=1024;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#9b9c68';ctx.fillRect(0,0,512,1024);drawSutures(ctx);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
 const image=new Image();image.onload=()=>{
  // Read only the abdominal surface from the supplied specimen. The crop
  // follows the slight diagonal of the pinned insect and avoids its wings.
  for(let y=0;y<1024;y++){
   const t=y/1023,sourceY=1110+t*365,centerX=745-t*48,sourceWidth=94-t*17;
   ctx.drawImage(image,centerX-sourceWidth/2,sourceY,sourceWidth,1,0,y,512,1);
  }
  const pixels=ctx.getImageData(0,0,512,1024);
  for(let i=0;i<pixels.data.length;i+=4){
   const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];
   // A few edge pixels of the photograph are white display backing.
   if(r>220&&g>220&&b>205){pixels.data[i]=165;pixels.data[i+1]=170;pixels.data[i+2]=119;}
  }
  ctx.putImageData(pixels,0,0);drawSutures(ctx);map.needsUpdate=true;
 };image.src=`${import.meta.env.BASE_URL}mantis-abdomen-reference.webp`;
 return map;
}
// Fine pitted cuticle; the smooth clearcoat above it gives the wet sheen.
function poreTexture(){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
 ctx.fillStyle='#808080';ctx.fillRect(0,0,256,256);
 for(let i=0;i<900;i++){const x=Math.random()*256,y=Math.random()*256,r=.6+Math.random()*1.6;ctx.fillStyle=`rgba(${Math.random()<.5?40:210},${Math.random()<.5?40:210},${Math.random()<.5?40:210},.18)`;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();}
 const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2,6);return tex;
}

// Radius along the abdomen: one smooth continuous body. Each tergite widens
// very slightly toward its rear rim and dips into a shallow suture, enough to
// catch the light without breaking the silhouette into beads.
function radius(t){
 let r=halfWidth(t);
 const s=(t*SEGMENTS)%1,suture=Math.min(s,1-s);
 if(t>.02&&t<.98)r*=1-.018*Math.exp(-((suture/.07)**2))+.006*s;
 // Rounded caps: under the thorax in front, a blunt tip behind.
 if(t<.06)r*=Math.sqrt(1-((.06-t)/.06)**2);
 if(t>.84)r*=Math.sqrt(Math.max(0,1-((t-.84)/.16)**2));
 return r;
}

export function createMantisAbdomen(parent){
 const map=abdomenTexture(),pores=poreTexture();
 const rows=220,sides=48,positions=[],uv=[],indices=[];
 for(let j=0;j<=rows;j++){
  const t=j/rows,w=radius(t),z=Z0+t*(Z1-Z0);
  for(let q=0;q<=sides;q++){
   const angle=-Math.PI+q/sides*Math.PI*2,c=Math.cos(angle);
   positions.push(w*Math.sin(angle),CENTER+w*c*(c>0?DORSAL:VENTRAL),z);
   uv.push((Math.sin(angle)+1)/2,1-t);
   if(j<rows&&q<sides){const a=j*(sides+1)+q,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);}
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
 geometry.setIndex(indices);geometry.computeVertexNormals();
 // Glossy, moist cuticle in the specimen's own olive and straw colours.
 const material=new THREE.MeshPhysicalMaterial({map,color:0xdce1c3,roughness:.34,metalness:0,clearcoat:1,clearcoatRoughness:.07,specularIntensity:.85,sheen:.35,sheenRoughness:.4,sheenColor:0xd8e3a0,bumpMap:pores,bumpScale:.0018});
 const shell=new THREE.Mesh(geometry,material);shell.castShadow=shell.receiveShadow=true;parent.add(shell);
 return shell;
}
