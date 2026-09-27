import { readFileSync } from 'node:fs';
import * as THREE from '../../client/node_modules/three/build/three.module.js';
const b = readFileSync('client/public/assets/props/forklift.glb');
const jl = b.readUInt32LE(12); const g = JSON.parse(b.subarray(20, 20 + jl)); const bin = b.subarray(20 + jl + 8);
const pts = {}; const all = new THREE.Box3(); const v = new THREE.Vector3();
function visit(i, parent) {
  const n = g.nodes[i];
  const m = n.matrix ? new THREE.Matrix4().fromArray(n.matrix) : new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation || [0,0,0])), new THREE.Quaternion(...(n.rotation || [0,0,0,1])), new THREE.Vector3(...(n.scale || [1,1,1])));
  const w = parent.clone().multiply(m);
  if (n.mesh != null) for (const p of g.meshes[n.mesh].primitives) { const a = g.accessors[p.attributes.POSITION]; const bv = g.bufferViews[a.bufferView]; const off = (bv.byteOffset || 0) + (a.byteOffset || 0), st = bv.byteStride || 12; const name = g.materials[p.material].name; const cf = g.materials[p.material].pbrMetallicRoughness?.baseColorFactor; pts[name] = pts[name] || { cf, list: [] };
    for (let k = 0; k < a.count; k++) { v.set(bin.readFloatLE(off + k * st), bin.readFloatLE(off + k * st + 4), bin.readFloatLE(off + k * st + 8)).applyMatrix4(w); all.expandByPoint(v); pts[name].list.push(v.clone()); } }
  (n.children || []).forEach((c) => visit(c, w));
}
g.scenes[g.scene || 0].nodes.forEach((i) => visit(i, new THREE.Matrix4().makeRotationY(Math.PI)));
const s = 2.15 / (all.max.y - all.min.y); const c = all.getCenter(new THREE.Vector3());
const W = (p) => [(p.x - c.x) * s, (p.y - all.min.y) * s, (p.z - c.z) * s];
for (const [name, { cf, list }] of Object.entries(pts)) {
  console.log(name, 'color', JSON.stringify(cf && cf.map((q) => +q.toFixed(2))));
  // height bands
  for (let y0 = 0.9; y0 < 2.0; y0 += 0.15) {
    const sel = list.map(W).filter((p) => p[1] >= y0 && p[1] < y0 + 0.15 && Math.abs(p[0]) < 0.45);
    if (!sel.length) continue;
    const zs = sel.map((p) => p[2]); const xs = sel.map((p) => p[0]);
    console.log(`   y ${y0.toFixed(2)}: n ${sel.length}  z ${Math.min(...zs).toFixed(2)}..${Math.max(...zs).toFixed(2)}  x ${Math.min(...xs).toFixed(2)}..${Math.max(...xs).toFixed(2)}`);
  }
}
