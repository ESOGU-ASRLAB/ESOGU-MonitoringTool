/*
 * The folding cable chain's path, checked against the things it must not get
 * wrong.
 *
 * The fold itself lives in a vertex shader, which cannot be called from here,
 * so this reimplements the same arithmetic and checks the properties that make
 * it right. That is a copy, and a copy can drift -- so the checks are written
 * against PROPERTIES rather than against expected numbers: if the shader and
 * this disagree about the algebra, the invariants below stop holding.
 *
 *   node --test scripts/otokar/cable_chain.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANCHOR_X_MM,
  TOWED_X_AT_ZERO_MM,
  AXIS1,
  AXIS2,
  AXIS2_MIRRORED,
  foldParamsFromBox,
} from '../../client/src/components/otokarCableChain.js';

// Measured off robot1/hi/axis1_chain.glb.
const LENGTH_MM = 8533.5;
const SECTION_MM = 380.3;
const REACH_MM = Math.max(
  Math.abs(TOWED_X_AT_ZERO_MM - ANCHOR_X_MM),
  Math.abs(TOWED_X_AT_ZERO_MM + 15247 - ANCHOR_X_MM),
);
const RADIUS_MM = Math.max(((LENGTH_MM - REACH_MM) / Math.PI) * 0.9, 1);
const CENTRE_Z_MM = -787.5;
const SPACING_MM = 2 * Math.max(((8533.5 - Math.max(Math.abs(-11499 + 4376), Math.abs(-11499 + 15247 + 4376))) / Math.PI) * 0.9, 1);
const RAIL_TRAVEL_MM = 15247;

const FOLD_DIR = -1;

// The same walk the shader does, for one arc position.
function pathAt(s, carriageX) {
  const t = carriageX - ANCHOR_X_MM;
  const dir = FOLD_DIR;
  const straight = Math.max(LENGTH_MM - Math.PI * RADIUS_MM, 0);
  const a = Math.min(Math.max((straight + dir * t) / 2, 0), straight);
  const bendLen = Math.PI * RADIUS_MM;
  const xb = ANCHOR_X_MM + dir * a;
  const zLower = CENTRE_Z_MM;
  const zUpper = CENTRE_Z_MM + SPACING_MM;
  const cz = (zLower + zUpper) / 2;

  if (s <= a) return { x: ANCHOR_X_MM + dir * s, z: zLower };
  if (s <= a + bendLen) {
    const t = (s - a) / RADIUS_MM;
    return { x: xb + dir * RADIUS_MM * Math.sin(t), z: cz - RADIUS_MM * Math.cos(t) };
  }
  return { x: xb - dir * (s - a - bendLen), z: zUpper };
}

const carriageAt = (a1) => TOWED_X_AT_ZERO_MM + a1;
const STROKE = [0, 1000, 4000, 7123, 8000, 11000, RAIL_TRAVEL_MM];

test('the chain is long enough for every carriage position', () => {
  // A chain of length L spanning d spends PI*r in the bend, so it reaches only
  // d <= L - PI*r. This is the property that decides where the anchor can be,
  // and the whole model rests on it.
  const reach = LENGTH_MM - Math.PI * RADIUS_MM;
  for (const a1 of STROKE) {
    const d = Math.abs(carriageAt(a1) - ANCHOR_X_MM);
    assert.ok(d <= reach, `a1=${a1}: needs ${d.toFixed(0)} mm, chain reaches ${reach.toFixed(0)} mm`);
  }
});

test('Otokar put the anchor where the geometry requires it', () => {
  // Independent of the model: the anchor must be within reach of both ends of
  // the carriage's travel, which pins it near the travel's midpoint. The CAD's
  // own bracket agrees, and neither number came from the other.
  const midpoint = (carriageAt(0) + carriageAt(RAIL_TRAVEL_MM)) / 2;
  // 500 mm off the midpoint: the chain is only just long enough, which is why
  // the bend radius comes out as small as it does. Anywhere further and no
  // radius would work at all.
  assert.ok(Math.abs(ANCHOR_X_MM - midpoint) < 600,
    `bracket at ${ANCHOR_X_MM}, travel midpoint ${midpoint.toFixed(1)}`);
});

test('the towed end lands on the carriage at every position', () => {
  // The one thing the chain must never get wrong: its far end is bolted to the
  // carriage, so the path's end has to be exactly there.
  for (const a1 of STROKE) {
    const end = pathAt(LENGTH_MM, carriageAt(a1));
    assert.ok(Math.abs(end.x - carriageAt(a1)) < 1e-6,
      `a1=${a1}: end at ${end.x.toFixed(1)}, carriage at ${carriageAt(a1).toFixed(1)}`);
  }
});

test('the anchored end never moves', () => {
  for (const a1 of STROKE) {
    const start = pathAt(0, carriageAt(a1));
    assert.ok(Math.abs(start.x - ANCHOR_X_MM) < 1e-6, `a1=${a1}: anchor drifted to ${start.x}`);
  }
});

test('the path is continuous -- no link jumps a gap', () => {
  // Sampled finely: a break here would show on screen as the chain tearing.
  for (const a1 of STROKE) {
    const carriage = carriageAt(a1);
    let prev = pathAt(0, carriage);
    for (let s = 5; s <= LENGTH_MM; s += 5) {
      const p = pathAt(s, carriage);
      const step = Math.hypot(p.x - prev.x, p.z - prev.z);
      assert.ok(step < 8, `a1=${a1}, s=${s}: jumped ${step.toFixed(1)} mm`);
      prev = p;
    }
  }
});

test('the chain stays between its two runs', () => {
  for (const a1 of STROKE) {
    const carriage = carriageAt(a1);
    for (let s = 0; s <= LENGTH_MM; s += 10) {
      const p = pathAt(s, carriage);
      assert.ok(p.z >= CENTRE_Z_MM - 1 && p.z <= CENTRE_Z_MM + SPACING_MM + 1,
        `a1=${a1}, s=${s}: z=${p.z.toFixed(1)} outside the runs`);
    }
  }
});

test('the cable system supports very nearly the whole declared stroke', () => {
  /*
   * The chain's loop travels beyond its towed end, so the last thing to run out
   * of rail is the loop, not the carriage. This finds the travel at which the
   * loop reaches the rail's own end at X 3482, and checks it against the
   * 15 247 mm axis 1 is driven over.
   *
   * THEY DISAGREE BY 808 mm, AND THAT NUMBER IS WORTH READING TWICE.
   *
   * otokarAxes.js already carries an open question about this axis: Otokar's
   * deck declares 16 000 mm of travel, while the rail as exported physically
   * offers 753 mm less than that. The cable chain is a completely separate part
   * of the same assembly, and measuring what IT can serve gives 808 mm short.
   *
   * Two independent pieces of hardware, agreeing to within 55 mm that the
   * usable travel is about 750-800 mm less than the declared figure. That is
   * not a coincidence to explain away: it is the rail, the chain and the deck
   * all describing the same machine, with the deck the odd one out.
   *
   * This check exists to notice if that story changes. It brackets the figure
   * rather than pinning it, because the bend radius it depends on is derived
   * and will move if the chain mesh is rebuilt.
   */
  const railEndMm = 3482;
  const straight = LENGTH_MM - Math.PI * RADIUS_MM;
  const loopX = (a1) => {
    const carriage = carriageAt(a1);
    const d = Math.abs(carriage - ANCHOR_X_MM);
    const dir = Math.sign(carriage - ANCHOR_X_MM);
    return ANCHOR_X_MM + dir * ((straight + d) / 2 + RADIUS_MM);
  };
  let supported = RAIL_TRAVEL_MM;
  while (supported > 0 && loopX(supported) > railEndMm) supported -= 1;

  const shortfall = RAIL_TRAVEL_MM - supported;
  assert.ok(shortfall > 600 && shortfall < 1000,
    `cable system supports ${supported} mm of the ${RAIL_TRAVEL_MM} mm stroke `
    + `(short by ${shortfall} mm). The rail's own shortfall against the deck is `
    + `753 mm; these two should stay close.`);
});

