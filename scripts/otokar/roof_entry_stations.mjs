/*
 * Where along the bus can the roof robot actually reach IN?
 *
 * An earlier pass concluded it could not, anywhere. That conclusion was an
 * artefact of how it was measured: bus_entry_windows.mjs scores a column
 * height by the WORST of five fixed stations, so one station landing on a
 * pillar condemned the whole height. The body is a body-in-white with pillars
 * at intervals -- of course some stations are blocked. The question is which
 * ones are not.
 *
 * So this sweeps axis 1 finely at roof height and reports every station on its
 * own, with the full-arm clearance metric. The openings between pillars show up
 * as peaks, and those are the stations the roof pass should use.
 *
 *   node scripts/otokar/roof_entry_stations.mjs
 */
import { assemblyScene } from './assembly_scene.mjs';
import { armClearance, partBox } from './bus_clearance.mjs';

const poses = { robot1: [0, 0, 0, 0, 0], robot2: [0, 0, 0, 0, 0] };
const built = assemblyScene(poses);
const scene = { ...built, poses };

const ROBOT = 'robot2';
const STEP = 125;
const SAMPLES = 8;

// Column heights worth trying for a roof pass, and how far in to reach. The
// column tops out at 3350; below about 2800 the head is at window height rather
// than at the cant rail.
const HEIGHTS = [3100, 3350];
const DEPTHS = [1000, 1200, 1400, 1600, 1800];

// What counts as usable. The underbody pass clears 308 mm at its worst, so this
// is a deliberately lower bar for a tighter pass -- but still a real gap, not a
// graze.
const SAFE_MM = 120;

function sweepClearance(a2, depth, a1) {
  let worst = Infinity;
  for (let s = 0; s <= SAMPLES; s += 1) {
    const d = armClearance(scene, ROBOT, [a1, a2, (depth * s) / SAMPLES, 0, 0]);
    if (d < worst) worst = d;
  }
  return worst;
}

for (const a2 of HEIGHTS) {
  armClearance(scene, ROBOT, [1500, a2, 0, 0, 0]);
  const head = partBox(scene, ROBOT, 'camera');
  console.log(`\n########## a2=${a2}  head Z ${head.min[2].toFixed(0)}..${head.max[2].toFixed(0)} mm`);
  for (const depth of DEPTHS) {
    const rows = [];
    for (let a1 = 1000; a1 <= 13000; a1 += STEP) {
      rows.push({ a1, clear: sweepClearance(a2, depth, a1) });
    }
    const open = rows.filter((r) => r.clear >= SAFE_MM);
    console.log(`  depth=${depth}: ${open.length}/${rows.length} stations clear ${SAFE_MM} mm`);
    // Print the openings as runs of consecutive clear stations, which is what a
    // gap between two pillars looks like.
    let run = null;
    const runs = [];
    for (const r of rows) {
      if (r.clear >= SAFE_MM) {
        if (!run) run = { from: r.a1, to: r.a1, best: r };
        else { run.to = r.a1; if (r.clear > run.best.clear) run.best = r; }
      } else if (run) { runs.push(run); run = null; }
    }
    if (run) runs.push(run);
    for (const g of runs) {
      console.log(`      opening a1 ${String(g.from).padStart(5)}..${String(g.to).padStart(5)}  ` +
        `widest at a1=${String(g.best.a1).padStart(5)} with ${g.best.clear === Infinity ? 'free' : g.best.clear.toFixed(0) + ' mm'}`);
    }
  }
}
