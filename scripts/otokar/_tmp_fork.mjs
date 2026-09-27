import { readFileSync } from 'node:fs';
import * as THREE from '../../client/node_modules/three/build/three.module.js';
const b = readFileSync('client/public/assets/props/forklift.glb');
const g = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)));
const items = []; const all = new THREE.Box3();
function visit(i, parent) {
  const n = g.nodes[i];
  const m = n.matrix ? new THREE.Matrix4().fromArray(n.matrix) : new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation || [0,0,0])), new THREE.Quaternion(...(n.rotation || [0,0,0,1])), new THREE.Vector3(...(n.scale || [1,1,1])));
  const w = parent.clone().multiply(m);
  if (n.mesh != null) for (const p of g.meshes[n.mesh].primitives) { const a = g.accessors[p.attributes.POSITION]; const box = new THREE.Box3(new THREE.Vector3(...a.min), new THREE.Vector3(...a.max)).applyMatrix4(w); all.union(box); items.push({ name: n.name + '/' + (g.materials[p.material]?.name), box }); }
  (n.children || []).forEach((c) => visit(c, w));
}
// Match Prop.js: yaw pi/2 then scale to height 2.15, centred x/z, floor at 0
const yaw = new THREE.Matrix4().makeRotationY(Math.PI / 2);
g.scenes[g.scene || 0].nodes.forEach((i) => visit(i, yaw));
const s = 2.15 / (all.max.y - all.min.y); const c = all.getCenter(new THREE.Vector3());
const f = (v) => [(v.x - c.x) * s, (v.y - all.min.y) * s, (v.z - c.z) * s].map((q) => q.toFixed(2)).join(',');
console.log('overall', f(all.min), '..', f(all.max));
for (const it of items) console.log(it.name.padEnd(30), f(it.box.min), '..', f(it.box.max));
