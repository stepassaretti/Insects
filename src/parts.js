import * as THREE from 'three';

// Shared primitive helpers for both specimens.
export const up=new THREE.Vector3(0,1,0);
const sphere=new THREE.SphereGeometry(1,24,16),cylinder=new THREE.CylinderGeometry(1,1,1,7);
export function ellipsoid(parent,mat,pos,scale){const m=new THREE.Mesh(sphere,mat);m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function rod(parent,mat,radius=.03){const m=new THREE.Mesh(cylinder,mat);m.userData.radius=radius;m.castShadow=true;parent.add(m);return m;}
export function placeRod(m,a,b,r=m.userData.radius){const d=b.clone().sub(a);m.position.copy(a).add(b).multiplyScalar(.5);m.scale.set(r,d.length(),r*.85);m.quaternion.setFromUnitVectors(up,d.normalize());}
export function contactMarker(parent,group){const marker=new THREE.Mesh(new THREE.RingGeometry(.055,.09,16),new THREE.MeshBasicMaterial({color:group?0xb2884f:0x668438,side:THREE.DoubleSide,transparent:true}));marker.rotation.x=-Math.PI/2;marker.visible=false;parent.add(marker);return marker;}
