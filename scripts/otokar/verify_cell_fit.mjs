// Verifies the complete Otokar cell against the warehouse and the measured
// IFARLAB workcell. It replays the same CAD->Three transform chain as the
// React components over the converted GLB bounds, including both robots,
// rotary pivots, camera heads and the bus body.
//
//   node scripts/otokar/verify_cell_fit.mjs
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import { readGlbBox, measureIfarlab, ROOT } from './scene_inspection.mjs';
import { resolve } from 'node:path';
import { IFARLAB_OFFSET } from '../../client/src/components/cellLayout.js';

const MESH = resolve(ROOT, 'client/public/meshes/bus-inspection');
const CAD_POSE = { a1: 0, a2: 0, a3: 0 };
const HOME = { robot1: [0, 600, 1800], robot2: [0, 3350, 1800] };
const CELL_ORIGIN = [-3.92, 1.368, -5.88]; // keep in sync with OtokarCell.js
const CELL_RY = Math.PI / 2;
const BUS_OFFSET_MM = [
  (-12724.986 + 1160.4634 - -9556) / 1000,
  (2757.4 - 1643.6612 - 1251 - 0) / 1000,
  (-1368 + 1646.2384 - 172) / 1000,
];
const PIVOTS = {
  robot1: { a4: [-12578.384, 2258.092, -585.3], a5: [-12641.184, 2258.092, -755.0], camera: [-12641.184, 2258.092, -886.0], axis3: -1 },
  robot2: { a4: [-12578.384, -2532.6144, -585.3], a5: [-12641.184, -2532.6144, -755.0], camera: [-12641.184, -2532.6144, -886.0], axis3: 1 },
};
const AXIS4_CHAIN_OFFSET = { robot1: [0, 583, 0], robot2: [0, -583, 0] };
const BUILDING = { min: [-16.39, -0.16, -24.73], max: [16.39, 10.17, 24.73] };
const LOW_ROOF_Y = 5.31;
const MM = 0.001;

const boxFor = (group, part, lod = 'hi') =>
  readGlbBox(resolve(MESH, group, lod, `${part}.glb`));

function attachBox(parent, box, label) {
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size.toArray()));
  mesh.name = label;
  mesh.position.copy(centre);
  parent.add(mesh);
  return mesh;
}

function makeRobot(cell, robotId, includeRail) {
  const root = new THREE.Group();
  root.name = `${robotId}-cad-frame`;
  root.rotation.x = -Math.PI / 2;
  cell.add(root);

  const a = HOME[robotId];
  const k = PIVOTS[robotId];
  const a1 = new THREE.Group();
  a1.name = 'axis-1-carriage';
  a1.position.x = (a[0] - CAD_POSE.a1) * MM;
  root.add(a1);
  const a2 = new THREE.Group();
  a2.name = 'axis-2-vertical';
  a2.position.z = (a[1] - CAD_POSE.a2) * MM;
  a1.add(a2);
  const a3 = new THREE.Group();
  a3.name = 'axis-3-arm';
  a3.position.y = k.axis3 * (a[2] - CAD_POSE.a3) * MM;
  a2.add(a3);
  const axis4Chain = new THREE.Group();
  axis4Chain.position.fromArray(AXIS4_CHAIN_OFFSET[robotId].map((v) => v * MM));
  a3.add(axis4Chain);

  const p4 = new THREE.Group();
  p4.position.fromArray(k.a4.map((v) => v * MM));
  axis4Chain.add(p4);
  const a4 = new THREE.Group();
  p4.add(a4);
  const p4Origin = new THREE.Group();
  p4Origin.position.fromArray(k.a4.map((v) => -v * MM));
  a4.add(p4Origin);

  const p5 = new THREE.Group();
  p5.position.fromArray(k.a5.map((v) => v * MM));
  p4Origin.add(p5);
  const a5 = new THREE.Group();
  p5.add(a5);
  const p5Origin = new THREE.Group();
  p5Origin.position.fromArray(k.a5.map((v) => -v * MM));
  a5.add(p5Origin);
  const cameraMount = new THREE.Group();
  cameraMount.position.fromArray(k.camera.map((v) => v * MM));
  p5Origin.add(cameraMount);

  const entries = [];
  if (includeRail) entries.push(['axis1', attachBox(root, boxFor(robotId, 'axis1'), `${robotId}/axis1`)]);
  entries.push(['axis1_carriage', attachBox(a1, boxFor(robotId, 'axis1_carriage'), `${robotId}/axis1_carriage`)]);
  entries.push(['axis2', attachBox(a2, boxFor(robotId, 'axis2'), `${robotId}/axis2`)]);
  entries.push(['axis3', attachBox(a3, boxFor(robotId, 'axis3'), `${robotId}/axis3`)]);
  entries.push(['axis4', attachBox(axis4Chain, boxFor(robotId, 'axis4'), `${robotId}/axis4`)]);
  entries.push(['axis5', attachBox(p4Origin, boxFor(robotId, 'axis5'), `${robotId}/axis5`)]);
  entries.push(['camera', attachBox(cameraMount, boxFor('shared', 'camera'), `${robotId}/camera`)]);
  return entries;
}

