import * as THREE from 'three';

/*
 * THE BUS SWAP: two parked buses trading bays, for something to watch during
 * a presentation.
 *
 *   bay A  (10.5, -11)  east of the IFARLAB cells' line
 *   bay B  (1.6, -18)   next to the Otokar cell
 * Both face the far wall (nose -z), as parked.
 *
 * Each half-cycle has two roles:
 *   LOOP     the bus in A drives out through the EAST shutter, is out of sight
 *            in the yard for a moment, comes back in through the WEST shutter,
 *            up the Otokar cell's west side, across the front of the hall and
 *            down between the two cells into bay B.
 *   SHUFFLE  while the loop bus is out, the bus in B backs out of its bay on
 *            an S -- tail north, swinging east -- to stop just north of bay A,
 *            still facing the wall, and drives straight forward into it.
 * Then the roles swap -- the bus now in A loops, the one in B shuffles -- so
 * the two keep trading places. The shutters (GarageDoors.js) follow the same
 * timeline, so a door is always up before a bus reaches it.
 *
 * Clearances, bus 8.9 x 2.4 m, checked against the footprints along the whole
 * run: out through the east door along x = 7.0 (bay B ends at x = 2.8); in at
 * x = -7.0 and up x = -9.5, between the Otokar cell (x >= -7.48) and the
 * forklift's pivot sweep (x <= -11.35); across the front at z = 19, far enough
 * north that the bus is straight before its nose passes the IFARLAB cell's
 * corner; down x = 1.45 between the Otokar cell (x <= -0.08) and the IFARLAB
 * cell (x >= 2.90). The shuffle bus is in bay A well before the loop bus
 * reaches that corridor.
 */
const v = (x, z) => new THREE.Vector3(x, 0, z);
const curve = (points) => new THREE.CatmullRomCurve3(points.map(([x, z]) => v(x, z)), false, 'centripetal');

// Bay A sits six metres farther back than it first did, and the shuffle stops
// short of where it used to, so both stay clear of the north row of cells.
export const BAY_A = [10.5, -11];
// On the axis of the corridor the loop bus comes down (x = 1.41, midway
// between the two cells), so it runs straight into the bay: the corridor
// leaves 0.2 m either side of a 2.4 m bus, too little for any sideways jog.
// Parked, its nose is 2.1 m short of the far wall (z = -24.55); at -21 it
// stood 0.9 m inside it.
export const BAY_B = [1.6, -18];

const EXIT = curve([[10.5, -11], [10.5, -14], [9.8, -17], [7.6, -20], [7.0, -23], [7.0, -24.6], [7.0, -31], [7.3, -40]]);
const ENTRY = curve([
  [-7.3, -40], [-7.0, -31], [-7.0, -24.6], [-7.2, -21], [-8.4, -17.5], [-9.3, -14], [-9.5, -10], [-9.5, 6], [-9.2, 12.5],
  [-7.2, 18.2], [-3.9, 20.4], [-0.9, 20.5], [0.9, 19.5], [1.38, 18.2], [1.41, 16.8], [1.41, 13], [1.41, -10], [1.5, -14.5], [1.6, -18],
]);
// Backing out of B on an S: the tail leads north, swings east and straightens.
// It stops at z = -5.5, its tail 1.4 m short of the inspection cell's fence
// (z = 0.36). The swing starts while the nose is still south of the Otokar
// cell's corner (-0.08, -9.27), since the nose swings west as the tail goes east.
const BACK_OUT = curve([[1.6, -18], [1.75, -15.3], [2.9, -12.8], [5.3, -10.8], [7.9, -8.9], [9.85, -7.4], [10.45, -6.4], [10.5, -5.5]]);
const PULL_IN = curve([[10.5, -5.5], [10.5, -8.0], [10.5, -11]]);

const timed = (path, speed) => ({ path, time: path.getLength() / speed });
const LEGS = {
  exit: timed(EXIT, 2.3),
  entry: timed(ENTRY, 2.8),
  backOut: timed(BACK_OUT, 1.1),
  pullIn: timed(PULL_IN, 1.5),
};

