import * as THREE from 'three';
// Photo coordinates use the 1368 x 1824 reference preview; scale-independent
// UVs retain its real wing venation, edge pigment and small surface marks.
export function mantisSurfaces(){
 const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=4096;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#668c36';ctx.fillRect(0,0,2048,4096);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 map.anisotropy=4;
 // Waxy cuticle: a smooth clearcoat over a softer base, as on the wasp.
 const mat=new THREE.MeshPhysicalMaterial({map,color:0xaab896,roughness:.46,metalness:0,clearcoat:.6,clearcoatRoughness:.24,specularIntensity:.6,side:THREE.DoubleSide});
 // Tegmina share the photographed surface but are translucent: vertex alpha
 // keeps the margins dense and lets the central membrane read as thin.
 const tegmen=new THREE.MeshPhysicalMaterial({map,color:0xaab896,roughness:.38,metalness:0,clearcoat:.55,clearcoatRoughness:.2,specularIntensity:.6,vertexColors:true,transparent:true,side:THREE.DoubleSide});
 const limbCanvas=document.createElement('canvas');limbCanvas.width=128;limbCanvas.height=512;
 const lc=limbCanvas.getContext('2d');lc.fillStyle='#668c36';lc.fillRect(0,0,128,512);
 const limbMap=new THREE.CanvasTexture(limbCanvas);limbMap.colorSpace=THREE.SRGBColorSpace;
 const limb=new THREE.MeshPhysicalMaterial({map:limbMap,color:0x94aa78,roughness:.42,metalness:0,clearcoat:.6,clearcoatRoughness:.25,specularIntensity:.6});
 const image=new Image();image.onload=()=>{ctx.drawImage(image,0,0,2048,4096);map.needsUpdate=true;
 // Interior strip of the long forefemur, avoiding the white background.
 lc.drawImage(image,689/1368*image.width,366/1824*image.height,15/1368*image.width,176/1824*image.height,0,0,128,512);limbMap.needsUpdate=true;};image.src=`${import.meta.env.BASE_URL}mantis-reference.png`;
 return {mat,tegmen,limb};
}
// Shadow pass material with adjustable strength. The depth pass ignores
// opacity, so an ordered 4x4 dither in shadow-map texels keeps that fraction
// of the shadow; the soft shadow filter averages the regular pattern into an
// even, lighter shadow.
export function translucentShadow(){
 const material=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
 const strength={value:1};
 material.onBeforeCompile=shader=>{
  shader.uniforms.shadowStrength=strength;
  shader.fragmentShader='uniform float shadowStrength;\n'+shader.fragmentShader.replace('#include <alphahash_fragment>',`
   const float bayer[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
   ivec2 cell=ivec2(mod(gl_FragCoord.xy,4.));
   if(shadowStrength<(bayer[cell.x+cell.y*4]+.5)/16.)discard;`);
 };
 return {material,set(value){strength.value=value;}};
}
// Closed tegmina are opaque leathery covers; as they open, they thin toward
// the translucent pattern baked into photoPlate (0 = closed, 1 = open).
export function setTegmenTranslucency(mesh,amount){
 const g=mesh.geometry;if(g.userData.amount===amount)return;g.userData.amount=amount;
 const color=g.attributes.color,target=g.userData.translucency;
 for(let i=0;i<target.length;i++)color.setW(i,1-amount*(1-target[i]));
 color.needsUpdate=true;
}
// `lift(distance from the front edge)` raises the plate, e.g. an upturned tip.
export function photoPlate(parent,mat,profile,z0,length,widthScale,side=0,lift=null){
 const rows=80,cols=24,p=[],uv=[],alpha=[],indices=[];
 for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
  const v=j/rows,u=i/cols;let k=1;while(k<profile.length-1&&v>profile[k][0])k++;
  const a=profile[k-1],b=profile[k],f=(v-a[0])/(b[0]-a[0]);
  const py=a[1]+(b[1]-a[1])*f,left=a[2]+(b[2]-a[2])*f,right=a[3]+(b[3]-a[3])*f;
  const cross=side===0?2*u-1:side*(-.36+u*1.36);
  // Mirrored geometry uses the same physical green tegmen surface and veins.
  const textureCross=side===0?cross:(-.36+u*1.36);
  const px=(left+right)/2+textureCross*(right-left)/2;
  // Tegmina roof over the abdomen: the outer (costal) margin curls down its sides.
  const outer=side===0?0:Math.max(0,textureCross-.3)/.7;
  p.push(cross*(right-left)*widthScale/2,.028*Math.sin(v*Math.PI)*(1-cross*cross)-.07*outer*outer*Math.sin(v*Math.PI)**.5+(side===-1?.009:0)+(lift?lift(v*length):0),z0+v*length);
  uv.push(px/1368,1-py/1824);
  const inset=Math.min(u/.24,(1-u)/.2,v/.1,(1-v)/.08);
  alpha.push(1,1,1,THREE.MathUtils.lerp(.97,.6,THREE.MathUtils.smoothstep(inset,0,1)));
  // Mirroring flips the winding; reverse it so normals face up on both
  // sides. Downward normals made the left tegmen shadow itself darker.
  if(j<rows&&i<cols){const n=j*(cols+1)+i;indices.push(...(side===-1?[n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1]:[n,n+cols+1,n+1,n+1,n+cols+1,n+cols+2]));}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));if(side!==0){g.setAttribute('color',new THREE.Float32BufferAttribute(alpha,4));g.userData.translucency=alpha.filter((_,i)=>i%4===3);}g.setIndex(indices);g.computeVertexNormals();const mesh=new THREE.Mesh(g,mat);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
