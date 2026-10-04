import React from 'react';
import * as THREE from 'three';
import { solveIK } from './robotIK';
import { SCREW_FEEDER } from './windowUsecaseLayout';

/*
 * What the two screwdriving programs share (WindowUsecaseTasks.js on the work
 * table, DoorFasteningTasks.js on the car door): the arms' joint tables, the
 * keyframe sampler, one screw's pick-and-drive cycle, the screw itself and
 * the feeder that presents it, and the Kawasaki's door sweep.
 *
 * Everything moves continuously: every cycle starts where the previous one
 * ended, a screw is carried on the bit until the bit meets the hole and then
 * turns down into it, and the feeder presents the next screw by raising it.
 * CAD frame as in windowUsecaseLayout.js: (x, y, height), Z-up.
 */
const DEG = 180 / Math.PI;
export const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export const UR_JOINTS = [
  { axis: 'z', min: -2 * Math.PI, max: 2 * Math.PI, toDeg: (r) => r * DEG },
  { axis: 'y', min: -Math.PI, max: 0.3, toDeg: (r) => r * DEG },
  { axis: 'y', min: -2.9, max: 2.9, toDeg: (r) => r * DEG },
  { axis: 'y', min: -2 * Math.PI, max: 2 * Math.PI, toDeg: (r) => r * DEG },
  { axis: 'z', min: -2 * Math.PI, max: 2 * Math.PI, toDeg: (r) => -r * DEG },
  { axis: 'y', min: -2 * Math.PI, max: 2 * Math.PI, toDeg: (r) => r * DEG },
];
const KAW_SIGNS = [-1, 1, -1, 1, -1, 1];
const KAW_JOINTS = KAW_SIGNS.map((sign, i) => ({
  axis: 'z', min: [-2.9, -1.8, -2.7, -3.1, -2.5, -3.1][i],
  max: [2.9, 2.4, 2.7, 3.1, 2.5, 3.1][i], toDeg: (r) => sign * r * DEG,
}));
export const UR_AXIS = new THREE.Vector3(1, 0, 0);
const KAW_AXIS = new THREE.Vector3(0, 0, 1);
export const DOWN = new THREE.Vector3(0, -1, 0);
export const INTO_PANEL = new THREE.Vector3(-1, 0, 0);
const INTO_DOOR = new THREE.Vector3(1, 0, 0);

/*
 * A long frame -- a hitch while the hall loads, a tab coming back -- is
 * advanced in short steps, so the arms' solvers follow their paths instead of
 * jumping to another way of reaching them (each solve starts from the last
 * pose, and a big jump in the target can land it on a different arm
 * configuration, one that then cannot reach the rest of the path). Past
 * CATCH_UP the cell simply runs late.
 */
export const SUB_STEP = 1 / 30;
export const CATCH_UP = 0.5;
export function subSteps(dt, step) {
  let remaining = Math.min(dt, CATCH_UP);
  do {
    const h = Math.min(SUB_STEP, remaining);
    step(h);
    remaining -= h;
  } while (remaining > 1e-9);
}

// `upAxis`/`up`, when given, hold the tool's roll too (see solveIK).
export function driveArm(arm, joints, target, aim, axis, upAxis = null, up = null, iterations = undefined) {
  const objects = arm.jointsRef.current;
  if (!objects || objects.length < 6 || objects.some((o) => !o) || !arm.toolRef.current) return;
  solveIK({
    joints: joints.map((j, i) => ({ ...j, object: objects[i] })), tool: arm.toolRef.current,
    localAxis: axis, target, aim, upAxis, up, ...(iterations ? { iterations } : {}),
  });
  arm.driveRef.current = joints.map((j, i) => j.toDeg(objects[i].rotation[j.axis]));
}

/*
 * Keyframes: each key's `duration` is the time to reach it from the one
 * before (the first key's is unused). Returns the leg being travelled, its
 * eased progress, and the key index it is heading for.
 */
