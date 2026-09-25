/*
 * Every pair in the cell that can touch, over the whole of axis 1's travel.
 *
 * verify_inspection_program.mjs only asks one question -- does the ARM clear
 * the BUS -- and answered it for the program's own legs. That leaves the rest
 * of the cell unchecked: a machine can pass that test and still drive its
 * carriage through its own cable chain, or put one robot's arm into the other's.
 *
 * Distances are surface-to-surface via MeshBVH on the real mounted hierarchy,
 * so a negative result is not a bounding-box artefact. Pairs that are BOLTED
 * together (carriage to column, stage to stage) are excluded: they touch by
 * design and probe_assembly.mjs is what checks those.
 *
 *   node scripts/otokar/verify_cell_collisions.mjs
 * Exits non-zero if any pair comes closer than FAIL_MM.
 */
import { assemblyScene } from './assembly_scene.mjs';
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import { MeshBVH } from '../../client/node_modules/three-mesh-bvh/src/index.js';
import { OTOKAR_INSPECTION_PROGRAMS } from '../../client/src/components/otokarMotion.js';

const FAIL_MM = 20;
const MAX_MM = 3000;

const poses = { robot1: [0, 0, 0, 0, 0], robot2: [0, 0, 0, 0, 0] };
const { robots, update } = assemblyScene(poses);

function setPose(robotId, axes) {
  for (let i = 0; i < axes.length; i += 1) poses[robotId][i] = axes[i];
}

const tmp = new THREE.Matrix4();
function gap(a, b) {
  if (!a || !b) return Infinity;
  if (!a.geometry.boundsTree) a.geometry.boundsTree = new MeshBVH(a.geometry);
  if (!b.geometry.boundsTree) b.geometry.boundsTree = new MeshBVH(b.geometry);
  tmp.copy(a.matrixWorld).invert().multiply(b.matrixWorld);
  const hit = a.geometry.boundsTree.closestPointToGeometry(b.geometry, tmp, {}, {}, 0, MAX_MM / 1000);
  return hit ? hit.distance * 1000 : Infinity;
}

/*
 * What can touch that is not bolted together.
 *
 * Within one robot, the interesting pair is the CARRIAGE against the CABLE
 * CHAIN: the chain is the one part driven at a different rate from the thing
 * that tows it, so it is the one that can be overtaken.
 */
const SELF_PAIRS = [
  ['axis1_carriage', 'axis1_chain'],
  ['axis2', 'axis1_chain'],
  ['axis3_outer', 'axis1'],
  ['axis4', 'axis1'],
  ['camera', 'axis1'],
];

// Across the two machines, the arms face each other over the bus.
const CROSS_PARTS = ['axis3_outer', 'axis4', 'axis5', 'camera'];

const rows = [];
function check(label, fn) {
  update();
  const worst = fn();
  rows.push({ label, worst });
  const bad = worst < FAIL_MM;
  console.log(`  ${label.padEnd(52)} ${worst === Infinity ? '  >3000' : worst.toFixed(0).padStart(7)} mm${bad ? '   <<< TOUCHING' : ''}`);
  return bad;
}

let failures = 0;

console.log('\n=== carriage and chain, over the whole of axis 1 (both robots at the same station)');
for (const a1 of [0, 200, 500, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 15247]) {
  for (const robotId of ['robot1', 'robot2']) {
    const program = OTOKAR_INSPECTION_PROGRAMS[robotId];
    setPose(robotId, [a1, program.columnHeight, 0, 0, 0]);
  }
  for (const robotId of ['robot1', 'robot2']) {
    for (const [a, b] of SELF_PAIRS) {
      if (check(`a1=${String(a1).padStart(5)}  ${robotId}  ${a}  vs  ${b}`, () => gap(robots[robotId][a], robots[robotId][b]))) {
        failures += 1;
      }
    }
  }
}

console.log('\n=== the two arms against each other, both fully extended at the same station');
for (const a1 of [1500, 4500, 7500, 10000, 12500]) {
  for (const robotId of ['robot1', 'robot2']) {
    const p = OTOKAR_INSPECTION_PROGRAMS[robotId];
    setPose(robotId, [a1, p.columnHeight, p.depth, p.tilt, p.roll]);
  }
  for (const a of CROSS_PARTS) {
    for (const b of CROSS_PARTS) {
      if (check(`a1=${String(a1).padStart(5)}  robot1 ${a}  vs  robot2 ${b}`, () => gap(robots.robot1[a], robots.robot2[b]))) {
        failures += 1;
      }
    }
  }
}

console.log(failures
  ? `\nFAILED: ${failures} pair/pose combination(s) closer than ${FAIL_MM} mm`
  : `\nOK: every unbolted pair stays at least ${FAIL_MM} mm apart.`);
process.exit(failures ? 1 : 0);
