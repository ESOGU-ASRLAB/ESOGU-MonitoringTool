// Measured vs expected cell clearances, per rail, from the SHIPPED meshes.
//
// The three figures come from Otokar's MATISSE_Arac_Konumu deck and must hold
// on BOTH sides now that the cell is two parallel rails with the body between
// them. Everything is read out of the GLBs and the component's own constants,
// so this cannot drift from what actually renders.
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import { readGlbBox, ROOT, createInspector } from './scene_inspection.mjs';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const inspector = createInspector({ './OtokarMesh': () => ({ type: 'group', props: {} }) });
const bus = inspector.load('OtokarBusBody');
const geom = inspector.load('otokarCellGeometry');
const OFFSET = bus.BUS_OFFSET_MM;

const mm = (v) => v * 1000;
const glb = (rel) => {
  const f = resolve(ROOT, `client/public/meshes/bus-inspection/${rel}.glb`);
  return existsSync(f) ? readGlbBox(f) : null;
};

const busBox = glb('bus/hi/body');
const r1 = glb('robot1/hi/axis1');
const r2 = glb('robot2/hi/axis1');

// The bus mesh is not baked; OtokarBusBody places it by BUS_OFFSET_MM.
const busMin = { x: mm(busBox.min.x) + OFFSET[0], y: mm(busBox.min.y) + OFFSET[1], z: mm(busBox.min.z) + OFFSET[2] };
const busMax = { x: mm(busBox.max.x) + OFFSET[0], y: mm(busBox.max.y) + OFFSET[1], z: mm(busBox.max.z) + OFFSET[2] };
const busRear = bus.BODY_REAR_X_MM + OFFSET[0];
const busUnderside = bus.BODY_UNDERSIDE_Z_MM + OFFSET[2];

// The body export carries jig geometry, so its own reference faces come from
// the percentile-derived constants, not the raw mesh extremes.
const HALF_WIDTH = bus.BODY_HALF_WIDTH_MM;
const centreY = bus.BODY_CENTRELINE_IN_ROBOT_MM;
const sideNear = centreY + HALF_WIDTH;   // toward robot 1
const sideFar = centreY - HALF_WIDTH;    // toward robot 2

console.log(`bus centreline Y      ${centreY.toFixed(2)} mm   half width ${HALF_WIDTH}`);
console.log(`bus sides             near ${sideNear.toFixed(2)}   far ${sideFar.toFixed(2)}`);
console.log(`bus datum rear X     ${busRear.toFixed(2)}   underside Z ${busUnderside.toFixed(2)}`);
console.log();

const rows = [];
const push = (what, robot, measured, expected) => rows.push({
  what, robot, measured, expected, delta: measured - expected,
});

if (r1) {
  // robot 1's rail lies at +Y, so its inner face is its MIN y.
  push('slider surface -> bus side', 'robot1', geom.RAIL_INNER_FACE_MM - sideNear, 1643.6612);
  push('slider rear -> bus rear', 'robot1', busRear - geom.RAIL_REAR_X_MM, 1160.4634);
  push('foot surface -> bus underside', 'robot1', busUnderside - geom.RAIL_FOOT_TOP_MM, 1646.2384);
}
if (r2) {
  // robot 2's rail lies at -Y, mirrored, so its inner face is its MAX y.
  const mirroredInner = 2 * centreY - geom.RAIL_INNER_FACE_MM;
  const mirroredRear = geom.RAIL_REAR_X_MM;
  push('slider surface -> bus side', 'robot2', sideFar - mirroredInner, 1643.6612);
  push('slider rear -> bus rear', 'robot2', busRear - mirroredRear, 1160.4634);
  push('foot surface -> bus underside', 'robot2', busUnderside - geom.RAIL_FOOT_TOP_MM, 1646.2384);
}

console.log('measurement'.padEnd(32), 'robot'.padEnd(9), 'measured'.padStart(12), 'expected'.padStart(12), 'delta'.padStart(10));
for (const r of rows) {
  console.log(r.what.padEnd(32), r.robot.padEnd(9),
    r.measured.toFixed(2).padStart(12), r.expected.toFixed(2).padStart(12),
    (r.delta >= 0 ? '+' : '') + r.delta.toFixed(2).padStart(9));
}

console.log();
if (r1 && r2) {
  const MIRROR = 2 * centreY;
  console.log('rail mirror check about the body centre plane:');
  for (const [name, a, b] of [
    ['inner face', mm(r1.min.y), MIRROR - mm(r2.max.y)],
    ['outer face', mm(r1.max.y), MIRROR - mm(r2.min.y)],
    ['rear end X', mm(r1.min.x), mm(r2.min.x)],
    ['front end X', mm(r1.max.x), mm(r2.max.x)],
    ['rail top Z', mm(r1.max.z), mm(r2.max.z)],
  ]) {
    console.log(`  ${name.padEnd(12)} robot1 ${a.toFixed(2).padStart(11)}   robot2(mirrored) ${b.toFixed(2).padStart(11)}   diff ${(a - b).toFixed(2).padStart(8)} mm`);
  }
}
