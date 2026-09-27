/*
 * The opening frame, searched again for a different brief.
 *
 * camera_framing.mjs answers "show both cells, balanced, with the underbody
 * pass visible", and it puts the eye under the vehicle to do it. The brief has
 * moved twice since: first to an elevated overview of the whole hall, and now
 * to the OPPOSITE SIDE of the cell, closer in, with the two gantry robots
 * reading clearly. Those are different constraints, so this is a different
 * search rather than more flags bolted onto the first one.
 *
 * What changes here:
 *
 *   SIDE      the camera is restricted to the -z half, the reverse of the
 *             current view, which looks from +z.
 *   HEIGHT    5 to 9 m. The overview height is kept; a low eye cannot see over
 *             the parked vehicles and was what the last brief asked for.
 *   DISTANCE  11 to 19 m, against 12 to 32 before -- closer.
 *   OBJECTIVE the smaller of the two robots' on-screen areas, not the cells'.
 *             Maximising their SUM lets one machine fill the frame while the
 *             other is a sliver; maximising the smaller one forces both to
 *             read, which is what "see the robots better" actually asks for.
 *
 * What stays, because these are properties of the hall rather than of a brief:
 * both cells fully in frame, neither gantry hidden behind the vehicle, the eye
 * inside the shell and out of the racking, and OrbitControls' own limits.
 *
 *   node scripts/otokar/camera_framing_reverse.mjs
 */
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import { measureIfarlab } from './scene_inspection.mjs';
import { warehousePoints, furnitureInShot, FURNITURE_Y } from './camera_clearance.mjs';
import { IFARLAB_OFFSET } from '../../client/src/components/cellLayout.js';


/* Swept volumes, from verify_cell_fit.mjs. See camera_framing.mjs for why the
 * two robots straddle the vehicle and why that matters. */
const OTOKAR = new THREE.Box3(
  new THREE.Vector3(-7.48, -0.13, -9.27), new THREE.Vector3(-0.08, 4.90, 6.92));
const ROBOT1 = new THREE.Box3(
  new THREE.Vector3(-7.48, -0.13, -9.27), new THREE.Vector3(-4.47, 4.90, 6.92));
const ROBOT2 = new THREE.Box3(
  new THREE.Vector3(-3.09, -0.13, -9.27), new THREE.Vector3(-0.08, 4.90, 6.92));
const BUS = new THREE.Box3(
  new THREE.Vector3(-5.18, 1.51, -8.23), new THREE.Vector3(-2.66, 4.36, 3.74));

/* The parked vehicles, so "the environment" can be counted rather than hoped
 * for. Boxes rather than meshes: position and rotation from FactoryMarkings. */
const PARKED = [
  ['pearl', -11.5, 15.2], ['steel', 10.5, 15.2], ['graphite', 10.5, -17.0],
].map(([name, x, z]) => ({
  name,
  box: new THREE.Box3(new THREE.Vector3(x - 5, 0, z - 2), new THREE.Vector3(x + 5, 3.2, z + 2)),
}));

const BUILDING = {
  min: new THREE.Vector3(-16.39, -0.16, -24.73),
  max: new THREE.Vector3(16.39, 10.17, 24.73),
};
const WALL_MARGIN = 1.0;
const FOV = 55;            // matches the camera currently in DigitalTwin.js
const ASPECT = 1.5;        // pessimistic; see camera_framing.mjs
const EDGE_MARGIN = 0.03;
const FURNITURE_RANGE_M = 4.0;
const HALF_ANGLE_DEG = (Math.atan(Math.tan((FOV * Math.PI) / 360) * ASPECT) * 180) / Math.PI;
const MIN_ROBOT_VISIBLE = 0.5;
const MAX_DISTANCE = 24;           // OrbitControls
const POLAR_LIMIT = Math.PI / 2 + 0.1;
const MIN_ANGLE_TO_RAIL_DEG = 22;  // straight down the rail foreshortens the cell
const MAX_ANGLE_TO_RAIL_DEG = 75;  // square-on flattens it and hides robot 1

function corners(box) {
  const out = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) out.push(new THREE.Vector3(x, y, z));
  return out;
}