test('the loop sits between the anchor and the far end of the chain', () => {
  /*
   * An energy chain's bend legitimately travels PAST its moving end -- the
   * loop is what the slack goes into, and it sits beyond the carriage by half
   * the unused length. An earlier version of this test asserted the opposite,
   * that nothing may lie past the carriage, and it was simply wrong about how
   * a chain works.
   *
   * What must hold is that the whole chain lies on the anchor's side of its own
   * bend: no part may be further out than the turn itself.
   */
  for (const a1 of STROKE) {
    const carriage = carriageAt(a1);
    const t = carriage - ANCHOR_X_MM;
    const dir = FOLD_DIR;
    const straight = LENGTH_MM - Math.PI * RADIUS_MM;
    const bendX = ANCHOR_X_MM + dir * ((straight + dir * t) / 2 + RADIUS_MM);
    for (let s = 0; s <= LENGTH_MM; s += 10) {
      const p = pathAt(s, carriage);
      const past = dir > 0 ? p.x - bendX : bendX - p.x;
      assert.ok(past <= 1, `a1=${a1}, s=${s}: ${past.toFixed(1)} mm beyond the bend`);
    }
  }
});

/*
 * The AXIS-2 chain, checked for the one property that decides whether it can
 * exist at all: a chain of length L reaches only L - PI*r, and this one has to
 * span the column's whole stroke from an anchor that has nowhere else to go.
 */
