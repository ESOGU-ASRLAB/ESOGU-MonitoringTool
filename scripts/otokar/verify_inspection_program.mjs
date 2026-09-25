/*
 * Does the inspection program actually keep the heads out of the bodywork?
 *
 * otokarMotion.js claims two things. This checks both against the REAL mounted
 * hierarchy -- the same component the page renders, mounted by assembly_scene
 * -- rather than against a second copy of the kinematics written to agree with
 * the first:
 *
 *   1. THE RAIL NEVER MOVES WHILE THE HEAD IS IN THE VEHICLE. Sampled along
 *      every leg, axis 1 must be constant on any leg where axis 3 leaves its
 *      parked value. This is the property that makes the program safe; a
 *      diagonal sweep through the pillars is what it exists to prevent.
 *   2. The head clears the body. Sampled along every leg, the distance from the
 *      head to the nearest body vertex must stay above FAIL_MM.
 *
 * Run: node scripts/otokar/verify_inspection_program.mjs
 * Exits non-zero on a violation so it can gate a build.
 */
import { OTOKAR_INSPECTION_PROGRAMS, OTOKAR_INSPECTION_SEQUENCES, createCoordinatedMove } from '../../client/src/components/otokarMotion.js';
import { OTOKAR_AXES } from '../../client/src/components/otokarAxes.js';
import { OTOKAR_ROBOT_HOME } from '../../client/src/components/otokarAxes.js';
import { assemblyScene } from './assembly_scene.mjs';
import { armClearance } from './bus_clearance.mjs';

// Below this the run fails. The clearance metric is a lower bound (see
// bus_clearance.mjs), so a pass here is a real margin.
const FAIL_MM = 150;
const SAMPLES_PER_LEG = 24;

const poses = { robot1: [0, 0, 0, 0, 0], robot2: [0, 0, 0, 0, 0] };
const built = assemblyScene(poses);
const scene = { ...built, poses };

let failures = 0;
for (const [robotId, legs] of Object.entries(OTOKAR_INSPECTION_SEQUENCES)) {
  const program = OTOKAR_INSPECTION_PROGRAMS[robotId];
  console.log(`\n=== ${robotId} (${program.zone})  ${legs.length} legs`);
  /*
   * Start where the machine actually IS when the engine is switched on: the
   * sliders' home pose, which has axis 3 fully extended at 1 800 mm.
   *
   * This used to start from the cycle's last leg, which is already parked -- so
   * the check never saw the one move that matters most, the first one. A
   * version that drove straight from the extended home pose into the first
   * TRAVEL, dragging the arm the length of the vehicle, passed this clean.
   *
   * The component answers that by withdrawing before it joins the program; the
   * entry leg below is that withdrawal, checked like any other leg.
   */
  const home = OTOKAR_ROBOT_HOME[robotId];
  const entry = {
    name: 'withdraw from home',
    axes: [home[0], home[1], 0, home[3], home[4]],
    hold: 0,
  };
  let from = home;
  for (const leg of [entry, ...legs]) {
    const move = createCoordinatedMove(from, leg.axes, OTOKAR_AXES);
    let railMin = Infinity;
    let railMax = -Infinity;
    let armMoved = false;
    let worst = Infinity;
    const out = [0, 0, 0, 0, 0];
    for (let s = 0; s <= SAMPLES_PER_LEG; s += 1) {
      const t = (move.duration * s) / SAMPLES_PER_LEG;
      const a = move.sample(t, out);
      railMin = Math.min(railMin, a[0]);
      railMax = Math.max(railMax, a[0]);
      if (Math.abs(a[2] - from[2]) > 1) armMoved = true;
      worst = Math.min(worst, armClearance(scene, robotId, a));
    }
    const railTravel = railMax - railMin;
    const bad = [];
    if (armMoved && railTravel > 1) bad.push(`RAIL MOVED ${railTravel.toFixed(0)} mm WHILE THE ARM WAS MOVING`);
    if (worst < FAIL_MM) bad.push(`CLEARANCE ${worst.toFixed(0)} mm < ${FAIL_MM} mm`);
    failures += bad.length;
    console.log(
      `  ${leg.name.padEnd(30)} ${move.duration.toFixed(1)}s+${(leg.hold || 0).toFixed(1)}s  ` +
        `rail ${railTravel.toFixed(0).padStart(6)} mm  arm3 ${from[2]}->${leg.axes[2]}  ` +
        `clearance ${worst === Infinity ? '  free' : worst.toFixed(0).padStart(6)} mm` +
        (bad.length ? `   <<< ${bad.join('; ')}` : ''),
    );
    from = leg.axes;
  }
}

console.log(failures ? `\nFAILED: ${failures} violation(s)` : '\nOK: rail is still on every leg that moves the arm, and every sample clears the body.');
process.exit(failures ? 1 : 0);