export function sample(keys, elapsed) {
  let start = 0;
  for (let i = 1; i < keys.length; i += 1) {
    const end = start + keys[i].duration;
    if (elapsed < end) return { from: keys[i - 1], to: keys[i], u: ease((elapsed - start) / keys[i].duration), index: i };
    start = end;
  }
  return { from: keys[keys.length - 1], to: keys[keys.length - 1], u: 1, index: keys.length - 1 };
}
export const keyTimes = (keys) => keys.reduce((times, key, i) => [...times, (times[i - 1] ?? 0) + (i ? key.duration : 0)], []);
export const stepPoint = (step) => step.from.point.map((value, i) => lerp(value, step.to.point[i], step.u));
// How far the tool has turned from pointing down towards pointing into the door.
export const stepAim = (out, step) => out.copy(DOWN).lerp(INTO_PANEL, lerp(step.from.into ?? 0, step.to.into ?? 0, step.u)).normalize();

export function setOpacity(object, opacity) {
  if (!object) return;
  object.visible = opacity > 0.002;
  object.traverse((o) => { if (o.material) o.material.opacity = opacity; });
}

/* ------------------------------------------------------------- the screw */

// Head 12 mm tall; it stands this far proud of the hole when the bit meets it.
export const SCREW_HEAD = 0.012;
export const SINK = 0.012;

// A screw head with its drive slot; `spinRef` turns about its own axis (local y).
export function ScrewHead({ objectRef, spinRef, position, rotation, transparent = false, visible = false }) {
  return (
    <group ref={objectRef} position={position} rotation={rotation} visible={visible}>
      <group ref={spinRef}>
        <mesh castShadow>
          <cylinderGeometry args={[0.012, 0.012, SCREW_HEAD, 12]} />
          <meshStandardMaterial color="#b9c4cb" metalness={0.8} roughness={0.25} transparent={transparent} />
        </mesh>
        <mesh position={[0, SCREW_HEAD / 2 + 0.001, 0]}>
          <boxGeometry args={[0.016, 0.002, 0.003]} />
          <meshStandardMaterial color="#313e47" metalness={0.7} roughness={0.3} transparent={transparent} />
        </mesh>
      </group>
    </group>
  );
}

/*
 * One screw's cycle: down to the feeder, take the presented screw, up, across
 * to the hole, meet the proud screw, drive it home (the tool follows it down
 * by SINK while the bit turns), back out, back to the feeder.
 *
 * `into` 1 points the tool into the door instead of down. `travel` is each
 * crossing between feeder and hole, long enough to keep the tool near a
 * cobot's working speed. `rail` is where the arm's carriage stands while it
 * works at the hole (by default level with it), and `via` a waypoint the
 * crossings go round by, so the tool never passes close to the arm's own base
 * column -- the one place a six-axis arm cannot follow a straight line.
 * Every key carries its rail position; the working keys carry their role.
 * Returns the keys and the moments the screw changes hands.
 */
export const CARRY = 1.17;
const FEEDER_PICK = 0.9;
export const FEEDER = SCREW_FEEDER;
/*
 * The UR10e's carriage rides a rail 2.405 m long (base_link.stl) and runs from
 * 0.059 m behind to 0.191 m ahead of its rail position, so these keep it on
 * the rail; anything farther along the table the arm reaches for.
 */
export const UR_RAIL = Object.freeze({ min: 0.06, max: 2.2 });
export const onRail = (y) => Math.min(UR_RAIL.max, Math.max(UR_RAIL.min, y));

export function screwCycle({ approach, contact, seated, into = 0, travel = 1.1, rail = null, via = null }) {
  const feeder = (h) => ({ point: [FEEDER[0], FEEDER[1], h], into: 0, rail: FEEDER[1] });
  const work = (point, role) => ({ point, into, rail: onRail(rail ?? point[1]), role });
  const round = via && { point: via, into: into / 2, rail: onRail(rail ?? via[1]) };
  const keys = [
    { duration: 0, ...feeder(CARRY) },
    { duration: 0.8, ...feeder(1.02) },
    { duration: 0.7, ...feeder(FEEDER_PICK) },
    { duration: 0.4, ...feeder(FEEDER_PICK) },
    { duration: 0.6, ...feeder(CARRY) },
    ...(round ? [{ duration: travel, ...round }] : []),
    { duration: round ? 1.0 : travel, ...work(approach, 'approach') },
    { duration: 0.8, ...work(contact, 'contact') },
    { duration: 1.2, ...work(seated, 'seated') },
    { duration: 0.8, ...work(approach, 'retreat') },
    ...(round ? [{ duration: 1.0, ...round }] : []),
    { duration: travel, ...feeder(CARRY) },
  ];
  const at = keyTimes(keys);
  const reached = (role) => at[keys.findIndex((key) => key.role === role)];
  return {
    keys,
    times: { picked: at[3], lifted: at[4], contact: reached('contact'), seated: reached('seated'), cycle: at[at.length - 1] },
  };
}