test('the column chain reaches over the whole of axis 2', () => {
  const COLUMN_LENGTH_MM = 1934;   // axis2_chain.glb: Z -1866 .. 68
  const COLUMN_STROKE_MM = 3350;

  const towedAt = (a2) => AXIS2.towedAtZeroMm + a2 * AXIS2.towedSign;
  const reach = Math.max(
    Math.abs(towedAt(0) - AXIS2.anchorMm),
    Math.abs(towedAt(COLUMN_STROKE_MM) - AXIS2.anchorMm),
  );
  const radius = Math.max(((COLUMN_LENGTH_MM - reach) / Math.PI) * 0.9, 1);

  assert.ok(reach < COLUMN_LENGTH_MM,
    `needs ${reach.toFixed(0)} mm, chain is ${COLUMN_LENGTH_MM} mm`);
  assert.ok(radius > 20,
    `bend radius squeezed to ${radius.toFixed(0)} mm -- the chain is too short `
    + `for a ${COLUMN_STROKE_MM} mm stroke from an anchor at ${AXIS2.anchorMm}`);

  // The anchor has to sit at the travel's midpoint; anywhere else and the chain
  // cannot reach one end or the other.
  const midpoint = (towedAt(0) + towedAt(COLUMN_STROKE_MM)) / 2;
  assert.ok(Math.abs(AXIS2.anchorMm - midpoint) < 5,
    `anchor at ${AXIS2.anchorMm}, travel midpoint ${midpoint}`);
});

test('nothing jumps as the carriage drives the length of the rail', () => {
  /*
   * THE TEST THAT WAS MISSING, and the bug it would have caught.
   *
   * The continuity check above walks ALONG the chain at one carriage position.
   * It passed while the chain was teleporting, because the tear was not along
   * the chain -- it was ACROSS TIME. The fold direction used to come from
   * sign(towed - anchor), so the instant the carriage crossed the fixed point
   * the loop flipped to the other side of it: a jump of the chain's whole
   * straight length, about 8 m, between one frame and the next.
   *
   * So this drives the carriage the length of the rail in small steps and
   * checks that no point on the chain moves further in one step than the
   * carriage itself did. That bound is the right one: nothing on a towed chain
   * can outrun the thing towing it.
   */
  const STEP_MM = 25;
  const SAMPLES = [0, 0.25, 0.5, 0.75, 1].map((f) => f * LENGTH_MM);
  let prev = SAMPLES.map((s) => pathAt(s, carriageAt(0)));

  for (let a1 = STEP_MM; a1 <= RAIL_TRAVEL_MM; a1 += STEP_MM) {
    const now = SAMPLES.map((s) => pathAt(s, carriageAt(a1)));
    for (let i = 0; i < SAMPLES.length; i += 1) {
      const moved = Math.hypot(now[i].x - prev[i].x, now[i].z - prev[i].z);
      assert.ok(moved <= STEP_MM + 1,
        `a1=${a1}, s=${SAMPLES[i].toFixed(0)}: moved ${moved.toFixed(1)} mm `
        + `while the carriage moved ${STEP_MM} mm`);
    }
    prev = now;
  }
});

