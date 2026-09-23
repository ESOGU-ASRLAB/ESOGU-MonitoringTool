// Publish the placement manifest beside the meshes.
//
// A baked transform leaves no trace in the GLB, so the record of which matrix
// was baked into which mesh -- and what upstream placed instance it was read
// from -- has to ship with the assets rather than live only in the build
// scripts.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const DEST = resolve(ROOT, 'client/public/meshes/otokar');

const source = JSON.parse(readFileSync(resolve(HERE, 'placements.json'), 'utf8'));

// Which GLBs each source file produces, mirroring the JOBS table in
// build_otokar_meshes.sh.
const OUTPUTS = {
  Robot1_EKSEN1: ['robot1/{tier}/axis1', 'robot1/{tier}/axis1_carriage'],
  Robot1_EKSEN2: ['robot1/{tier}/axis2'],
  Robot1_EKSEN3: ['robot1/{tier}/axis3'],
  Robot1_EKSEN4: ['robot1/{tier}/axis4'],
  Robot1_EKSEN5: ['robot1/{tier}/axis5'],
  Robot2_Kamera: ['shared/{tier}/camera'],
};

const entries = [];
for (const [stem, spec] of Object.entries(source.sources)) {
  for (const pattern of OUTPUTS[stem] || []) {
    for (const tier of ['hi', 'lo']) {
      const rel = `${pattern.replace('{tier}', tier)}.glb`;
      entries.push({
        glb: rel,
        present: existsSync(resolve(DEST, rel)),
        source: `${stem}.stp`,
        matrix: spec.matrix,
        provenance: spec.provenance,
        evidence: spec.evidence,
      });
    }
  }
}

mkdirSync(DEST, { recursive: true });
const out = resolve(DEST, 'placements.json');
writeFileSync(out, JSON.stringify({
  frame: source.frame,
  note: source.note,
  generated: new Date().toISOString().slice(0, 10),
  entries,
}, null, 2) + '\n');

const baked = entries.filter((e) => e.matrix).length;
console.log(`placements.json: ${entries.length} entries, ${baked} with a baked matrix, ` +
  `${entries.length - baked} declared-assumption, ${entries.filter((e) => !e.present).length} not built`);