// Where the arm's carriage stands on its rail at this point of the keys.
export const stepRail = (step) => lerp(step.from.rail, step.to.rail, step.u);
// The operator steadies the driver from its going in until it has backed out.
export const operatorAssists = (step) => ['contact', 'seated', 'retreat'].includes(step.to.role);

/*
 * Screw `i` at `phase` into the cycle of screw `current`: hidden until the bit
 * meets its hole, then proud and turning, then seated. Returns how far it is
 * still proud (0..SINK) and its turn, or null while it is not in the hole.
 */
export function screwInHole(i, current, phase, times) {
  const driving = times.seated - times.contact;
  if (i < current) return { proud: 0, turn: driving * 24 };
  if (i > current || phase < times.contact) return null;
  const driven = Math.min(phase, times.seated) - times.contact;
  return { proud: SINK * (1 - clamp01(driven / driving)), turn: driven * 24 };
}

/*
 * The feeder: a tray at the table's near edge presenting one screw at a time
 * at the pick point. Once the bit has taken it and lifted clear, the next one
 * rises into place.
 */
const PRESENTED = 0.888;
const RISING_FROM = 0.866;
/*
 * The operator's handle on the driver: it swings into reach as the tool goes
 * in for a screw, is held through the drive and swings away as the tool backs
 * out. Returns its opacity, 0 when it is not in use.
 */
export function handleReach(step) {
  if (step.to.role === 'contact') return step.u;
  if (step.to.role === 'seated') return 1;
  if (step.to.role === 'retreat') return 1 - step.u;
  return 0;
}

export function presentScrew(object, phase, times) {
  if (!object) return;
  if (phase == null) {
    object.visible = true;
    object.position.y = PRESENTED;
    return;
  }
  const rise = clamp01((phase - times.lifted - 0.1) / 0.6);
  object.visible = phase < times.picked || rise > 0;
  object.position.y = phase < times.picked ? PRESENTED : lerp(RISING_FROM, PRESENTED, rise);
}

export function ScrewFeeder({ presentedRef }) {
  return (
    <group>
      <mesh position={[FEEDER[0], 0.868, -FEEDER[1]]} castShadow receiveShadow>
        <boxGeometry args={[0.18, 0.026, 0.16]} />
        <meshStandardMaterial color="#263943" metalness={0.55} roughness={0.42} />
      </mesh>
      <mesh position={[FEEDER[0], 0.8815, -FEEDER[1]]}>
        <cylinderGeometry args={[0.02, 0.02, 0.002, 16]} />
        <meshStandardMaterial color="#11181c" metalness={0.4} roughness={0.6} />
      </mesh>
      <ScrewHead objectRef={presentedRef} position={[FEEDER[0], PRESENTED, -FEEDER[1]]} />
    </group>
  );
}

/* ------------------------------------------------- the Kawasaki's sweep */

