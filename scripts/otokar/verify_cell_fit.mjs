// Verifies that the Otokar cell fits inside the warehouse shell, by replaying
// OtokarCell's whole transform chain over the converted GLB bounding boxes.
// Cheaper and far more reliable than judging it from a screenshot -- it is what
// caught robot 2's meshes landing 9.7 m outside the building.
//
//   node scripts/otokar/verify_cell_fit.mjs
//
// Constants below mirror the components; if a placement constant changes there,
// change it here too and re-run.
import { execSync } from 'child_process';

const MESH = 'client/public/meshes/otokar';
const bbox = (p) => {
  const out = execSync(`node "${process.argv[1].replace('verify_cell_fit.mjs','glb_bbox.mjs')}" "${MESH}/${p}.glb"`).toString();
  const g = (k) => {
    const line = out.split(String.fromCharCode(10)).find((l) => l.startsWith('world ' + k));
    return line.split(':')[1].split(',').map((v) => Number(v.trim()));
  };
  return { min: g('min'), max: g('max') };
};

// --- constants mirrored from the components -------------------------------
const CAD_POSE = { a1: 13474, a2: 0, a3: 900 };
const HOME = { robot1: [4500, 1200, 600], robot2: [11500, 1200, 600] };
const FRAME_RZ = { robot1: 0, robot2: 0 }; // both draw from the robot1 mesh set
const CELL_ORIGIN = [-10.10, 1.368, -5.88]; // keep in sync with OtokarCell.js
const CELL_RY = Math.PI / 2;
const BUS_OFFSET = [
  (-12724.986 + 1160.4634 - -9556) / 1000,
  (2757.4 - 1643.6612 - 1251 - 0) / 1000,
  (-1368 + 1646.2384 - 172) / 1000,
];
const BUILDING = { min: [-16.39, -0.16, -24.73], max: [16.39, 10.17, 24.73] };
const LOW_ROOF_Y = 5.31;

const corners = (b) => {
  const out = [];
  for (let i = 0; i < 8; i++) out.push([i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]);
  return out;
};
const rotZ = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]];
const cadToThree = (p) => [p[0], p[2], -p[1]];                      // root rotation.x = -PI/2
const rotY = (p, a) => [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)];

const place = (b, robot, cadShift) => {
  const a = HOME[robot];
  const d = [(a[0] - CAD_POSE.a1) / 1000, (a[2] - CAD_POSE.a3) / 1000, (a[1] - CAD_POSE.a2) / 1000]; // CAD x,y,z
  return corners(b).map((p) => {
    let q = cadShift ? [p[0] + cadShift[0], p[1] + cadShift[1], p[2] + cadShift[2]]
                     : [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
    q = rotZ(q, FRAME_RZ[robot]);
    q = cadToThree(q);
    q = rotY(q, CELL_RY);
    return [q[0] + CELL_ORIGIN[0], q[1] + CELL_ORIGIN[1], q[2] + CELL_ORIGIN[2]];
  });
};

const parts = [
  ['robot1/lo/axis1', 'robot1', [0, 0, 0]],   // runway: static, no axis offset
  ['robot1/lo/axis2', 'robot1', null],
  ['robot1/lo/axis3', 'robot1', null],
  ['robot1/lo/axis5', 'robot1', null],
  ['robot1/lo/axis2', 'robot2', null],
  ['robot1/lo/axis3', 'robot2', null],
  ['robot1/lo/axis5', 'robot2', null],
];

const all = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
const add = (pts, label) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) {
    lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]);
    all.min[i] = Math.min(all.min[i], p[i]); all.max[i] = Math.max(all.max[i], p[i]);
  }
  const f = (v) => v.map((x) => x.toFixed(2).padStart(7)).join(' ');
  console.log(`  ${label.padEnd(18)} min(${f(lo)})  max(${f(hi)})`);
};

console.log('placed in facility coords (x, y, z):');
for (const [p, robot, shift] of parts) add(place(bbox(p), robot, shift), p + ' [' + robot + ']');
// The bus sits in robot 1's CAD frame, offset by the three measured clearances.
add(place(bbox('bus/lo/body'), 'robot1', BUS_OFFSET), 'bus/lo/body');

const f = (v) => v.map((x) => x.toFixed(2)).join(', ');
console.log('\nCELL UNION   min(' + f(all.min) + ')  max(' + f(all.max) + ')');
console.log('BUILDING     min(' + f(BUILDING.min) + ')  max(' + f(BUILDING.max) + ')');
const names = ['x', 'y', 'z'];
let bad = false;
for (let i = 0; i < 3; i++) {
  const lo = all.min[i] - BUILDING.min[i], hi = BUILDING.max[i] - all.max[i];
  // Downward is the exception: the rail's Fischer M16x380 anchor studs are
  // meant to sit in the slab, and the axis-2 energy chain runs in a floor
  // trench. Anything below y = 0 is under an opaque floor and invisible.
  const ok = i === 1 ? hi > 0 : lo > 0 && hi > 0;
  if (!ok) bad = true;
  const note = i === 1 ? `  (below-floor ${(-all.min[1]).toFixed(2)} m: embedded anchors + chain trench, expected)` : '';
  console.log(`  ${names[i]}: margin low ${lo.toFixed(2)} m, high ${hi.toFixed(2)} m  ${ok ? 'OK' : '*** OUTSIDE ***'}${note}`);
}
const roof = LOW_ROOF_Y - all.max[1];
if (roof <= 0) bad = true;
console.log(`  roof beams at ${LOW_ROOF_Y} m: clearance ${roof.toFixed(2)} m ${roof > 0 ? 'OK' : '*** CLIPPING ***'}`);
console.log(bad ? String.fromCharCode(10) + 'RESULT: cell does NOT fit.' : String.fromCharCode(10) + 'RESULT: cell fits inside the shell.');
