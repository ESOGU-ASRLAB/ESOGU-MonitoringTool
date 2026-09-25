/*
 * How close does a robot's arm get to the bus body, in the real hierarchy?
 *
 * Shared by the station chooser (bus_entry_windows.mjs) and the gate
 * (verify_inspection_program.mjs) so the two cannot disagree. They did once:
 * the chooser measured only the CAMERA's swept axis and reported 238-352 mm of
 * clearance for the underbody pass, while the gate measured the whole arm and
 * found 5 mm. The camera is the smallest thing on the end of the arm -- the
 * telescope stage behind it is 433 mm tall, so at a column height that puts the
 * camera comfortably under the sill the stage is already through the floor pan.
 * Any question about clearance has to be asked of every moving part.
 */
import { readOtokarGeometry } from './glb_geometry.mjs';
import * as THREE from '../../client/node_modules/three/build/three.module.js';

const M = 1000;

/*
 * Body CAD frame -> cell frame. Recomputed from the same primitives
 * OtokarBusBody.js composes rather than copied as a finished number, so the two
 * cannot drift apart without this failing loudly.
 */
export const BUS_OFFSET_MM = [
  -12724.986 + 1160.4634 - -9556.0, // rail rear + measured rear offset - body rear
  2757.4 - 1643.6612 - 1251.0, // rail inner face - side clearance - half width
  -1368.0 + 1646.2384 - 172.0, // foot top + ride height - body underside
];

const CELL_MM = 200;
const MAX_RINGS = 6;

let buckets = null;
function body() {
  if (buckets) return buckets;
  const bus = readOtokarGeometry('bus', 'body', 'hi');
  const bp = bus.getAttribute('position');
  buckets = new Map();
  for (let i = 0; i < bp.count; i += 1) {
    const x = bp.getX(i) * M + BUS_OFFSET_MM[0];
    const y = bp.getY(i) * M + BUS_OFFSET_MM[1];
    const z = bp.getZ(i) * M + BUS_OFFSET_MM[2];
    const k = `${Math.floor(x / CELL_MM)},${Math.floor(y / CELL_MM)},${Math.floor(z / CELL_MM)}`;
    let b = buckets.get(k);
    if (!b) { b = []; buckets.set(k, b); }
    b.push(x, y, z);
  }
  return buckets;
}

/*
 * Distance in mm from a point to the nearest body vertex, searched one cell
 * ring at a time and stopped as soon as a further ring cannot beat what is
 * already found. Returns Infinity when nothing is within the search ceiling,
 * which is an honest "further than we looked" rather than a measured number.
 */
export function distanceToBody(x, y, z) {
  const grid = body();
  const cx = Math.floor(x / CELL_MM);
  const cy = Math.floor(y / CELL_MM);
  const cz = Math.floor(z / CELL_MM);
  let best = Infinity;
  for (let r = 0; r <= MAX_RINGS; r += 1) {
    for (let ix = cx - r; ix <= cx + r; ix += 1) {
      for (let iy = cy - r; iy <= cy + r; iy += 1) {
        for (let iz = cz - r; iz <= cz + r; iz += 1) {
          if (r > 0 && Math.max(Math.abs(ix - cx), Math.abs(iy - cy), Math.abs(iz - cz)) !== r) continue;
          const b = grid.get(`${ix},${iy},${iz}`);
          if (!b) continue;
          for (let i = 0; i < b.length; i += 3) {
            const d = Math.hypot(b[i] - x, b[i + 1] - y, b[i + 2] - z);
            if (d < best) best = d;
          }
        }
      }
    }
    if (best <= r * CELL_MM) break;
  }
  return best;
}

/*
 * Everything that swings or reaches. The column and the carriage are outboard
 * of the rail and never approach the body, so including them would only cost
 * time; every part from the middle telescope stage outward does approach it.
 */
export const MOVING_PARTS = ['axis3_middle', 'axis3_outer', 'axis4', 'axis5', 'camera'];

const box = new THREE.Box3();
const point = new THREE.Vector3();

/*
 * How many surface points to test per part. The parts carry tens to hundreds of
 * thousands of vertices and a clearance of a few hundred millimetres does not
 * need every one of them; an even stride over the buffer covers the whole part.
 */
const SAMPLES_PER_PART = 1500;
const strides = new WeakMap();

/*
 * Worst clearance over every moving part at one pose.
 *
 * Measured at points ON THE PARTS THEMSELVES, sampled evenly over each mesh's
 * vertices and transformed into the cell frame.
 *
 * This used to test the eight corners of each part's world bounding box, which
 * was badly wrong in the direction that matters. A box drawn round the wrist or
 * a telescope stage is far bigger than the part -- its corners sit in open air
 * beside the hardware -- so the metric reported collisions that were not there
 * and, worse, was steered by the box's ORIENTATION: rotating the wrist grew the
 * box without moving any metal. It reported the roof pass as blocked at every
 * station and every height, which is how the roof robot ended up parked outside
 * the vehicle instead of reaching into it.
 *
 * Vertex sampling is still a lower bound -- it measures points, not the surface
 * between them -- but the gap it misses is at most the spacing between samples
 * on a face, not the size of a bounding box.
 */
export function armClearance(scene, robotId, axes) {
  const { robots, poses, update } = scene;
  // MUTATE, never reassign: assemblyScene mounted the component with this very
  // array, so swapping the property leaves the robot reading the old one and
  // every pose silently comes back identical.
  for (let i = 0; i < axes.length; i += 1) poses[robotId][i] = axes[i];
  update();
  let worst = Infinity;
  for (const part of MOVING_PARTS) {
    const mesh = robots[robotId][part];
    if (!mesh) continue;
    const position = mesh.geometry.getAttribute('position');
    let stride = strides.get(position);
    if (stride === undefined) {
      stride = Math.max(1, Math.floor(position.count / SAMPLES_PER_PART));
      strides.set(position, stride);
    }
    for (let i = 0; i < position.count; i += stride) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const d = distanceToBody(point.x * M, point.y * M, point.z * M);
      if (d < worst) worst = d;
    }
  }
  return worst;
}

/* World bbox of one part at the current pose, in mm, for reporting. */
export function partBox(scene, robotId, part) {
  box.setFromObject(scene.robots[robotId][part], true);
  return {
    min: [box.min.x * M, box.min.y * M, box.min.z * M],
    max: [box.max.x * M, box.max.y * M, box.max.z * M],
  };
}