// The AGV stops at each door region and sweeps the camera toward the -x
// face, which is the side nearest its rail. No tool passes through a door.
// It works along the doors and back, so between two stops it never has more
// than 0.7 m to drive, and it drives there with the arm at home.
//
// As in the dual-robot cell (DualDoorInspectionTasks.js, measured there): the
// AGV stands KAW_DOCK along the door from the camera, so the arm reaches
// across instead of pointing straight away from its own base; the camera's
// roll is held upright; and on switching on the arm first moves in joint space
// to a start pose solved from a known-good seed, so it begins -- and stays --
// on a configuration that reaches the whole sweep. Pointing straight out, the
// shoulder ran into its limit (J2 138 deg) and the arm stalled there.
const INSPECTION = [[0.48, 1.18], [0.95, 0.9], [1.65, 1.22], [2.12, 0.92], [1.65, 1.22], [0.95, 0.9]];
const KAW_DOCK = -0.3;
const KAW_UP = new THREE.Vector3(1, 0, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const KAW_SEED = [-1.9345, -0.0465, -1.1068, 1.3227, 1.097, -0.2836];
const SWEEP_APPROACH = 2.5;
const sweeps = new WeakMap();

function sweepAt(elapsed) {
  const bay = Math.floor(elapsed / 7.4) % INSPECTION.length;
  const t = elapsed % 7.4;
  const [dy, dz] = INSPECTION[bay];
  const [fromY] = INSPECTION[(bay + INSPECTION.length - 1) % INSPECTION.length];
  const keys = [
    { duration: 0, point: [-1.86, fromY, 1.05] },
    { duration: 1.4, point: [-1.86, dy, 1.05] },
    { duration: 1.5, point: [-1.69, dy, dz - 0.16] },
    { duration: 2.6, point: [-1.69, dy, dz + 0.16] },
    { duration: 1.2, point: [-1.86, dy, 1.05] },
    { duration: 0.7, point: [-1.86, dy, 1.05] },
  ];
  const step = sample(keys, t);
  const point = stepPoint(step);
  return { step, point, dy, rail: point[1] + KAW_DOCK };
}

export function sweepDoorFaces({ elapsed, kawasaki, world, root, beam, scratch }) {
  const objects = kawasaki.jointsRef.current;
  const agv = kawasaki.groupRef.current;
  if (!objects || objects.length < 6 || objects.some((o) => !o) || !kawasaki.toolRef.current || !agv) return;
  const angles = () => KAW_JOINTS.map((joint, i) => objects[i].rotation[joint.axis]);
  const setAngles = (values) => KAW_JOINTS.forEach((joint, i) => { objects[i].rotation[joint.axis] = values[i]; });
  const setRail = (rail) => {
    agv.position.z = -rail;
    agv.updateMatrixWorld(true);
  };
  if (elapsed === 0 || !sweeps.has(kawasaki)) {
    // Solve the sweep's first pose from the seed, then put the arm back where
    // it stands and move it there over the approach.
    const from = { rail: -agv.position.z, angles: angles() };
    const first = sweepAt(0);
    setRail(first.rail);
    setAngles(KAW_SEED);
    world(scratch.target, ...first.point);
    driveArm(kawasaki, KAW_JOINTS, scratch.target, INTO_DOOR, KAW_AXIS, KAW_UP, WORLD_UP, 200);
    sweeps.set(kawasaki, { from, start: angles(), rail: first.rail });
    setAngles(from.angles);
    setRail(from.rail);
  }
  const plan = sweeps.get(kawasaki);
  if (elapsed < SWEEP_APPROACH) {
    const u = ease(elapsed / SWEEP_APPROACH);
    setRail(lerp(plan.from.rail, plan.rail, u));
    setAngles(plan.from.angles.map((a, i) => lerp(a, plan.start[i], u)));
    kawasaki.driveRef.current = KAW_JOINTS.map((joint, i) => joint.toDeg(objects[i].rotation[joint.axis]));
    if (beam.current) beam.current.visible = false;
    return;
  }
  const { step, point, dy, rail } = sweepAt(elapsed - SWEEP_APPROACH);
  setRail(rail);
  world(scratch.target, ...point);
  driveArm(kawasaki, KAW_JOINTS, scratch.target, INTO_DOOR, KAW_AXIS, KAW_UP, WORLD_UP);
  if (!beam.current) return;
  beam.current.visible = step.index === 3 && Boolean(kawasaki.toolRef.current);
  if (!beam.current.visible) return;
  kawasaki.toolRef.current.getWorldPosition(scratch.from);
  world(scratch.to, -1.22, dy, point[2]);
  root.current.worldToLocal(scratch.from);
  root.current.worldToLocal(scratch.to);
  scratch.direction.subVectors(scratch.to, scratch.from);
  beam.current.position.copy(scratch.mid.addVectors(scratch.from, scratch.to).multiplyScalar(0.5));
  beam.current.scale.set(0.014, scratch.direction.length(), 0.014);
  beam.current.quaternion.setFromUnitVectors(scratch.up, scratch.direction.normalize());
}

export function InspectionBeam({ beamRef }) {
  return (
    <mesh ref={beamRef} visible={false}>
      <cylinderGeometry args={[1, 1, 1, 12, 1, true]} />
      <meshBasicMaterial color="#48d8ed" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
  );
}

export const makeScratch = () => ({
  target: new THREE.Vector3(), aim: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(),
  mid: new THREE.Vector3(), direction: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
});
