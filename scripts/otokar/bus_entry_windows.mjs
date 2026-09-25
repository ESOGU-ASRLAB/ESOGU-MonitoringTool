/*
 * Where can a robot actually work on the bus, and at what column height?
 *
 * The body is a weldment, and the arm is not a point. This sweeps the column
 * height and the extension depth for each robot and reports, for stations
 * spread along the vehicle, the WORST clearance any moving part of the arm
 * leaves against the body. otokarMotion.js's programs are picked from this
 * output -- the stations and heights there are measured, not spaced by eye.
 *
 * The clearance metric lives in bus_clearance.mjs and is shared with
 * verify_inspection_program.mjs, deliberately: an earlier version of this
 * script measured only the camera's swept axis, reported 238-352 mm for the
 * underbody pass, and the gate then found 5 mm for the same program. The
 * camera is the smallest thing on the arm; the telescope stage behind it is
 * 433 mm tall and reaches the floor pan first.
 *
 *   node scripts/otokar/bus_entry_windows.mjs
 */
import { assemblyScene } from './assembly_scene.mjs';
import { armClearance, partBox } from './bus_clearance.mjs';

const poses = { robot1: [0, 0, 0, 0, 0], robot2: [0, 0, 0, 0, 0] };
const built = assemblyScene(poses);
const scene = { ...built, poses };

// Head X is roughly -12653 + a1, and the body runs from cell X -11564 to 290,
// so these five stations land inside the vehicle with room at both ends.
const STATIONS = [1500, 4500, 7500, 10000, 12500];
const SAMPLES = 6;

// The floor for a usable pass. It is not a threshold fitted to whatever the
// answer turned out to be -- it is the margin a demo needs to read as safe.
const SAFE_MM = 150;

function passClearance(robotId, a2, depth) {
  let worst = Infinity;
  for (const a1 of STATIONS) {
    for (let s = 0; s <= SAMPLES; s += 1) {
      const a3 = (depth * s) / SAMPLES;
      const d = armClearance(scene, robotId, [a1, a2, a3, 0, 0]);
      if (d < worst) worst = d;
    }
  }
  return worst;
}

for (const robotId of ['robot1', 'robot2']) {
  console.log(`\n########## ${robotId}`);
  for (const a2 of [200, 400, 600, 700, 800, 900, 1200, 2400, 3100, 3350]) {
    armClearance(scene, robotId, [STATIONS[0], a2, 0, 0, 0]);
    const head = partBox(scene, robotId, 'camera');
    const stage = partBox(scene, robotId, 'axis3_outer');
    const cells = [];
    for (const depth of [600, 900, 1200, 1500, 1800]) {
      const worst = passClearance(robotId, a2, depth);
      cells.push(
        `d${depth}: ${(worst === Infinity ? 'free' : worst.toFixed(0)).padStart(5)}${worst >= SAFE_MM ? ' ' : '!'}`,
      );
    }
    console.log(
      `  a2=${String(a2).padStart(4)}  headZ=${head.min[2].toFixed(0).padStart(6)}..${head.max[2].toFixed(0).padStart(5)}  ` +
        `stageZ=${stage.min[2].toFixed(0).padStart(6)}..${stage.max[2].toFixed(0).padStart(5)}  ` +
        cells.join('  '),
    );
  }
}
console.log('\n"!" marks a combination whose worst sample is under the 150 mm floor.');
console.log('The body underside sits at cell Z = 278 mm; a stage top above that is inside the floor pan.');
