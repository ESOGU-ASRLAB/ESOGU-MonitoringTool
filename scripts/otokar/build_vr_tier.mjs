// Build the Otokar cell's 'vr' mesh tier from its 'lo' tier.
//
//   npm i --no-save --prefix scripts/otokar @gltf-transform/core@4 \
//     @gltf-transform/extensions@4 @gltf-transform/functions@4 draco3dgltf meshoptimizer   (once)
//   node scripts/otokar/build_vr_tier.mjs [maxError]
//
// The lo tier is still ~1.16 M triangles for the parts the scene draws (the bus
// body alone is 0.4 M), and a Quest 3 draws the scene once per eye. This takes
// every lo part the cell uses, welds it and simplifies it with meshoptimizer,
// bounded by error rather than a ratio (`maxError` of the part's own size,
// default 0.0015 = 0.15%: 18 mm over the 12 m body, 2 mm on a 1.3 m arm stage),
// and writes it Draco-compressed to meshes/bus-inspection/<group>/vr/<part>.glb, the
// path OtokarMesh builds for lod 'vr'. Same frame and units as lo, so the cell
// mounts it unchanged; the headset profile picks it (xrSession.js).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const BASE = path.join(ROOT, 'client/public/meshes/bus-inspection');
const MAX_ERROR = Number(process.argv[2]) || 0.0015;
// Exported but not mounted since the telescopic split (axis3_fixed/_middle/_outer).
const SKIP = new Set(['axis3.glb']);
// The energy chains are a long run of small links: at the default bound the
// 15 m tray chain collapsed to a flat outline (checked side by side with lo).
const ERROR_OVERRIDES = [
  [/chain/, 0.0006],
];

const requireLocal = createRequire(path.join(here, 'package.json'));
const load = (name) => import(pathToFileURL(requireLocal.resolve(name)));
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS, KHRDracoMeshCompression } = await load('@gltf-transform/extensions');
const { weld, simplify } = await load('@gltf-transform/functions');
const draco3d = (await load('draco3dgltf')).default;
const { MeshoptSimplifier } = await load('meshoptimizer');
await MeshoptSimplifier.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});

const triangles = (doc) => doc.getRoot().listMeshes()
  .flatMap((mesh) => mesh.listPrimitives())
  .reduce((sum, prim) => sum + (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3, 0);

let before = 0;
let after = 0;
for (const group of fs.readdirSync(BASE)) {
  const lo = path.join(BASE, group, 'lo');
  if (!fs.existsSync(lo)) continue;
  const vr = path.join(BASE, group, 'vr');
  fs.mkdirSync(vr, { recursive: true });
  for (const file of fs.readdirSync(lo).filter((f) => f.endsWith('.glb') && !SKIP.has(f)).sort()) {
    const doc = await io.read(path.join(lo, file));
    const count = triangles(doc);
    const error = ERROR_OVERRIDES.find(([pattern]) => pattern.test(file))?.[1] ?? MAX_ERROR;
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0, error }));
    doc.createExtension(KHRDracoMeshCompression).setRequired(true);
    await io.write(path.join(vr, file), doc);
    const kept = triangles(doc);
    before += count;
    after += kept;
    console.log(`${group}/${file}: ${count} -> ${kept} triangles (${((100 * kept) / count).toFixed(1)}%)`);
  }
}
console.log(`total: ${before} -> ${after} triangles (${((100 * after) / before).toFixed(1)}%)`);
