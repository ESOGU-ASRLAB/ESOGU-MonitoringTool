/*
 * Chooses the page's opening camera by measurement instead of by eye.
 *
 * The brief has four parts that pull against each other:
 *
 *   1. the Otokar cell is the subject and should fill as much frame as it can
 *   2. the IFARLAB robots must be visible, not a speck at the edge
 *   3. the eye must stay BELOW the bus so the underbody pass is not hidden
 *      behind the vehicle -- the body's lowest mesh point is y 1.51
 *   4. the bus must read along its length, not end-on down the rail
 *
 * So this searches camera azimuth, distance, eye height and target height,
 * keeps only poses where both cells project fully inside the frustum, and
 * among those maximises the Otokar cell's share of the screen.
 *
 * Boxes come from verify_cell_fit.mjs, which replays the real transform chain,
 * and measureIfarlab(), which mounts the actual React components.
 *
 *   node scripts/otokar/camera_framing.mjs
 */
import * as THREE from '../../client/node_modules/three/build/three.module.js';
import { measureIfarlab } from './scene_inspection.mjs';
import { warehousePoints, furnitureInShot, FURNITURE_Y } from './camera_clearance.mjs';

const IFARLAB_SHIFT_X = 6.18; // keep in sync with DigitalTwin.js

/*
 * The Otokar cell's SWEPT volume, not its home pose: the carriages travel the
 * whole rail during the programme, and a 4.9 m column can stand at any z along
 * it. The union below already spans that because the rail itself sets the z
 * extent -- printed by `node scripts/otokar/verify_cell_fit.mjs`.
 */
const OTOKAR = new THREE.Box3(
  new THREE.Vector3(-7.48, -0.13, -9.27),
  new THREE.Vector3(-0.08, 4.90, 6.92),
);

/*
 * The bus body's own box, from the same run. Its underside is y 1.51 -- the
 * lowest point of the MESH, which sits 136 mm below the placement datum the
 * body is positioned by (cell Z +278 -> world y 1.646). The mesh is what
 * occludes, so 1.51 is the figure the eye height has to clear.
 */
const BUS_UNDERSIDE_Y = 1.51;
const EYE_CLEARANCE = 0.1; // read as looking under, not grazing along

/*
 * The bus body's box, used as the OCCLUDER. The Otokar cell's own union is
 * mostly air -- a skeletal gantry and a 16 m rail -- so testing sight lines
 * against it would condemn views that in fact see straight through the frame.
 * The vehicle is the one genuinely solid thing in the cell, so it is the one
 * thing that can hide the IFARLAB robots behind it.
 */
const BUS = new THREE.Box3(
  new THREE.Vector3(-5.18, 1.51, -8.23),
  new THREE.Vector3(-2.66, 4.36, 3.74),
);
const MIN_IFARLAB_VISIBLE = 0.6; // fraction of sampled points with a clear line

/*
 * THE TWO GANTRY ROBOTS STRADDLE THE BUS, and that is the constraint this file
 * originally missed. verify_cell_fit.mjs puts robot 1's rail at world
 * x -7.48..-6.68 and robot 2's at x -0.88..-0.08 -- opposite sides of a
 * vehicle occupying x -5.18..-2.66. So a camera square to the rail, which is
 * exactly where a score balancing the two CELLS wants to go, hides one of the
 * two machines behind the bus completely.
 *
 * These are swept boxes: x from the rail out to the arm's full reach, y and z
 * the whole rail, because the carriages travel its length during the
 * programme and a 4.9 m column can stand anywhere along it.
 */
const ROBOT1 = new THREE.Box3(
  new THREE.Vector3(-7.48, -0.13, -9.27),
  new THREE.Vector3(-4.47, 4.90, 6.92),
);
const ROBOT2 = new THREE.Box3(
  new THREE.Vector3(-3.09, -0.13, -9.27),
  new THREE.Vector3(-0.08, 4.90, 6.92),
);
// Neither machine may be mostly behind the vehicle. Half is already generous:
// these are 16 m long, so losing half of one still leaves it readable.
const MIN_ROBOT_VISIBLE = 0.5;

/*
 * Damping overshoots on the first drag, so a pose sitting 0.013 rad off
 * maxPolarAngle snaps against the clamp the moment the user touches it.
 */
const POLAR_MARGIN = 0.04;

const BUILDING = {
  min: new THREE.Vector3(-16.39, -0.16, -24.73),
  max: new THREE.Vector3(16.39, 10.17, 24.73),
};
const WALL_MARGIN = 1.0; // keep the eye off the cladding