function makeCell() {
  const cell = new THREE.Group();
  cell.position.fromArray(CELL_ORIGIN);
  cell.rotation.y = CELL_RY;
  const entries = [
    ...makeRobot(cell, 'robot1', true),
    ...makeRobot(cell, 'robot2', true),
  ];

  const busRoot = new THREE.Group();
  busRoot.rotation.x = -Math.PI / 2;
  const busOffset = new THREE.Group();
  busOffset.position.fromArray(BUS_OFFSET_MM.map((v) => v * MM));
  busRoot.add(busOffset);
  const bus = attachBox(busOffset, boxFor('bus', 'body'), 'bus/body');
  cell.add(busRoot);
  entries.push(['bus', bus]);
  cell.updateMatrixWorld(true);
  return { cell, entries };
}

const { cell, entries } = makeCell();
const cellBox = new THREE.Box3();
const all = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
const f = (v) => v.map((x) => x.toFixed(2).padStart(7)).join(' ');
const add = (label, object) => {
  const box = new THREE.Box3().setFromObject(object, true);
  cellBox.union(box);
  for (let i = 0; i < 3; i++) {
    all.min[i] = Math.min(all.min[i], box.min.getComponent(i));
    all.max[i] = Math.max(all.max[i], box.max.getComponent(i));
  }
  console.log(`  ${label.padEnd(18)} min(${f(box.min.toArray())})  max(${f(box.max.toArray())})`);
};

console.log('placed in facility coords (x, y, z), hi-res mesh bounds:');
for (const [label, object] of entries) add(label, object);

const cellMin = new THREE.Vector3(...all.min);
const cellMax = new THREE.Vector3(...all.max);
console.log(`\nCELL UNION   min(${f(all.min)})  max(${f(all.max)})`);
console.log(`BUILDING     min(${f(BUILDING.min)})  max(${f(BUILDING.max)})`);
const names = ['x', 'y', 'z'];
let bad = false;
for (let i = 0; i < 3; i++) {
  const lo = all.min[i] - BUILDING.min[i];
  const hi = BUILDING.max[i] - all.max[i];
  // Downward is the exception: the rail's anchor studs and axis-2 energy
  // chain occupy the slab/trench below y=0 by design.
  const ok = i === 1 ? hi > 0 : lo > 0 && hi > 0;
  if (!ok) bad = true;
  const note = i === 1 ? `  (below-floor ${Math.max(0, -all.min[1]).toFixed(2)} m: embedded anchors + chain trench, expected)` : '';
  console.log(`  ${names[i]}: margin low ${lo.toFixed(2)} m, high ${hi.toFixed(2)} m  ${ok ? 'OK' : '*** OUTSIDE ***'}${note}`);
}
const roof = LOW_ROOF_Y - all.max[1];
if (roof <= 0) bad = true;
console.log(`  roof beams at ${LOW_ROOF_Y} m: clearance ${roof.toFixed(2)} m ${roof > 0 ? 'OK' : '*** CLIPPING ***'}`);

const ifarlab = measureIfarlab().box;
ifarlab.translate(new THREE.Vector3(...IFARLAB_OFFSET));
console.log(`\nIFARLAB UNION min(${f(ifarlab.min.toArray())}) max(${f(ifarlab.max.toArray())})`);
const overlap = cellBox.intersectsBox(ifarlab);
const gap = new THREE.Vector3(
  Math.max(0, Math.max(ifarlab.min.x - cellMax.x, cellMin.x - ifarlab.max.x)),
  Math.max(0, Math.max(ifarlab.min.y - cellMax.y, cellMin.y - ifarlab.max.y)),
  Math.max(0, Math.max(ifarlab.min.z - cellMax.z, cellMin.z - ifarlab.max.z)),
);
const distance = gap.length();
console.log(`  workcell overlap: ${overlap ? '*** COLLISION ***' : 'none'}`);
console.log(`  minimum workcell clearance: ${distance.toFixed(2)} m (x ${gap.x.toFixed(2)}, y ${gap.y.toFixed(2)}, z ${gap.z.toFixed(2)})`);
if (overlap || distance < 2) bad = true;

console.log(bad ? '\nRESULT: cell verification failed.' : '\nRESULT: cell fits inside the shell and clears the IFARLAB workcell.');
if (bad) process.exitCode = 1;
