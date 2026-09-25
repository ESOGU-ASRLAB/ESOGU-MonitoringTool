// Actual JSX hierarchy + actual mesh vertices. Shared by audits and screenshots.
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import { createInspector } from './scene_inspection.mjs';
import { readOtokarGeometry } from './glb_geometry.mjs';
const cache=new Map();
export function assemblyScene(poses, lod='lo') {
  function mesh(props) {
    const key=`${props.group}/${lod}/${props.part}`;
    if(!cache.has(key))cache.set(key,readOtokarGeometry(props.group,props.part,lod));
    return {type:'mesh',props:{name:props.part,geometry:cache.get(key)}};
  }
  const inspector=createInspector({'./OtokarMesh':mesh});
  const robot=inspector.load('OtokarGantryRobot').default;
  const root=new THREE.Group(),e=inspector.element;
  for(const robotId of ['robot1','robot2']) inspector.mount(e(robot,{robotId,meshGroup:robotId,axes:poses[robotId],lod,showRails:true}),root);
  // Work directly in CAD metres, without inventing a duplicate kinematic chain.
  root.rotation.x=Math.PI/2;
  function update(){inspector.frames.forEach(f=>f({},0));root.updateMatrixWorld(true);}
  update();
  const robots={};
  for(const id of ['robot1','robot2']) {
    robots[id]={};
    root.getObjectByName(id+'-cad-frame').traverse(o=>{if(o.isMesh)robots[id][o.name]=o;});
  }
  return {root,robots,update,inspector};
}