/*
 * The shell is not the only thing the camera can end up inside. The warehouse
 * asset carries racking and stacked stock down both long walls, and the first
 * pose this search produced with the balanced score put the eye 0.26 m from a
 * shelf -- with near at 0.05 m, that is a wall of cardboard filling the frame.
 * Checking it afterwards is not enough, because the search has already thrown
 * away every alternative by then. So it is a constraint.
 */
const FURNITURE_RANGE_M = 4.0;

const FOV = 45;
/*
 * Deliberately pessimistic. The canvas is ~1.8:1 on the desktop layout this
 * was screenshotted at, but on a 1366-wide laptop with the control panel open
 * it drops to ~1.45. Framing for the WIDER shape would crop the narrow one;
 * framing for a narrow one only leaves slack on wide screens.
 */
const ASPECT = 1.5;
const EDGE_MARGIN = 0.04; // fraction of half-frame kept clear on every side

// Horizontal half-angle of the frustum: atan(tan(fov/2) * aspect). Declared
// here rather than beside FURNITURE_RANGE_M because it reads FOV and ASPECT,
// and a const cannot be used above its own declaration.
const HALF_ANGLE_DEG = (Math.atan(Math.tan((FOV * Math.PI) / 360) * ASPECT) * 180) / Math.PI;

// The rail runs along z. A view straight down it foreshortens the 12 m bus to
// nothing, so refuse anything closer than this to the axis.
const MIN_ANGLE_TO_RAIL_DEG = 22;

/*
 * And the other end of the same argument. Square to the rail wins the raw
 * score -- it is the shortest way to get both cells large -- but it costs
 * twice: the shot flattens into an elevation with no depth along the 16 m of
 * travel, and robot 1, which sits on the far side of the bus, drops to 67%
 * visible where a three-quarter view keeps it above 80%. Banding the search by
 * angle showed what the cap actually costs: the best pose at 60-70 deg gives
 * up IFARLAB screen area (19.4% against 32.1%) and gains robot 1 back.
 */
const MAX_ANGLE_TO_RAIL_DEG = 75;

// IFARLAB has to be worth including: its projected height must be at least
// this fraction of the frame, or it is a smudge and the shot is really just
// the Otokar cell with clutter.
const MIN_IFARLAB_SCREEN_HEIGHT = 0.10;

function corners(box) {
  const out = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) out.push(new THREE.Vector3(x, y, z));
  return out;
}

/*
 * Projects a box to normalised device coordinates. Returns null when any
 * corner is behind the eye -- a partially-behind box has no meaningful
 * on-screen extent and should simply be rejected.
 */
function project(box, camera) {
  const tanHalf = Math.tan((FOV * Math.PI) / 360);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
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

/*
 * What fraction of the IFARLAB cell the camera can actually see, by sampling
 * points across its box and asking whether the bus stands in the way. A cheap
 * segment-vs-AABB slab test: the sight line is clear when it never enters the
 * bus box between the eye and the point.
 */
const IFARLAB_SAMPLES = [];
for (let i = 0; i <= 2; i += 1)
  for (let j = 0; j <= 2; j += 1)
    for (let k = 0; k <= 2; k += 1) IFARLAB_SAMPLES.push([i / 2, j / 2, k / 2]);

function segmentHitsBox(a, b, box) {
  const d = b.clone().sub(a);
  let t0 = 0;
  let t1 = 1;
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(d[axis]) < 1e-9) {
      if (a[axis] < box.min[axis] || a[axis] > box.max[axis]) return false;
      continue;
    }
    let lo = (box.min[axis] - a[axis]) / d[axis];
    let hi = (box.max[axis] - a[axis]) / d[axis];
    if (lo > hi) [lo, hi] = [hi, lo];
    t0 = Math.max(t0, lo);
    t1 = Math.min(t1, hi);
    if (t0 > t1) return false;
  }
  return true;
}

function visibleFraction(pos, box, occluder) {
  const size = box.getSize(new THREE.Vector3());
  let clear = 0;
  for (const [u, v, w] of IFARLAB_SAMPLES) {
    const p = new THREE.Vector3(
      box.min.x + size.x * u,
      box.min.y + size.y * v,
      box.min.z + size.z * w,
    );
    if (!segmentHitsBox(pos, p, occluder)) clear += 1;
  }
  return clear / IFARLAB_SAMPLES.length;
}

