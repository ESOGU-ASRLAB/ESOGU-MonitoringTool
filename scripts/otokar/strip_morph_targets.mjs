/*
 * Removes blend shapes from a GLB that never uses them.
 *
 * The walking worker is a Mixamo character, and it arrives with 150 morph
 * targets -- facial expressions and visemes. Each one is a full VEC3 delta
 * over the mesh's vertices, so they are the file: after textures were resized
 * to WebP (10.28 MB -> 0.79 MB) and the geometry was Draco-compressed
 * (0.35 MB), the asset was STILL 9.76 MB, and 8.5 MB of that was blend-shape
 * deltas for a face that is never animated and, at the distance this prop is
 * seen from, never even legible.
 *
 * The only animation on the asset is skeletal (Armature|mixamo.com|Layer0),
 * so nothing drives the weights. This checks that before touching anything:
 * if any animation channel has path "weights", it refuses rather than quietly
 * breaking the clip.
 *
 * Morph accessors and their bufferViews are left orphaned in the binary chunk,
 * which is valid glTF -- run `gltf-transform prune` afterwards to drop them.
 *
 *   node scripts/otokar/strip_morph_targets.mjs <in.glb> <out.glb>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: strip_morph_targets.mjs <in.glb> <out.glb>');
  process.exit(2);
}

const buf = readFileSync(inPath);
if (buf.subarray(0, 4).toString() !== 'glTF') {
  console.error(`${inPath} is not a GLB`);
  process.exit(1);
}

const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
// The BIN chunk follows the JSON chunk's 8-byte header; keep it verbatim.
const binStart = 20 + jsonLen;
const bin = buf.subarray(binStart);

const drivesWeights = (json.animations || []).some((a) =>
  (a.channels || []).some((c) => c.target && c.target.path === 'weights'));
if (drivesWeights) {
  console.error('REFUSING: an animation channel drives morph weights on this asset.');
  process.exit(1);
}

let removed = 0;
for (const mesh of json.meshes || []) {
  for (const prim of mesh.primitives || []) {
    if (prim.targets) {
      removed += prim.targets.length;
      delete prim.targets;
    }
  }
  delete mesh.weights;
  if (mesh.extras) delete mesh.extras.targetNames;
}
for (const node of json.nodes || []) delete node.weights;

if (!removed) {
  console.log('no morph targets found; nothing to do');
}

// Re-emit. Both chunks must be padded to a 4-byte boundary: JSON with spaces,
// BIN with zeros, or every offset after them is misread.
const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);

const header = Buffer.alloc(12);
header.write('glTF', 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + bin.length, 8);

const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.write('JSON', 4);

const out = Buffer.concat([header, jsonHeader, jsonChunk, bin]);
writeFileSync(outPath, out);

console.log(`removed ${removed} morph targets`);
console.log(`${inPath}: ${(buf.length / 1048576).toFixed(2)} MB`);
console.log(`${outPath}: ${(out.length / 1048576).toFixed(2)} MB  (prune to reclaim the orphans)`);