function project(box, camera, tanHalf) {
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const c of corners(box)) {
    const v = c.clone().applyMatrix4(camera.matrixWorldInverse);
    if (v.z > -0.1) return null;
    const ndcX = v.x / -v.z / (tanHalf * ASPECT);
    const ndcY = v.y / -v.z / tanHalf;
    minX = Math.min(minX, ndcX); maxX = Math.max(maxX, ndcX);
    minY = Math.min(minY, ndcY); maxY = Math.max(maxY, ndcY);
  }
  return { minX, maxX, minY, maxY };
}
const inside = (r) => r
  && r.minX >= -1 + EDGE_MARGIN && r.maxX <= 1 - EDGE_MARGIN
  && r.minY >= -1 + EDGE_MARGIN && r.maxY <= 1 - EDGE_MARGIN;
const onScreen = (r) => r && r.maxX > -1 && r.minX < 1 && r.maxY > -1 && r.minY < 1;
const area = (r) => (r ? (r.maxX - r.minX) * (r.maxY - r.minY) : 0);

const SAMPLES = [];
for (let i = 0; i <= 2; i += 1)
  for (let j = 0; j <= 2; j += 1)
    for (let k = 0; k <= 2; k += 1) SAMPLES.push([i / 2, j / 2, k / 2]);

function segmentHitsBox(a, b, box) {
  const d = b.clone().sub(a);
  let t0 = 0; let t1 = 1;
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(d[axis]) < 1e-9) {
      if (a[axis] < box.min[axis] || a[axis] > box.max[axis]) return false;
      continue;
    }
    let lo = (box.min[axis] - a[axis]) / d[axis];
    let hi = (box.max[axis] - a[axis]) / d[axis];
    if (lo > hi) [lo, hi] = [hi, lo];
    t0 = Math.max(t0, lo); t1 = Math.min(t1, hi);
    if (t0 > t1) return false;
  }
  return true;
}
function visibleFraction(pos, box, occluder) {
  const size = box.getSize(new THREE.Vector3());
  let clear = 0;
  for (const [u, v, w] of SAMPLES) {
    const p = new THREE.Vector3(
      box.min.x + size.x * u, box.min.y + size.y * v, box.min.z + size.z * w);
    if (!segmentHitsBox(pos, p, occluder)) clear += 1;
  }
  return clear / SAMPLES.length;
}

const ifarlab = measureIfarlab().box.clone();
ifarlab.translate(new THREE.Vector3(...IFARLAB_OFFSET));
const furniture = warehousePoints().filter(
  (p) => p.y >= FURNITURE_Y[0] && p.y <= FURNITURE_Y[1]);
const centre = OTOKAR.clone().union(ifarlab).getCenter(new THREE.Vector3());
const tanHalf = Math.tan((FOV * Math.PI) / 360);
const camera = new THREE.PerspectiveCamera(FOV, ASPECT, 0.05, 150);

const results = [];
for (let deg = 0; deg < 360; deg += 1) {
  const th = (deg * Math.PI) / 180;
  const dirX = Math.sin(th);
  const dirZ = Math.cos(th);
  // THE REVERSE SIDE: the camera must sit at lower z than the subject.
  if (dirZ > -0.2) continue;
  const angleToRail = Math.abs(Math.atan2(Math.abs(dirX), Math.abs(dirZ)) * 180) / Math.PI;
  if (angleToRail < MIN_ANGLE_TO_RAIL_DEG || angleToRail > MAX_ANGLE_TO_RAIL_DEG) continue;

  for (let d = 11; d <= 19; d += 0.25) {
    const ground = new THREE.Vector3(centre.x + dirX * d, 0, centre.z + dirZ * d);
    if (ground.x < BUILDING.min.x + WALL_MARGIN || ground.x > BUILDING.max.x - WALL_MARGIN) continue;
    if (ground.z < BUILDING.min.z + WALL_MARGIN || ground.z > BUILDING.max.z - WALL_MARGIN) continue;
    if (furnitureInShot(furniture, ground, centre.x - ground.x, centre.z - ground.z,
      HALF_ANGLE_DEG, FURNITURE_RANGE_M)) continue;

    for (let eyeY = 5; eyeY <= 9.0001; eyeY += 0.2) {
      for (let ty = 1.2; ty <= 3.2; ty += 0.2) {
        const pos = new THREE.Vector3(ground.x, eyeY, ground.z);
        const target = new THREE.Vector3(centre.x, ty, centre.z);
        const dist = pos.distanceTo(target);
        if (dist > MAX_DISTANCE) continue;
        if (Math.acos((pos.y - target.y) / dist) > POLAR_LIMIT) continue;

        camera.position.copy(pos);
        camera.up.set(0, 1, 0);
        camera.lookAt(target);
        camera.updateMatrixWorld(true);
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

        const ro = project(OTOKAR, camera, tanHalf);
        const ri = project(ifarlab, camera, tanHalf);
        if (!inside(ro) || !inside(ri)) continue;

        const seenR1 = visibleFraction(pos, ROBOT1, BUS);
        const seenR2 = visibleFraction(pos, ROBOT2, BUS);
        if (Math.min(seenR1, seenR2) < MIN_ROBOT_VISIBLE) continue;

        const a1 = area(project(ROBOT1, camera, tanHalf));
        const a2 = area(project(ROBOT2, camera, tanHalf));
        // The smaller of the two: both machines have to read, not just one.
        const score = Math.min(a1, a2);
        const parked = PARKED.filter((p) => onScreen(project(p.box, camera, tanHalf)));

        results.push({
          deg, d, eyeY, ty, score, a1, a2, seenR1, seenR2,
          otokar: area(ro), ifarlab: area(ri), parked: parked.map((p) => p.name),
          pos: pos.clone(), target: target.clone(), dist, angleToRail,
        });
      }
    }
  }
}