const inside = (r) =>
  r && r.minX >= -1 + EDGE_MARGIN && r.maxX <= 1 - EDGE_MARGIN
    && r.minY >= -1 + EDGE_MARGIN && r.maxY <= 1 - EDGE_MARGIN;

/*
 * Pre-filtered once: only vertices between the floor and the roof can be
 * walked into, and dropping the rest here keeps the per-ring sweep over this
 * array from re-testing the building's own slab and trusses every time.
 */
const furniture = warehousePoints().filter(
  (p) => p.y >= FURNITURE_Y[0] && p.y <= FURNITURE_Y[1]);
const ifarlab = measureIfarlab().box.clone();
ifarlab.translate(new THREE.Vector3(IFARLAB_SHIFT_X, 0, 0));

const union = OTOKAR.clone().union(ifarlab);
const centre = union.getCenter(new THREE.Vector3());
console.log('OTOKAR  ', OTOKAR.min.toArray().map((v) => v.toFixed(2)).join(' '),
  '->', OTOKAR.max.toArray().map((v) => v.toFixed(2)).join(' '));
console.log('IFARLAB ', ifarlab.min.toArray().map((v) => v.toFixed(2)).join(' '),
  '->', ifarlab.max.toArray().map((v) => v.toFixed(2)).join(' '));
console.log('union centre', centre.toArray().map((v) => v.toFixed(2)).join(' '));

const camera = new THREE.PerspectiveCamera(FOV, ASPECT, 0.05, 220);
const results = [];

for (let deg = 0; deg < 360; deg += 1) {
  const th = (deg * Math.PI) / 180;
  const dirX = Math.sin(th);
  const dirZ = Math.cos(th);
  // Angle between the view direction and the rail (the z axis).
  const angleToRail = Math.abs(Math.atan2(Math.abs(dirX), Math.abs(dirZ)) * 180 / Math.PI);
  if (angleToRail < MIN_ANGLE_TO_RAIL_DEG || angleToRail > MAX_ANGLE_TO_RAIL_DEG) continue;

  for (let d = 12; d <= 32; d += 0.25) {
    /*
     * The eye's ground position, the walls and what stands in front of it all
     * depend on (azimuth, distance) alone, so they are settled once per ring
     * rather than once per candidate. The furniture sweep in particular walks
     * every warehouse vertex; leaving it in the innermost loop made the search
     * run for minutes instead of seconds.
     */
    const ground = new THREE.Vector3(centre.x + dirX * d, 0, centre.z + dirZ * d);
    if (ground.x < BUILDING.min.x + WALL_MARGIN || ground.x > BUILDING.max.x - WALL_MARGIN) continue;
    if (ground.z < BUILDING.min.z + WALL_MARGIN || ground.z > BUILDING.max.z - WALL_MARGIN) continue;
    if (furnitureInShot(furniture, ground, centre.x - ground.x, centre.z - ground.z,
      HALF_ANGLE_DEG, FURNITURE_RANGE_M)) continue;

    for (let eyeY = 0.9; eyeY <= BUS_UNDERSIDE_Y - EYE_CLEARANCE + 1e-9; eyeY += 0.05) {
      for (let ty = 1.4; ty <= 3.2; ty += 0.2) {
        const pos = new THREE.Vector3(ground.x, eyeY, ground.z);
        const target = new THREE.Vector3(centre.x, ty, centre.z);
        camera.position.copy(pos);
        camera.up.set(0, 1, 0);
        camera.lookAt(target);
        camera.updateMatrixWorld(true);
        camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

        const ro = project(OTOKAR, camera);
        const ri = project(ifarlab, camera);
        if (!inside(ro) || !inside(ri)) continue;
        if ((ri.maxY - ri.minY) / 2 < MIN_IFARLAB_SCREEN_HEIGHT) continue;

        const polar = Math.acos((pos.y - target.y) / pos.distanceTo(target));
        if (polar > Math.PI / 2 + 0.1 - POLAR_MARGIN) continue;

        const seen = visibleFraction(pos, ifarlab, BUS);
        if (seen < MIN_IFARLAB_VISIBLE) continue;
        const seenR1 = visibleFraction(pos, ROBOT1, BUS);
        const seenR2 = visibleFraction(pos, ROBOT2, BUS);
        if (Math.min(seenR1, seenR2) < MIN_ROBOT_VISIBLE) continue;

        const areaO = (ro.maxX - ro.minX) * (ro.maxY - ro.minY);
        const areaI = (ri.maxX - ri.minX) * (ri.maxY - ri.minY);
        /*
         * BALANCED, not "Otokar as large as possible".
         *
         * The first version of this scored the Otokar cell's area alone and
         * treated IFARLAB as a box that merely had to be somewhere on screen.
         * That is what produced a framing with the workcell at 3.4% of the
         * frame -- present, but not a shot OF it.
         *
         * The geometric mean is the right shape of score for "show both well":
         * unlike a sum it cannot be won by making one term huge, because
         * halving either factor costs the same. It pulls the camera round to
         * the side the workcell is on, so the small cell comes forward and the
         * 16 m one fills the background rather than the other way about.
         */
        const area = Math.sqrt(areaO * areaI);
        results.push({ deg, d, eyeY, ty, area, areaO, areaI, seen, seenR1, seenR2, polar, pos: pos.clone(), target: target.clone(), ro, ri, angleToRail });
      }
    }
  }
}

