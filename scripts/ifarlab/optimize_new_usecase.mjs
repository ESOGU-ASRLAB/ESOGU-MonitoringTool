// Rebuild the served door meshes from the original CAD STLs. Coordinates are
// kept in metres so the platform and both doors retain their shared frame.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assetDir = path.join(root, 'client/public/new_usecase');
const clientRequire = createRequire(path.join(root, 'client/package.json'));
const { STLLoader } = await import(pathToFileURL(clientRequire.resolve('three/examples/jsm/loaders/STLLoader.js')));
const { mergeVertices } = await import(pathToFileURL(clientRequire.resolve('three/examples/jsm/utils/BufferGeometryUtils.js')));
const { MeshoptSimplifier } = await import(pathToFileURL(clientRequire.resolve('meshoptimizer')));
await MeshoptSimplifier.ready;

function writeStl(target, positions, indices) {
  const out = Buffer.alloc(84 + indices.length / 3 * 50);
  out.write('Optimized door mesh; source: new_usecase CAD STL', 0, 'ascii');
  out.writeUInt32LE(indices.length / 3, 80);
  let offset = 84;
  for (let i = 0; i < indices.length; i += 3) {
    const vertices = [0, 1, 2].map((k) => positions.subarray(indices[i + k] * 3, indices[i + k] * 3 + 3));
    const [a, b, c] = vertices;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const length = Math.hypot(...n) || 1;
    for (const v of [n.map((x) => x / length), ...vertices]) {
      for (let axis = 0; axis < 3; axis += 1) out.writeFloatLE(v[axis], offset + axis * 4);
      offset += 12;
    }
    out.writeUInt16LE(0, offset);
    offset += 2;
  }
  fs.writeFileSync(target, out);
}

for (const name of ['windowdoor', 'windowlessdoor']) {
  const file = fs.readFileSync(path.join(assetDir, `${name}.stl`));
  const geometry = new STLLoader().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  const positionsOnly = geometry.clone();
  positionsOnly.deleteAttribute('normal');
  const welded = mergeVertices(positionsOnly, 1e-5);
  const positions = welded.getAttribute('position').array;
  const indices = new Uint32Array(welded.getIndex().array);
  const [simplified, error] = MeshoptSimplifier.simplify(indices, positions, 3, 3, 0.0005);
  writeStl(path.join(assetDir, `${name}.optimized.stl`), positions, simplified);
  console.log(`${name}: ${indices.length / 3} -> ${simplified.length / 3} triangles; error ${(error * 100).toFixed(3)}%`);
}
