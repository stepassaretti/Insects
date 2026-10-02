import * as THREE from 'three';

// Fine longitudinal veins, branching cross-veins and a pigmented leading edge.
// The membrane itself is translucent; vein opacity is baked into the texture.
function membraneTexture(kind){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
 const ctx=canvas.getContext('2d');const pixels=ctx.createImageData(1024,1024);
 for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){
  const u=x/1023,v=y/1023,i=(y*1024+x)*4;
  const leading=Math.exp(-u*5)*(kind===0?1:.65);
  const grain=Math.sin(x*13.3+y*73.1)*Math.sin(x*.37-y*2.7);
  pixels.data[i]=177+leading*36+grain*3;
  pixels.data[i+1]=159-leading*20+grain*3;
  pixels.data[i+2]=119-leading*54+grain*2;
  pixels.data[i+3]=Math.round(132+leading*70+v*22);
 }
 ctx.putImageData(pixels,0,0);
 // UV v is distance from the hinge; canvas Y runs in the opposite direction.
 // Curved primary trunks split into tapered distal branches, rather than a
 // uniformly ruled fan. The posterior field has longer, bowed anal veins.
 const point=(u,v)=>[u*1024,(1-v)*1024];
 function stroke(curve,start,end,width,alpha){
  ctx.beginPath();
  for(let i=0;i<=64;i++){const v=start+(end-start)*i/64;const [x,y]=point(curve(v),v);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
  ctx.strokeStyle=`rgba(80,57,30,${alpha})`;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
 }
 const ends=kind===0?[.025,.13,.29,.49,.73,.97]:[.025,.10,.19,.30,.42,.55,.69,.83,.98];
 const trunks=ends.map((tip,i)=>{
  const root=kind===0?.015+i*.038:.035+i*.046;
  const bow=(kind===0?-.085:.10)*Math.sin((i+1)*.47);
  return v=>root+(tip-root)*Math.pow(v,.76)+bow*Math.sin(Math.PI*v);
 });
 trunks.forEach((trunk,i)=>{
  stroke(trunk,.015,.995,i<2?3.9:2.8,.76);
  if(i===trunks.length-1)return;
  const count=kind===0?4:2;
  for(let j=0;j<count;j++){
   const split=.26+j*(kind===0?.16:.28)+(i%2)*.035;
   const terminal=ends[i]+(ends[i+1]-ends[i])*(j+1)/(count+1);
   // Starts tangent to its parent and gradually diverges into a curved fork.
   const branch=v=>{const t=(v-split)/(1-split);return trunk(v)+(terminal-ends[i])*t*t*(3-2*t);};
   stroke(branch,split,.996,1.5+(count-j)*.15,.58);
   if(kind===0&&j===1){
    const split2=.77;const terminal2=terminal+(ends[i+1]-ends[i])*.085;
    stroke(v=>{const t=(v-split2)/(1-split2);return branch(v)+(terminal2-terminal)*t*t;},split2,.996,1.05,.43);
   }
  }
 });
 // A few irregular bowed cross-veins form cells without a decorative grid.
 for(let i=0;i<trunks.length-1;i++){
  for(let j=0;j<(kind===0?2:1);j++){
   const v=.45+j*.29+(i%3)*.038;const a=point(trunks[i](v),v),b=point(trunks[i+1](v+.035),v+.035);
   ctx.beginPath();ctx.moveTo(...a);ctx.bezierCurveTo(a[0]+(b[0]-a[0])*.35,a[1]-14,b[0]-(b[0]-a[0])*.2,b[1]+7,...b);
   ctx.strokeStyle='rgba(93,68,37,.32)';ctx.lineWidth=1;ctx.stroke();
  }
 }
 // Fine peripheral vein follows the scalloped trailing margin.
 ctx.beginPath();ctx.moveTo(0,5);ctx.bezierCurveTo(290,9,710,9,1024,5);ctx.strokeStyle='rgba(91,66,33,.44)';ctx.lineWidth=2;ctx.stroke();
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;return tex;
}
const textures=[];
export function createMembrane(parent,side,kind){
 const radial=24,angular=48,positions=[],uvs=[],indices=[];
 for(let r=0;r<=radial;r++)for(let j=0;j<=angular;j++){
  const u=j/angular,v=r/radial;
  const angle=kind===0?-.27+u*.65:.16+u*1.08;
  const length=kind===0?1.96+.42*Math.sin(u*Math.PI):1.55+.35*Math.sin(u*Math.PI);
  const scallop=1-.012*Math.sin(u*Math.PI*17)**2;
  positions.push(side*Math.sin(angle)*length*v*scallop,0,Math.cos(angle)*length*v*scallop);uvs.push(u,v);
  if(r<radial&&j<angular){const a=r*(angular+1)+j,b=a+1,c=a+angular+1;indices.push(a,b,c,b,c+1,c);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 textures[kind]??=membraneTexture(kind);
 const material=new THREE.MeshPhysicalMaterial({map:textures[kind],color:0xffffff,roughness:.38,metalness:0,clearcoat:.25,clearcoatRoughness:.3,specularIntensity:.45,transparent:true,opacity:.88,depthWrite:false,side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=false;parent.add(mesh);
 return {mesh,update(phase,spread){const attr=geometry.attributes.position;for(let i=0;i<attr.count;i++){const v=uvs[i*2+1],u=uvs[i*2];attr.setY(i,Math.sin(phase-2.7*v+u*1.2+kind*.45)*v*v*.095*spread);}attr.needsUpdate=true;geometry.computeVertexNormals();}};
}