// Seconds from the start of a half-cycle.
const PARKED = 14; // both buses parked
const T_EXIT = PARKED;
const T_OUTSIDE = T_EXIT + LEGS.exit.time;
/*
 * Out in the yard (Yard.js) the bus stays in sight through the east opening,
 * parked, until that shutter is down; then it is moved to the west lane, out
 * of sight behind the closed shutter, and waits there in view once the west
 * shutter lifts. 14 s leaves both shutters shut in between (6 s travel each).
 */
const OUTSIDE = 14;
const T_ENTRY = T_OUTSIDE + OUTSIDE;
const T_BACK_OUT = T_EXIT + 5; // the shuffle starts once the loop bus is under way
const T_PULL_IN = T_BACK_OUT + LEGS.backOut.time + 2;
const HALF = T_ENTRY + LEGS.entry.time;

const DOOR_TRAVEL = 6; // s for a shutter to roll fully up or down

const ease = (u) => (1 - Math.cos(Math.PI * u)) / 2;
// Time fraction at which an eased run has covered `fraction` of its length.
const easedTimeFor = (fraction) => Math.acos(1 - 2 * fraction) / Math.PI;
// The west shutter can come down once the whole bus (8.9 m) is past it.
// 15.6 m of yard to the wall, then 12 m more until the tail is through.
const ENTRY_CLEAR = T_ENTRY + easedTimeFor(Math.min(27.6 / LEGS.entry.path.getLength(), 1)) * LEGS.entry.time;

const point = new THREE.Vector3();
const tangent = new THREE.Vector3();

// Pose on a leg at fraction u; `reverse` when the bus is backing along it.
function onLeg(leg, u, reverse = false) {
  leg.path.getPointAt(u, point);
  leg.path.getTangentAt(u, tangent);
  const sign = reverse ? -1 : 1;
  // The bus model's nose is its +x: yaw 0 faces +x, pi/2 faces -z.
  return { x: point.x, z: point.z, yaw: Math.atan2(-tangent.z * sign, tangent.x * sign), visible: true };
}

const parkedAt = ([x, z]) => ({ x, z, yaw: Math.PI / 2, visible: true });
const progress = (t, start, leg) => ease(THREE.MathUtils.clamp((t - start) / leg.time, 0, 1));

function loopPose(t) {
  if (t < T_EXIT) return parkedAt(BAY_A);
  if (t < T_OUTSIDE) return onLeg(LEGS.exit, progress(t, T_EXIT, LEGS.exit));
  if (t < T_OUTSIDE + OUTSIDE / 2) return onLeg(LEGS.exit, 1);
  if (t < T_ENTRY) return onLeg(LEGS.entry, 0);
  return onLeg(LEGS.entry, progress(t, T_ENTRY, LEGS.entry));
}

function shufflePose(t) {
  if (t < T_BACK_OUT) return parkedAt(BAY_B);
  if (t < T_PULL_IN) return onLeg(LEGS.backOut, progress(t, T_BACK_OUT, LEGS.backOut), true);
  return onLeg(LEGS.pullIn, progress(t, T_PULL_IN, LEGS.pullIn));
}

/*
 * Pose of a bus at time `time`. `startsInA` says which bay it holds at time
 * zero; it loops on even half-cycles from A and shuffles on the odd ones, and
 * the other bus does the opposite.
 */
export function busPose(startsInA, time) {
  const cycle = ((time % (HALF * 2)) + HALF * 2) % (HALF * 2);
  const secondHalf = cycle >= HALF;
  const t = secondHalf ? cycle - HALF : cycle;
  const inA = startsInA !== secondHalf;
  return inA ? loopPose(t) : shufflePose(t);
}

// 0 closed .. 1 open, rising over DOOR_TRAVEL up to `openBy` and falling from `closeFrom`.
function shutter(t, openBy, closeFrom) {
  if (t < openBy) {
    const rise = (openBy - t) / DOOR_TRAVEL;
    return rise >= 1 ? 0 : ease(1 - rise);
  }
  if (t <= closeFrom) return 1;
  const fall = (t - closeFrom) / DOOR_TRAVEL;
  return fall >= 1 ? 0 : ease(1 - fall);
}

// How far open the shutter centred at `doorX` is at time `time`. The same in
// both halves: every loop goes out east and comes back in west.
export function doorOpenness(doorX, time) {
  const t = ((time % HALF) + HALF) % HALF;
  return doorX > 0 ? shutter(t, T_EXIT, T_OUTSIDE) : shutter(t, T_ENTRY, ENTRY_CLEAR);
}
