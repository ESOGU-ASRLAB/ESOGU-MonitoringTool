// Simplify the IFARLAB workcell's CAD meshes for the browser and the headset.
//
//   npm i --no-save --prefix scripts/ifarlab meshoptimizer   (once)
//   node scripts/ifarlab/simplify_meshes.mjs [maxError]
//
// The STL files under client/public/meshes/{ur10e,rs005l,environment,ota} are
// exports of the robots' ROS description packages and the Gazebo world, at
// CAD density: ~1.1 M triangles for the cell, over half of everything a Quest 3
// had to draw per eye. The originals live in source-meshes/ifarlab/ (not
// served); this writes simplified copies to the served paths UNDER THE SAME
// NAMES, as binary STL with facet normals, so every component keeps loading
// them exactly as before -- same units, same raw coordinates (the recentring
// offsets in UR10eRobot.js and friends depend on them), same faceted shading.
//
// Simplification is bounded by ERROR, not by a triangle ratio: each mesh loses
// triangles only while its surface stays within `maxError` of its own size
// (meshoptimizer's relative error; default 0.002 = 0.2%, i.e. 2 mm on a 1 m
// part). Small meshes are copied as they are.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const SRC = path.join(ROOT, 'source-meshes/ifarlab');
const OUT = path.join(ROOT, 'client/public/meshes');
const SETS = ['ur10e', 'rs005l', 'environment', 'ota'];
const MAX_ERROR = Number(process.argv[2]) || 0.002;
// Below this there is nothing worth taking away.
const KEEP_BELOW_TRIANGLES = 2000;
// Tighter bounds where the default loses something visible. The safety fence
// panels are ~2.7 m wide with ~4 mm wires, so 0.2% of their size (~5 mm)
// collapsed the mesh to its frame; checked side by side against the originals.
const ERROR_OVERRIDES = [
  [/^barrier/i, 0.0003],
];

const three = path.join(ROOT, 'client/node_modules/three');
const { STLLoader } = await import(pathToFileURL(path.join(three, 'examples/jsm/loaders/STLLoader.js')));
const { mergeVertices } = await import(pathToFileURL(path.join(three, 'examples/jsm/utils/BufferGeometryUtils.js')));
const THREE = await import(pathToFileURL(path.join(three, 'build/three.module.js')));
const requireLocal = createRequire(path.join(here, 'package.json'));
const meshopt = await import(pathToFileURL(requireLocal.resolve('meshoptimizer')));
const { MeshoptSimplifier } = meshopt;
await MeshoptSimplifier.ready;

function writeBinaryStl(file, positions, indices) {
  const triangles = indices.length / 3;
  const buffer = Buffer.alloc(84 + triangles * 50);
  buffer.write('simplified by scripts/ifarlab/simplify_meshes.mjs', 0, 'ascii');
  buffer.writeUInt32LE(triangles, 80);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  let o = 84;
  for (let t = 0; t < triangles; t += 1) {
    a.fromArray(positions, indices[t * 3] * 3);
    b.fromArray(positions, indices[t * 3 + 1] * 3);
    c.fromArray(positions, indices[t * 3 + 2] * 3);
    n.subVectors(b, a).cross(c.clone().sub(a)).normalize();
    for (const v of [n, a, b, c]) {
      buffer.writeFloatLE(v.x, o);
      buffer.writeFloatLE(v.y, o + 4);
      buffer.writeFloatLE(v.z, o + 8);
      o += 12;
    }
    buffer.writeUInt16LE(0, o);
    o += 2;
  }
  fs.writeFileSync(file, buffer);
}

const loader = new STLLoader();
let before = 0;
let after = 0;
for (const set of SETS) {
  const dir = path.join(SRC, set);
  for (const name of fs.readdirSync(dir).filter((f) => /\.stl$/i.test(f)).sort()) {
    const data = fs.readFileSync(path.join(dir, name));
    const source = loader.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    const count = source.getAttribute('position').count / 3;
    const target = path.join(OUT, set, name);
    before += count;

    if (count < KEEP_BELOW_TRIANGLES) {
      fs.copyFileSync(path.join(dir, name), target);
      after += count;
      console.log(`${set}/${name}: ${count} triangles, kept`);
      continue;
    }

    // Weld on position only: STL repeats every corner once per triangle.
    const positionOnly = new THREE.BufferGeometry();
    positionOnly.setAttribute('position', source.getAttribute('position'));
    const welded = mergeVertices(positionOnly, 1e-4);
    const positions = welded.getAttribute('position').array;
    const indices = new Uint32Array(welded.getIndex().array);
    const maxError = ERROR_OVERRIDES.find(([pattern]) => pattern.test(name))?.[1] ?? MAX_ERROR;
    const [simplified, error] = MeshoptSimplifier.simplify(indices, positions, 3, 3, maxError);

    writeBinaryStl(target, positions, simplified);
    const kept = simplified.length / 3;
    after += kept;
    console.log(`${set}/${name}: ${count} -> ${kept} triangles (${((100 * kept) / count).toFixed(1)}%, error ${(error * 100).toFixed(3)}%)`);
  }
}
console.log(`total: ${before} -> ${after} triangles (${((100 * after) / before).toFixed(1)}%)`);