results.sort((a, b) => b.area - a.area);
console.log(`\n${results.length} poses satisfy every constraint. Top 12 by how much`);
console.log('frame the Otokar cell fills:\n');
console.log('  az   dist  eye   tgtY  otokar%  ifarlab%  railAng  ifar  r1   r2   position');
for (const r of results.slice(0, 12)) {
  console.log('  %s  %s  %s  %s   %s     %s      %s   %s %s %s  [%s]',
    String(r.deg).padStart(3),
    r.d.toFixed(2).padStart(5),
    r.eyeY.toFixed(2),
    r.ty.toFixed(1),
    (r.areaO / 4 * 100).toFixed(1).padStart(5),
    (r.areaI / 4 * 100).toFixed(1).padStart(5),
    r.angleToRail.toFixed(0).padStart(3),
    (r.seen * 100).toFixed(0).padStart(3) + '%',
    (r.seenR1 * 100).toFixed(0).padStart(3) + '%',
    (r.seenR2 * 100).toFixed(0).padStart(3) + '%',
    r.pos.toArray().map((v) => v.toFixed(2)).join(', '));
}

/*
 * How much the balanced score actually costs as the view swings away from
 * square-on to the rail. A camera square to the rail wins on raw area but
 * flattens the shot into an elevation and puts a third of robot 1 behind the
 * bus, so it is worth seeing what a three-quarter view gives up before taking
 * the top row on trust.
 */
console.log('\nBest pose in each band of angle-to-rail:\n');
console.log('  band     score   otokar%  ifarlab%  r1vis  dist   position');
for (let lo = 20; lo < 90; lo += 10) {
  const band = results.filter((r) => r.angleToRail >= lo && r.angleToRail < lo + 10);
  if (!band.length) { console.log(`  ${lo}-${lo + 10}    (none)`); continue; }
  const b = band[0];
  console.log(`  ${String(lo).padStart(2)}-${lo + 10}  ${(b.area / 4 * 100).toFixed(1).padStart(6)}`
    + `  ${(b.areaO / 4 * 100).toFixed(1).padStart(6)}   ${(b.areaI / 4 * 100).toFixed(1).padStart(6)}`
    + `    ${(b.seenR1 * 100).toFixed(0).padStart(3)}%  ${b.d.toFixed(2)}`
    + `  [${b.pos.toArray().map((v) => v.toFixed(2)).join(', ')}] tgtY ${b.ty.toFixed(1)}`);
}

if (!results.length) process.exit(1);

/*
 * OrbitControls limits the winner has to live inside, and the underbody test
 * that motivated the eye height in the first place.
 */
const best = results[0];
const dist = best.pos.distanceTo(best.target);
const polar = Math.acos((best.pos.y - best.target.y) / dist);
console.log('\nWINNER');
console.log('  camera position [%s]', best.pos.toArray().map((v) => v.toFixed(2)).join(', '));
console.log('  orbit target    [%s]', best.target.toArray().map((v) => v.toFixed(2)).join(', '));
console.log('  distance        %s   (OrbitControls maxDistance must be >= this)', dist.toFixed(2));
console.log('  polar angle     %s  (limit pi/2 + 0.1 = %s) %s',
  polar.toFixed(4), (Math.PI / 2 + 0.1).toFixed(4),
  polar <= Math.PI / 2 + 0.1 ? 'OK' : 'EXCEEDS -- raise maxPolarAngle');
console.log('  eye is %s m below the bus underside (y %s) -> underbody visible',
  (BUS_UNDERSIDE_Y - best.pos.y).toFixed(2), BUS_UNDERSIDE_Y.toFixed(2));
