// World-space bbox of a GLB, from accessor min/max walked through the node
// graph. No renderer needed, and exact for untransformed-vertex exports.
import { readFileSync } from 'fs';

const file = process.argv[2];
const extraScale = Number(process.argv[3] || 1);
const buf = readFileSync(file);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));

const mul = (a, b) => {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
const ident = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const trs = (n) => {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const x2=x+x, y2=y+y, z2=z+z;
  const xx=x*x2, xy=x*y2, xz=x*z2, yy=y*y2, yz=y*z2, zz=z*z2, wx=w*x2, wy=w*y2, wz=w*z2;
  return [
    (1-(yy+zz))*sx, (xy+wz)*sx, (xz-wy)*sx, 0,
    (xy-wz)*sy, (1-(xx+zz))*sy, (yz+wx)*sy, 0,
    (xz+wy)*sz, (yz-wx)*sz, (1-(xx+yy))*sz, 0,
    tx, ty, tz, 1,
  ];
};
const apply = (m, p) => [
  m[0]*p[0] + m[4]*p[1] + m[8]*p[2]  + m[12],
  m[1]*p[0] + m[5]*p[1] + m[9]*p[2]  + m[13],
  m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14],
];

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
const perMesh = [];

const walk = (idx, parent) => {
  const node = gltf.nodes[idx];
  const m = mul(parent, trs(node));
  if (node.mesh !== undefined) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const prim of gltf.meshes[node.mesh].primitives || []) {
      const acc = gltf.accessors[prim.attributes.POSITION];
      if (!acc?.min) continue;
      for (let c = 0; c < 8; c++) {
        const p = [c & 1 ? acc.max[0] : acc.min[0], c & 2 ? acc.max[1] : acc.min[1], c & 4 ? acc.max[2] : acc.min[2]];
        const w = apply(m, p);
        for (let i = 0; i < 3; i++) {
          if (w[i] < min[i]) min[i] = w[i];
          if (w[i] > max[i]) max[i] = w[i];
          if (w[i] < lo[i]) lo[i] = w[i];
          if (w[i] > hi[i]) hi[i] = w[i];
        }
      }
    }
    if (lo[0] !== Infinity) {
      perMesh.push({ name: node.name || gltf.meshes[node.mesh].name || `node${idx}`, lo, hi });
    }
  }
  for (const c of node.children || []) walk(c, m);
};

for (const s of gltf.scenes[gltf.scene ?? 0].nodes) walk(s, ident());

const f = (v) => v.map((x) => (x * extraScale).toFixed(2)).join(', ');
console.log('scale applied :', extraScale);
console.log('world min     :', f(min));
console.log('world max     :', f(max));
console.log('size (m)      :', f(max.map((v, i) => v - min[i])));
console.log('\nper-node parts (scaled), largest first:');
perMesh
  .map((p) => ({ ...p, vol: (p.hi[0]-p.lo[0]) * (p.hi[1]-p.lo[1]) * (p.hi[2]-p.lo[2]) }))
  .sort((a, b) => b.vol - a.vol)
  .slice(0, 8)
  .forEach((p) => console.log(`  ${p.name.padEnd(12)} min(${f(p.lo)})  max(${f(p.hi)})`));
