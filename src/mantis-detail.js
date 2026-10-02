import * as THREE from 'three';
import {ellipsoid,rod,placeRod} from './parts.js';

export function detailMaterials(){
 const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');ctx.fillStyle='#808080';ctx.fillRect(0,0,512,512);
 for(let y=0;y<512;y+=6)for(let x=0;x<512;x+=6){ctx.fillStyle='rgba(38,38,38,.32)';ctx.beginPath();ctx.arc(x+(y%12?3:0),y,1.1,0,7);ctx.fill();}
 const grain=new THREE.CanvasTexture(c);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;
 const eyes=new THREE.MeshPhysicalMaterial({color:0x667c30,roughness:.3,clearcoat:1,clearcoatRoughness:.1,specularIntensity:.8,bumpMap:grain,bumpScale:.002});
 return {grain,eyes};
}
export function createMantisHindwing(parent,side){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=2048;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#b6a678';ctx.fillRect(0,0,1024,2048);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
 const image=new Image();image.onload=()=>{ctx.drawImage(image,0,0,1024,2048);map.needsUpdate=true;};image.src=`${import.meta.env.BASE_URL}mantis-spread-reference.webp`;
 // Trace the right hindwing's lobed margin. Every neighbouring pair of
 // outline points is a separate hinged pleat sharing the thoracic root.
 // UVs preserve the real radial veins and irregular cross-vein cells.
 const outline=[[582,615],[650,570],[753,511],[865,466],[969,438],[1025,441],[1041,458],[1030,493],[999,539],[970,573],[950,591],[927,652],[892,697],[847,735],[796,768],[745,793],[688,811],[650,809],[619,766],[597,702]];
 // Translucent membrane: vertex alpha is densest along the veined margins
 // and root, thinnest in the middle of the fan.
 const material=new THREE.MeshPhysicalMaterial({map,color:0xbeb9a1,vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,roughness:.3,metalness:0,clearcoat:.5,clearcoatRoughness:.15,specularIntensity:.7});
 const root=new THREE.Vector2(...outline[0]);
 const sections=[];
 for(let i=1;i<outline.length-1;i++){
  const a=new THREE.Vector2(...outline[i]),b=new THREE.Vector2(...outline[i+1]);
  const positions=[],uv=[],foldCoords=[],alpha=[],count=outline.length-2;
  const emit=(radial,across)=>{
   const edge=a.clone().lerp(b,across),q=root.clone().lerp(edge,radial);
   positions.push(side*(q.x-root.x)*.0045,0,(q.y-root.y)*.0045);
   uv.push(q.x/1080,1-q.y/1288);
   foldCoords.push(radial,across);
   const fan=(i-1+across)/count,inset=Math.min((1-radial)/.3,radial/.3,fan/.1,(1-fan)/.1);
   alpha.push(1,1,1,THREE.MathUtils.lerp(.9,.34,THREE.MathUtils.smoothstep(inset,0,1)));
  };
  const n=8;
  for(let row=0;row<n;row++)for(let col=0;col<n;col++){
   const r0=row/n,r1=(row+1)/n,c0=col/n,c1=(col+1)/n;
   emit(r0,c0);emit(r1,c0);emit(r0,c1);
   emit(r0,c1);emit(r1,c0);emit(r1,c1);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(alpha,4));geometry.computeVertexNormals();
  const hinge=new THREE.Group(),mesh=new THREE.Mesh(geometry,material);
  mesh.castShadow=mesh.receiveShadow=true;mesh.renderOrder=1;hinge.add(mesh);parent.add(hinge);
  const center=a.clone().lerp(b,.5).sub(root);
  sections.push({hinge,mesh,a,b,foldCoords,angle:Math.atan2(center.y,center.x),progress:0});
 }
 return {sections,material,update(unfold,phase,beat){
  sections.forEach((section,i)=>{
   // Successive wedges open like the leaves of a hand fan, rather than
   // shrinking a single membrane. Reversing unfold reverses the same path.
   const delay=i/(sections.length-1)*.16;
   const progress=THREE.MathUtils.smoothstep(unfold,delay,.84+delay);
   if(section.progress===progress&&section.lastBeat===beat)return;
   section.progress=progress;
   section.lastBeat=beat;
   // Folded pleats point back along the abdomen, toed in slightly so the
   // long tips stay under the narrowing tegmina.
   section.hinge.rotation.y=side*(section.angle-Math.PI/2-.04)*(1-progress);
   const pos=section.mesh.geometry.attributes.position;
   // Each pleat's membrane gathers toward its own radial vein as it folds.
   const gather=.14+.86*progress;
   for(let j=0;j<pos.count;j++){
    const radial=section.foldCoords[j*2],across=.5+(section.foldCoords[j*2+1]-.5)*gather;
    const q=root.clone().lerp(section.a.clone().lerp(section.b,across),radial);
    const ridge=Math.sin(Math.PI*section.foldCoords[j*2+1])*(i%2===0?1:-1)*.02*(1-progress)*radial;
    const flutter=beat*.021*radial*Math.sin(phase-radial*2+i*.24);
    pos.setXYZ(j,side*(q.x-root.x)*.0045,ridge+flutter,(q.y-root.y)*.0045);
   }
   pos.needsUpdate=true;section.mesh.geometry.computeVertexNormals();
  });
 },makeTrail(parent,offset){
  const trail=new THREE.Group();parent.add(trail);
  const hinges=sections.map(section=>{
   const hinge=new THREE.Group(),mesh=new THREE.Mesh(section.mesh.geometry,material.clone());
   mesh.material.opacity=0;mesh.renderOrder=1;
   hinge.add(mesh);trail.add(hinge);return hinge;
  });
  trail.visible=false;return {trail,hinges,offset};
 }};
}
export function addMantisMicroDetails(body,head,green,dark){
 // Three small ocelli, a segmented mouth, and paired sensory palps.
 for(const x of [-.035,0,.035])ellipsoid(head,dark,[x,.063,-.108],[.011,.009,.01]);
 const palps=[];for(const s of [-1,1]){const pivot=new THREE.Group();pivot.position.set(s*.041,-.20,-.10);head.add(pivot);placeRod(rod(pivot,green,.009),new THREE.Vector3(),new THREE.Vector3(s*.045,-.025,-.034));placeRod(rod(pivot,dark,.006),new THREE.Vector3(s*.045,-.025,-.034),new THREE.Vector3(s*.055,-.045,-.07));palps.push(pivot);}
 // Paired cerci rooted in the sides of the abdominal tip: a tapered base and
 // a finer distal segment, each hinged, so they sway, twitch and trail turns.
 const cercus=new THREE.MeshPhysicalMaterial({color:0x8c9656,roughness:.35,clearcoat:.8,clearcoatRoughness:.12,metalness:0}),cercusTip=new THREE.MeshPhysicalMaterial({color:0x68703d,roughness:.4,clearcoat:.6,clearcoatRoughness:.2,metalness:0});
 const cerci=[-1,1].map(s=>{
  const root=new THREE.Group();root.position.set(s*.035,-.03,1.735);body.add(root);
  const joint=new THREE.Vector3(s*.045,.012,.11),end=new THREE.Vector3(s*.03,.012,.1);
  placeRod(rod(root,cercus,.0085),new THREE.Vector3(),joint);
  ellipsoid(root,cercus,joint.toArray(),[.0085,.0085,.0085]);
  const tip=new THREE.Group();tip.position.copy(joint);root.add(tip);
  placeRod(rod(tip,cercusTip,.0055),new THREE.Vector3(),end);
  ellipsoid(tip,cercusTip,end.toArray(),[.0055,.0055,.0055]);
  return {side:s,root,tip,phase:Math.random()*6,next:1+Math.random()*3,start:-10,duration:.4,amplitude:0};
 });
 return {update(t,dt=0,turn=0){
  palps.forEach((p,i)=>p.rotation.y=Math.sin(t*3.2+i*2.3)*.08);
  for(const c of cerci){
   if(t>c.next){c.start=t;c.duration=.25+Math.random()*.3;c.amplitude=(Math.random()-.5)*.35;c.next=t+2+Math.random()*4;}
   const u=(t-c.start)/c.duration,twitch=u>=0&&u<1?Math.sin(u*Math.PI)**2*c.amplitude:0;
   const drift=Math.sin(t*.9+c.phase)*.05,lift=Math.sin(t*1.3+c.phase*1.7)*.04;
   const k=1-Math.exp(-dt*10);
   c.root.rotation.y+=(twitch+drift+THREE.MathUtils.clamp(-turn*.04,-.12,.12)-c.root.rotation.y)*k;
   c.root.rotation.x+=(lift-Math.abs(twitch)*.3-c.root.rotation.x)*k;
   c.tip.rotation.y+=(twitch*.6+drift*.8-c.tip.rotation.y)*k*.7;
  }
 }};
}
// Fine setae-like spikes along a limb segment: very thin, short, angled
// toward the segment's tip. Given `outward`, only that side gets them.
// One instanced mesh per coordinate space, refilled each frame.
export function createSpikeField(parent,material,capacity){
 const mesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.55,1,1,4),material,capacity);
 mesh.frustumCulled=false;mesh.castShadow=false;parent.add(mesh);
 const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3(),along=new THREE.Vector3(),lateral=new THREE.Vector3(),dir=new THREE.Vector3(),base=new THREE.Vector3(),pos=new THREE.Vector3(),upAxis=new THREE.Vector3(0,1,0);
 let count=0;
 return {mesh,begin(){count=0;},
  add(a,b,radius,n,length=.04,outward=null){
   along.subVectors(b,a);const span=along.length();if(span<1e-5)return;along.divideScalar(span);
   lateral.crossVectors(along,upAxis);if(lateral.lengthSq()<1e-6)lateral.set(1,0,0);lateral.normalize();
   const sides=outward?[Math.sign(lateral.dot(outward))||1]:[-1,1];
   for(let i=0;i<n;i++)for(const s of sides){
    if(count>=capacity)return;
    // Staggered pairs with a little deterministic variation in size and angle.
    const k=count*12.9898,jitter=Math.sin(k)*43758.5453%1,u=(i+.5+(s>0?.35:0))/n;
    base.copy(a).addScaledVector(along,span*Math.min(.97,u)).addScaledVector(lateral,s*radius*.9);
    dir.copy(lateral).multiplyScalar(s).addScaledVector(along,.75+jitter*.3).addScaledVector(upAxis,-.12).normalize();
    const len=length*(.75+Math.abs(jitter)*.5);
    pos.copy(base).addScaledVector(dir,len/2);q.setFromUnitVectors(upAxis,dir);scale.set(.0012,len,.0012);
    mesh.setMatrixAt(count++,matrix.compose(pos,q,scale));
   }
  },
  end(){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}};
}
