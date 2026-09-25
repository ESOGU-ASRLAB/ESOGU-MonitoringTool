// Find the DISCONNECTED PIECES of the bus body mesh.
//
// The body arrives as one undifferentiated Draco mesh -- no part names, no node
// hierarchy -- so a piece that is floating in the wrong place cannot be picked
// out by name. What it CAN be picked out by is connectivity: the body shell is
// one huge welded island, and anything that is not touching it is a separate
// island of its own.
//
// Vertices are welded on a 1 mm grid before the union-find, because the
// tessellation does not guarantee that two triangles meeting at a seam share an
// index -- without the weld the shell itself shatters into thousands of islands
// and the result says nothing.
//
//   node scripts/otokar/bus_islands.mjs [lod]
import { readOtokarGeometry } from './glb_geometry.mjs';

const lod = process.argv[2] || 'hi';
const geometry = readOtokarGeometry('bus', 'body', lod);
const position = geometry.getAttribute('position');
const index = geometry.getIndex();
const count = position.count;

// GLBs are in metres; everything Otokar quotes is mm, so report in mm.
const M_TO_MM = 1000;
const WELD_MM = 1.0;

const key = new Map();
const weld = new Int32Array(count);
for (let i = 0; i < count; i += 1) {
  const x = Math.round((position.getX(i) * M_TO_MM) / WELD_MM);
  const y = Math.round((position.getY(i) * M_TO_MM) / WELD_MM);
  const z = Math.round((position.getZ(i) * M_TO_MM) / WELD_MM);
  const k = `${x},${y},${z}`;
  let id = key.get(k);
  if (id === undefined) {
    id = key.size;
    key.set(k, id);
  }
  weld[i] = id;
}

const parent = new Int32Array(key.size);
for (let i = 0; i < parent.length; i += 1) parent[i] = i;
const find = (a) => {
  let r = a;
  while (parent[r] !== r) r = parent[r];
  while (parent[a] !== r) {
    const next = parent[a];
    parent[a] = r;
    a = next;
  }
  return r;
};
const union = (a, b) => {
  const ra = find(a);
  const rb = find(b);
  if (ra !== rb) parent[ra] = rb;
};

for (let i = 0; i < index.count; i += 3) {
  const a = weld[index.getX(i)];
  const b = weld[index.getX(i + 1)];
  const c = weld[index.getX(i + 2)];
  union(a, b);
  union(b, c);
}

const islands = new Map();
for (let i = 0; i < count; i += 1) {
  const root = find(weld[i]);
  let box = islands.get(root);
  if (!box) {
    box = { n: 0, tris: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    islands.set(root, box);
  }
  const p = [position.getX(i) * M_TO_MM, position.getY(i) * M_TO_MM, position.getZ(i) * M_TO_MM];
  for (let d = 0; d < 3; d += 1) {
    if (p[d] < box.min[d]) box.min[d] = p[d];
    if (p[d] > box.max[d]) box.max[d] = p[d];
  }
  box.n += 1;
}
for (let i = 0; i < index.count; i += 3) {
  islands.get(find(weld[index.getX(i)])).tris += 1;
}

/*
 * The body is a WELDMENT -- every profile, bracket and panel is its own solid,
 * so ~2500 islands is the normal, healthy state and island count alone says
 * nothing. What identifies a stray is an island sitting OUTSIDE the envelope
 * the rest of the body occupies.
 *
 * The envelope is the 0.5/99.5 percentile box of the vertex cloud (the same cut
 * OtokarBusBody.js takes its reference faces from, and for the same reason: the
 * raw bbox is stretched by the strays themselves, so using it would define the
 * problem away). An island is reported when its whole bbox clears that box on
 * some axis.
 */
const axisPercentile = (getter, lo, hi) => {
  const values = new Float64Array(count);
  for (let i = 0; i < count; i += 1) values[i] = getter(i) * M_TO_MM;
  values.sort();
  return [values[Math.floor(values.length * lo)], values[Math.floor(values.length * hi)]];
};
const envelope = [
  axisPercentile((i) => position.getX(i), 0.005, 0.995),
  axisPercentile((i) => position.getY(i), 0.005, 0.995),
  axisPercentile((i) => position.getZ(i), 0.005, 0.995),
];
console.log(
  'body envelope (0.5/99.5 percentile, mm): ' +
    envelope.map(([a, b], d) => `${'XYZ'[d]} [${a.toFixed(1)}, ${b.toFixed(1)}]`).join('  '),
);

const strays = [...islands.values()]
  .map((b) => {
    const clears = [];
    for (let d = 0; d < 3; d += 1) {
      if (b.max[d] < envelope[d][0]) clears.push(`${'XYZ'[d]} below by ${(envelope[d][0] - b.max[d]).toFixed(0)}mm`);
      if (b.min[d] > envelope[d][1]) clears.push(`${'XYZ'[d]} above by ${(b.min[d] - envelope[d][1]).toFixed(0)}mm`);
    }
    return { ...b, clears };
  })
  .filter((b) => b.clears.length)
  .sort((a, b) => b.n - a.n);

console.log(`
ISLANDS FULLY OUTSIDE THE BODY ENVELOPE: ${strays.length}`);
for (const b of strays) {
  console.log(
    `  verts=${String(b.n).padStart(6)} tris=${String(b.tris).padStart(6)}  ` +
      `X [${b.min[0].toFixed(1)}, ${b.max[0].toFixed(1)}]  ` +
      `Y [${b.min[1].toFixed(1)}, ${b.max[1].toFixed(1)}]  ` +
      `Z [${b.min[2].toFixed(1)}, ${b.max[2].toFixed(1)}]  ` +
      `size ${[0, 1, 2].map((d) => (b.max[d] - b.min[d]).toFixed(0)).join(' x ')}  ` +
      `:: ${b.clears.join(', ')}`,
  );
}

const sorted = [...islands.values()].sort((a, b) => b.n - a.n);
const fmt = (v) => v.toFixed(1).padStart(10);
console.log(`lod=${lod}  vertices=${count}  welded=${key.size}  islands=${sorted.length}`);
console.log('    verts     tris        Xmin       Xmax       Ymin       Ymax       Zmin       Zmax     sizeX   sizeY   sizeZ');
for (const b of sorted.slice(0, 40)) {
  const s = [0, 1, 2].map((d) => b.max[d] - b.min[d]);
  console.log(
    `${String(b.n).padStart(9)}${String(b.tris).padStart(9)}  ` +
      `${fmt(b.min[0])}${fmt(b.max[0])}${fmt(b.min[1])}${fmt(b.max[1])}${fmt(b.min[2])}${fmt(b.max[2])}  ` +
      `${s.map((v) => v.toFixed(0).padStart(7)).join(' ')}`,
  );
}
