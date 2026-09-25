/*
 * Is a candidate camera position standing inside a shelf?
 *
 * camera_framing.mjs only knows about the two cells and the building's shell.
 * The warehouse asset also carries racking, pallets and stacked stock along
 * the side walls, and a framing that puts the eye near a wall can land the
 * camera inside one of them -- with near at 0.05 m, a shelf leg a metre away
 * fills the shot.
 *
 * So this reports the nearest warehouse vertex to a point, split by what part
 * of the building it belongs to, using the same transform Factory.js applies.
 *
 *   node scripts/otokar/camera_clearance.mjs <x> <y> <z> [radius]
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, '../../client/public/assets/factory/warehouse_blender.blend.glb');
const SCALE = 1 / 2.02157; // CONVERTED_SCALE in Factory.js

const buf = readFileSync(FILE);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;

const mul = (a, b) => {
  const o = new Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
};
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const trs = (n) => {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, tx, ty, tz, 1];
};
const apply = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

function positions(accIdx) {
  const acc = gltf.accessors[accIdx];
  const bv = gltf.bufferViews[acc.bufferView];
  const stride = bv.byteStride || 12;
  const base = binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Array(acc.count);
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride;
    out[i] = [buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)];
  }
  return out;
}

/*
 * Every warehouse vertex, in world metres, with the node it came from. Walked
 * once and cached: camera_framing.mjs tests tens of thousands of candidate
 * positions against this and cannot afford to re-read the GLB for each.
 */
let cached = null;
export function warehousePoints() {
  if (cached) return cached;
  const pts = [];
  const scene = gltf.scenes[gltf.scene || 0];
  const walk = (idx, parent) => {
    const n = gltf.nodes[idx];
    const m = mul(parent, trs(n));
    if (n.mesh !== undefined) {
      const name = n.name || gltf.meshes[n.mesh].name || `node${idx}`;
      for (const prim of gltf.meshes[n.mesh].primitives) {
        if (prim.attributes.POSITION === undefined) continue;
        for (const p of positions(prim.attributes.POSITION)) {
          const w = apply(m, p);
          pts.push({ x: w[0] * SCALE, y: w[1] * SCALE, z: w[2] * SCALE, name });
        }
      }
    }
    for (const c of n.children || []) walk(c, m);
  };
  for (const r of scene.nodes) walk(r, ident());
  cached = pts;
  return pts;
}

/*
 * A 2D occupancy grid over the things a camera can walk into: racking,
 * pallets, stacked stock. The floor and the roof are excluded by height --
 * every eye height under consideration is between them, so including them
 * would mark the entire building occupied.
 */
export const FURNITURE_Y = [0.30, 5.00];
export function furnitureGrid(cell = 0.5) {
  const grid = new Set();
  for (const p of warehousePoints()) {
    if (p.y < FURNITURE_Y[0] || p.y > FURNITURE_Y[1]) continue;
    grid.add(`${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`);
  }
  return { grid, cell };
}

/* True when nothing solid stands within `clear` metres of (x, z). */
export function isOpenAir({ grid, cell }, x, z, clear = 1.5) {
  const r = Math.ceil(clear / cell);
  const gx = Math.floor(x / cell);
  const gz = Math.floor(z / cell);
  for (let i = -r; i <= r; i += 1)
    for (let j = -r; j <= r; j += 1)
      if (grid.has(`${gx + i},${gz + j}`)) return false;
  return true;
}

/*
 * Furniture close to the eye only matters if it is IN SHOT.
 *
 * The first version of this rejected any pose with racking within 2 m of the
 * camera, whatever direction it lay in, and that threw away every viewpoint
 * down the east wall -- where the shelving is -- including the ones that
 * framed both cells best. But a shelf behind the camera, or beside it, is
 * never drawn. What ruins a frame is a shelf standing in the view cone a metre
 * or two ahead.
 *
 * So: a point is a problem when it is nearer than `range`, in front of the
 * eye, and inside the horizontal half-angle of the frustum. The test is in
 * plan (x, z) only -- every pose here looks within a few degrees of level, so
 * the horizontal cone is what decides, and ignoring the vertical makes the
 * test conservative rather than lax.
 */
export function furnitureInShot(points, pos, lookX, lookZ, halfAngleDeg, range = 4.0) {
  const len = Math.hypot(lookX, lookZ);
  const fx = lookX / len;
  const fz = lookZ / len;
  const cosLimit = Math.cos((halfAngleDeg * Math.PI) / 180);
  let worst = null;
  for (const p of points) {
    const dx = p.x - pos.x;
    const dz = p.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range || d < 1e-6) continue;
    if ((dx * fx + dz * fz) / d < cosLimit) continue;
    if (!worst || d < worst.d) worst = { d, ...p };
  }
  return worst;
}

if (process.argv[1] && process.argv[1].endsWith('camera_clearance.mjs')) {
const px = Number(process.argv[2]);
const py = Number(process.argv[3]);
const pz = Number(process.argv[4]);
const radius = process.argv[5] !== undefined ? Number(process.argv[5]) : 3.0;
const hits = [];
for (const p of warehousePoints()) {
  const d = Math.hypot(p.x - px, p.y - py, p.z - pz);
  if (d < radius) hits.push({ d, ...p });
}

console.log('point [%s, %s, %s], radius %s m', px, py, pz, radius.toFixed(2));
if (!hits.length) {
  console.log('\nNOTHING within %s m -- the eye is in open air.', radius.toFixed(2));
  process.exit(0);
}
hits.sort((a, b) => a.d - b.d);
// Group by node so one shelf does not fill the report with its own vertices.
const byName = new Map();
for (const h of hits) if (!byName.has(h.name) || byName.get(h.name).d > h.d) byName.set(h.name, h);
console.log('\n%d vertices inside the radius, across %d objects. Nearest of each:\n',
  hits.length, byName.size);
for (const h of [...byName.values()].sort((a, b) => a.d - b.d).slice(0, 15)) {
  // Template string, not console.log's %s: it has no width specifier, so a
  // padded format there silently prints the literal "%-34s".
  console.log(`  ${h.d.toFixed(2).padStart(5)} m  ${h.name.padEnd(34)}`
    + ` at [${h.x.toFixed(2)}, ${h.y.toFixed(2)}, ${h.z.toFixed(2)}]`);
}
}