results.sort((a, b) => b.score - a.score);
console.log(`${results.length} poses satisfy every constraint.\n`);
console.log('  az  dist  eye  tgtY   r1%   r2%  cell%  ifar%  r1vis r2vis  parked');
for (const r of results.slice(0, 10)) {
  console.log('  %s %s  %s  %s  %s %s %s %s  %s  %s  %s',
    String(r.deg).padStart(3), r.d.toFixed(2).padStart(5), r.eyeY.toFixed(1),
    r.ty.toFixed(1),
    (r.a1 / 4 * 100).toFixed(1).padStart(5), (r.a2 / 4 * 100).toFixed(1).padStart(5),
    (r.otokar / 4 * 100).toFixed(1).padStart(5), (r.ifarlab / 4 * 100).toFixed(1).padStart(5),
    (r.seenR1 * 100).toFixed(0).padStart(3) + '%', (r.seenR2 * 100).toFixed(0).padStart(3) + '%',
    r.parked.join(',') || '(none)');
}

/*
 * Best pose in each azimuth band on the reverse side.
 *
 * The top row alone is misleading here: the score rewards the two gantries and
 * says nothing about how much of the rest of the hall comes with them, so it
 * drifts to the west wall where the cell fills the frame and the workcell
 * shrinks to a smudge. The brief asked for the environment as well, so this
 * shows what each direction actually buys.
 */
console.log('\nBest pose per azimuth band (reverse side only):\n');
console.log('  band     r1%   r2%  cell%  ifar%  dist  eye  parked            position');
for (let lo = 100; lo < 270; lo += 20) {
  const band = results.filter((r) => r.deg >= lo && r.deg < lo + 20);
  if (!band.length) { console.log('  ' + lo + '-' + (lo + 20) + '   (none)'); continue; }
  const b = band[0];
  console.log('  %s-%s %s %s %s %s %s  %s  %s %s',
    String(lo).padStart(3), String(lo + 20).padStart(3),
    (b.a1 / 4 * 100).toFixed(1).padStart(5), (b.a2 / 4 * 100).toFixed(1).padStart(5),
    (b.otokar / 4 * 100).toFixed(1).padStart(5), (b.ifarlab / 4 * 100).toFixed(1).padStart(5),
    b.d.toFixed(1).padStart(5), b.eyeY.toFixed(1),
    (b.parked.join(',') || '(none)').padEnd(18),
    '[' + b.pos.toArray().map((v) => v.toFixed(2)).join(', ') + '] tgtY ' + b.ty.toFixed(1));
}

if (!results.length) process.exit(1);
const best = results[0];
console.log('\nWINNER');
console.log('  camera position [%s]', best.pos.toArray().map((v) => v.toFixed(2)).join(', '));
console.log('  orbit target    [%s]', best.target.toArray().map((v) => v.toFixed(2)).join(', '));
console.log('  distance %s of maxDistance %s', best.dist.toFixed(2), MAX_DISTANCE);
console.log('  robot 1 fills %s%% of frame, %s%% of it unoccluded by the vehicle',
  (best.a1 / 4 * 100).toFixed(1), (best.seenR1 * 100).toFixed(0));
console.log('  robot 2 fills %s%% of frame, %s%% of it unoccluded',
  (best.a2 / 4 * 100).toFixed(1), (best.seenR2 * 100).toFixed(0));
console.log('  parked vehicles on screen: %s', best.parked.join(', ') || 'none');
