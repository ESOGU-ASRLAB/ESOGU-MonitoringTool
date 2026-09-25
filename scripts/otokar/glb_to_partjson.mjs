// Dump one or more built GLBs into the JSON format partview.html renders, so
// the shipped meshes can be inspected in isolation the same way STEP
// sub-assemblies are (extract_part.py). GLBs are in metres; partview expects
// mm, so positions are scaled back up.
//
//   PARTS="robot1/hi/axis1,robot1/hi/axis1_carriage" JSON_OUT=... \
//     node scripts/otokar/glb_to_partjson.mjs
import { writeFileSync } from 'node:fs';
import { readOtokarGeometry } from './glb_geometry.mjs';

const specs = process.env.PARTS.split(',').map((s) => s.trim()).filter(Boolean);
const out = process.env.JSON_OUT;

const parts = specs.map((spec) => {
  const [group, lod, part] = spec.split('/');
  const geometry = readOtokarGeometry(group, part, lod);
  const pos = geometry.getAttribute('position').array;
  const mm = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i++) mm[i] = pos[i] * 1000;
  const idx = Uint32Array.from(geometry.getIndex().array);
  const b = geometry.boundingBox;
  console.log(`${spec.padEnd(34)} ${(idx.length / 3).toString().padStart(8)} tris  ` +
    `bbox mm (${(b.min.x * 1000).toFixed(0)}, ${(b.min.y * 1000).toFixed(0)}, ${(b.min.z * 1000).toFixed(0)}) .. ` +
    `(${(b.max.x * 1000).toFixed(0)}, ${(b.max.y * 1000).toFixed(0)}, ${(b.max.z * 1000).toFixed(0)})  ` +
    `size ${((b.max.x - b.min.x) * 1000).toFixed(0)} x ${((b.max.y - b.min.y) * 1000).toFixed(0)} x ${((b.max.z - b.min.z) * 1000).toFixed(0)}`);
  return {
    label: spec,
    solids: 0,
    triangles: idx.length / 3,
    bbox: [b.min.x * 1000, b.min.y * 1000, b.min.z * 1000,
      b.max.x * 1000, b.max.y * 1000, b.max.z * 1000],
    children: [],
    positions: Buffer.from(mm.buffer, mm.byteOffset, mm.byteLength).toString('base64'),
    indices: Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength).toString('base64'),
  };
});

writeFileSync(out, JSON.stringify({ source: specs.join(' + '), parts }));
console.log(`WROTE ${out}`);