test('a chain sits on its own centre line, whichever way it folds', () => {
  /*
   * The shader locates a vertex across the section with dot(position,
   * sepVector), so the centre it measures from has to be taken the same way.
   * It was not: it was read off the named axis, which is the same thing only
   * when sepVector points the positive way down that axis.
   *
   * Robot 2's column chain folds the other way -- sepVector (0,-1,0) -- and its
   * centre came out negated: an error of twice the chain's distance from the
   * origin, 7.2 m, which put the chain outside the cell entirely. Robot 1's
   * chains were unaffected, so the fault showed on one machine and not the
   * other.
   *
   * The invariant: a vertex at the chain's own centre must come out with zero
   * offset across the section, for every axis spec.
   */
  // Real bounding boxes, in metres, as the meshes report them.
  const boxes = {
    axis1: { min: { x: -11.4943, y: 3.0501, z: -0.9777 }, max: { x: -2.9608, y: 3.2661, z: -0.5974 } },
    axis2r1: { min: { x: -12.2504, y: 3.1360, z: -1.8661 }, max: { x: -12.0354, y: 3.5290, z: 0.0680 } },
    axis2r2: { min: { x: -12.2504, y: -3.8035, z: -1.8661 }, max: { x: -12.0354, y: -3.4100, z: 0.0680 } },
  };

  for (const [name, box, axis, stroke] of [
    ['axis 1', boxes.axis1, AXIS1, 15247],
    ['axis 2, robot 1', boxes.axis2r1, AXIS2, 3350],
    ['axis 2, robot 2', boxes.axis2r2, AXIS2_MIRRORED, 3350],
  ]) {
    const params = foldParamsFromBox(box, stroke, axis);
    const centre = {
      x: ((box.min.x + box.max.x) / 2) * 1000,
      y: ((box.min.y + box.max.y) / 2) * 1000,
      z: ((box.min.z + box.max.z) / 2) * 1000,
    };
    const across = centre.x * axis.sepVector.x
      + centre.y * axis.sepVector.y
      + centre.z * axis.sepVector.z;
    const offset = across - params.centreSepMm;
    assert.ok(Math.abs(offset) < 1e-6,
      `${name}: centre sits ${offset.toFixed(1)} mm off its own centre line`);
  }
});

test('the mesh maps onto the chain, end to end', () => {
  /*
   * THE OTHER TEST THAT WAS MISSING. Everything above takes the arc position
   * `s` as a given and checks the path built from it. Nothing checked how `s`
   * is got out of a vertex in the first place -- and that was where the fold
   * was broken.
   *
   * The shader had been measuring s from the ANCHOR'S POSITION IN THE CELL
   * rather than from the chain's own anchored END. Those are different numbers:
   * the axis-2 chain's mesh lies at Z -1866..68 while its anchor attaches at
   * Z 1663, so s came out 1595..3529 for a chain 1934 mm long. The far end
   * landed 595 mm above the top of the column, hanging in mid-air, which is
   * exactly how it looked on screen.
   *
   * The invariant: the mesh's two ends are the chain's two ends. One maps to
   * s = 0 and the other to s = L, and nothing in between leaves that range.
   */
  const boxes = {
    axis1: { min: { x: -11.4943, y: 3.0501, z: -0.9777 }, max: { x: -2.9608, y: 3.2661, z: -0.5974 } },
    axis2r1: { min: { x: -12.2504, y: 3.1360, z: -1.8661 }, max: { x: -12.0354, y: 3.5290, z: 0.0680 } },
    axis2r2: { min: { x: -12.2504, y: -3.8035, z: -1.8661 }, max: { x: -12.0354, y: -3.4100, z: 0.0680 } },
  };

  for (const [name, box, axis, stroke] of [
    ['axis 1', boxes.axis1, AXIS1, 15247],
    ['axis 2, robot 1', boxes.axis2r1, AXIS2, 3350],
    ['axis 2, robot 2', boxes.axis2r2, AXIS2_MIRRORED, 3350],
  ]) {
    const params = foldParamsFromBox(box, stroke, axis);
    const lo = box.min[axis.arc] * 1000;
    const hi = box.max[axis.arc] * 1000;
    const sAt = (along) => Math.abs(along - params.arcOriginMm);

    const ends = [sAt(lo), sAt(hi)].sort((a, b) => a - b);
    assert.ok(Math.abs(ends[0]) < 1e-6,
      `${name}: neither end of the mesh is the anchored end (got ${ends[0].toFixed(1)})`);
    assert.ok(Math.abs(ends[1] - params.lengthMm) < 1e-6,
      `${name}: the far end is at s=${ends[1].toFixed(1)} on a chain ${params.lengthMm.toFixed(1)} mm long`);
  }
});
