import { measureIfarlab } from './scene_inspection.mjs';
import * as THREE from '../../client/node_modules/three/build/three.module.js';
const { root, box } = measureIfarlab();
const format = (v) => v.toArray().map((n) => n.toFixed(4)).join(', ');
console.log('IFARLAB world min:', format(box.min));
console.log('IFARLAB world max:', format(box.max));
console.log('IFARLAB size:', format(box.getSize(new THREE.Vector3())));
root.traverse((object) => {
  if (!object.isMesh || !object.geometry.userData.source?.includes('/environment/')) return;
  const b = new THREE.Box3().setFromObject(object, true);
  console.log(object.geometry.userData.source, format(b.min), '->', format(b.max));
});
