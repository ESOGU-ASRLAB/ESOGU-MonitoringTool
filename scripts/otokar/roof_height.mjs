// Minimum Y (lowest roof/truss point) of the warehouse glTF, restricted to an
// x-band and optionally a z-band. The vaulted roof is not flat -- it is lower
// near the side walls than at the centre -- so a single building-wide "lowest
// beam" figure is a safe conservative floor everywhere, but not the true
// clearance at any one spot. Use this to get the real number for a specific
// placement.
//
//   node scripts/otokar/roof_height.mjs <factory.glb> <scale> <xMin> <xMax> [zMin] [zMax] [yFloor]
//
// scale is CONVERTED_SCALE from Factory.js (1/2.02157 for the current asset).
// yFloor (default 3.5) excludes floor/wall/furniture vertices so only
// roof/truss members are considered.
import { readFileSync } from 'fs';

const file = process.argv[2];
const scale = Number(process.argv[3]);
const xMin = Number(process.argv[4]), xMax = Number(process.argv[5]);
const zMin = process.argv[6] !== undefined ? Number(process.argv[6]) : -Infinity;
const zMax = process.argv[7] !== undefined ? Number(process.argv[7]) : Infinity;
// Roof/truss members only -- excludes floor, walls, furniture. Chosen from
// the per-node dump: the lowest wall-top / truss members start around y=5.
const yFloor = process.argv[8] !== undefined ? Number(process.argv[8]) : 3.5;

const buf = readFileSync(file);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;

const mul = (a, b) => { const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+r]*b[c*4+k]; o[c*4+r] = s; } return o; };
const ident = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const trs = (n) => {
  if (n.matrix) return n.matrix.slice();
  const [x,y,z,w] = n.rotation || [0,0,0,1]; const [sx,sy,sz] = n.scale || [1,1,1]; const [tx,ty,tz] = n.translation || [0,0,0];
  const x2=x+x,y2=y+y,z2=z+z, xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return [(1-(yy+zz))*sx,(xy+wz)*sx,(xz-wy)*sx,0, (xy-wz)*sy,(1-(xx+zz))*sy,(yz+wx)*sy,0, (xz+wy)*sz,(yz-wx)*sz,(1-(xx+yy))*sz,0, tx,ty,tz,1];
};
const apply = (m, p) => [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12], m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13], m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];

function accessorArray(accIdx) {
  const acc = gltf.accessors[accIdx];
  const bv = gltf.bufferViews[acc.bufferView];
  const start = binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const n = acc.count;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i*3] = buf.readFloatLE(start + i*12);
    out[i*3+1] = buf.readFloatLE(start + i*12 + 4);
    out[i*3+2] = buf.readFloatLE(start + i*12 + 8);
  }
  return out;
}

let minY = Infinity, atX = null, atZ = null, sampled = 0;
const walk = (idx, parent) => {
  const node = gltf.nodes[idx];
  const m = mul(parent, trs(node));
  if (node.mesh !== undefined) {
    for (const prim of gltf.meshes[node.mesh].primitives || []) {
      const accIdx = prim.attributes?.POSITION;
      if (accIdx === undefined) continue;
      const arr = accessorArray(accIdx);
      for (let i = 0; i < arr.length; i += 3) {
        const w = apply(m, [arr[i]*scale, arr[i+1]*scale, arr[i+2]*scale]);
        sampled++;
        if (w[0] >= xMin && w[0] <= xMax && w[2] >= zMin && w[2] <= zMax && w[1] >= yFloor) {
          if (w[1] < minY) { minY = w[1]; atX = w[0]; atZ = w[2]; }
        }
      }
    }
  }
  for (const c of node.children || []) walk(c, m);
};
for (const s of gltf.scenes[gltf.scene ?? 0].nodes) walk(s, ident());

console.log(`x in [${xMin}, ${xMax}], z in [${zMin}, ${zMax}]  ->  min roof/structure Y = ${minY.toFixed(3)} m  (at x=${atX?.toFixed(2)}, z=${atZ?.toFixed(2)}; sampled ${sampled} verts)`);
