import {assemblyScene} from './assembly_scene.mjs';
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import {MeshBVH} from '../../client/node_modules/three-mesh-bvh/src/index.js';
const poses={robot1:[0,0,0,0,0],robot2:[0,0,0,0,0]};
const {robots,update}=assemblyScene(poses);
const pairs=[['axis1_carriage','axis2'],['axis2','axis3_fixed'],['axis3_fixed','axis3_middle'],['axis3_middle','axis3_outer'],['axis3_outer','axis4'],['axis4','axis5'],['axis5','camera']];
for(const a3 of [0,900,1800]){
  poses.robot1[2]=poses.robot2[2]=a3;update();
  for(const [id,meshes] of Object.entries(robots)){
    console.log(id,'a3',a3);
    if(a3===0) for(const [name,m] of Object.entries(meshes)) {
      const b=new THREE.Box3().setFromObject(m,true);
      console.log(name,b.min.toArray().map(v=>v.toFixed(3)),b.max.toArray().map(v=>v.toFixed(3)));
    }
    for(const [a,b] of pairs){
      const ma=meshes[a],mb=meshes[b];
      if(!ma.geometry.boundsTree)ma.geometry.boundsTree=new MeshBVH(ma.geometry);
      if(!mb.geometry.boundsTree)mb.geometry.boundsTree=new MeshBVH(mb.geometry);
      const gap=ma.geometry.boundsTree.closestPointToGeometry(mb.geometry,ma.matrixWorld.clone().invert().multiply(mb.matrixWorld),{},{},0,2);
      console.log(a,b,gap?+(gap.distance*1000).toFixed(3):'>2000');
    }
  }
}
