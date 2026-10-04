import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  CARRY, FEEDER, InspectionBeam, ScrewFeeder, ScrewHead, SINK, UR_AXIS, UR_JOINTS,
  driveArm, subSteps, keyTimes, lerp, makeScratch, presentScrew, sample, screwCycle, screwInHole, setOpacity, stepAim, stepRail,
  stepPoint, sweepDoorFaces,
} from './fasteningShared';

/*
 * CAD frame as in windowUsecaseLayout.js. The fitting is mounted on the
 * UR-facing (+x) side of the windowless car door; at this lower panel the STL
 * skin is near x = -0.86 m. It is a plate standing on its edge, thin in x.
 */
const MOUNT = [-0.825, 0.85, 0.70];
const FITTING = { t: 0.07, h: 0.26, w: 0.31 };
// The narrow raised pad fits between the screwdriver's two clamp fingers.
// With the fitting flat on the belt the pad faces up; on the door it faces
// out into the cell. The bit meets the pad, so its attachment point stays
// fixed as the wrist turns the fitting through 90 degrees.
const GRIP_PAD = { t: 0.02, h: 0.09, w: 0.235 };
const GRIP_DEPTH = FITTING.t / 2 + GRIP_PAD.t;
const FACE = MOUNT[0] + FITTING.t / 2;
const GRIP_FACE = FACE + GRIP_PAD.t;
// Seated screw-head centres [x, y, height], on the four bosses of its face.
const SCREWS = [
  [-0.78, 0.73, 0.60], [-0.78, 0.97, 0.60],
  [-0.78, 0.73, 0.80], [-0.78, 0.97, 0.80],
];
const BELT_TOP = 0.845;
const FADE_OUT = 1.2;
const PICK = [0.742, 0.25];
// The fitting lies flat on the belt, with the raised grip pad on top.
const PICK_TOP = BELT_TOP + FITTING.t + GRIP_PAD.t;
const AWAY = 0.2;
const TIP = (head) => head + 0.006;
/*
 * The door is only 0.71 m from the UR10e's rail, too close for the arm to
 * point the tool straight into it from opposite the work: it would have to
 * fold back on itself, and measured it fell 0.2-0.3 m short. So while the
 * tool works on the door the rail stands DOCK along from the point and the arm
 * reaches across to it, the tool still square to the door. Measured over a
 * whole cycle: 0.3 m reaches every point; 0.6 m, or the other side, misses.
 *
 * Going between the feeder or conveyor (on the arm's +x side) and the door
 * (on its -x side) the tool swings round in front of the carriage, by `round`
 * (0.1 m across and 0.6 m ahead of the base column): a straight line would
 * pass within 0.2 m of the column, where the arm cannot follow it and, after
 * lagging, snaps to another pose.
 */
const DOCK = 0.3;
const BASE_X = -0.147;
const round = (rail, height) => [BASE_X + 0.1, rail - 0.6, height];

/*
 * Between two fittings, from the feeder (where the last screw left the arm)
 * back to the feeder (where the first screw starts): the next fitting off the
 * belt, where the operator laid it, turned from face-up to upright on the
 * door, and pressed onto it. `into` is how far the tool has turned to point
 * into the door. Meanwhile the finished fitting fades from the door as a new
 * cycle begins.
 */
const MOUNT_RAIL = MOUNT[1] + DOCK;
const TRANSFER = [
  { duration: 0, rail: FEEDER[1], point: [FEEDER[0], FEEDER[1], CARRY], into: 0 },
  { duration: 3.0, rail: PICK[1], point: [PICK[0], PICK[1], 1.25], into: 0 },
  { duration: 0.8, rail: PICK[1], point: [PICK[0], PICK[1], PICK_TOP], into: 0 },
  { duration: 0.4, rail: PICK[1], point: [PICK[0], PICK[1], PICK_TOP], into: 0 },
  { duration: 0.8, rail: PICK[1], point: [PICK[0], PICK[1], 1.3], into: 0 },
  { duration: 1.6, rail: MOUNT_RAIL, point: round(MOUNT_RAIL, 1.15), into: 0.3 },
  { duration: 1.2, rail: MOUNT_RAIL, point: [GRIP_FACE + AWAY, MOUNT[1], MOUNT[2]], into: 1 },
  { duration: 0.8, rail: MOUNT_RAIL, point: [GRIP_FACE, MOUNT[1], MOUNT[2]], into: 1 },
  { duration: 0.4, rail: MOUNT_RAIL, point: [GRIP_FACE, MOUNT[1], MOUNT[2]], into: 1 },
  { duration: 0.5, rail: MOUNT_RAIL, point: [GRIP_FACE + AWAY, MOUNT[1], MOUNT[2]], into: 1 },
  { duration: 1.2, rail: MOUNT_RAIL, point: round(MOUNT_RAIL, 1.15), into: 0.3 },
  { duration: 1.8, rail: FEEDER[1], point: [FEEDER[0], FEEDER[1], CARRY], into: 0 },
];
const TRANSFER_AT = keyTimes(TRANSFER);
const TRANSFER_TIME = TRANSFER_AT[TRANSFER.length - 1];
// Key indices: fitting gripped on the belt, let go on the door.
const GRIP = 3;
const RELEASE = 8;
const MOUNTED_AT = TRANSFER_AT[RELEASE];

const SCREW_PLANS = SCREWS.map(([sx, sy, sh]) => screwCycle({
  approach: [sx + 0.18, sy, sh], contact: [TIP(sx + SINK), sy, sh], seated: [TIP(sx), sy, sh],
  into: 1, travel: 1.8, rail: sy + DOCK, via: round(sy + DOCK, 1.0),
}));
const { times: SCREW_TIMES } = SCREW_PLANS[0];
const FASTENING_CYCLE = SCREW_TIMES.cycle * SCREWS.length;
// Relative to the mounted fitting's centre; a head faces +x, out of the door.
const screwLocal = ([sx, sy, sh]) => [sx - MOUNT[0], sh - MOUNT[2], MOUNT[1] - sy];
const HEAD_OUT = [0, 0, -Math.PI / 2];

/*
 * THE OPERATOR. Beside a cobot the person does the part of the job a person
 * still does best: kitting. Through each fastening run she fetches the next
 * fitting from the tote on the work table, carries it round the east side of
 * the conveyor and lays it at the robot's pick point -- flat, grip pad up, as
 * the gripper takes it -- then goes back to watch the cell. The robot takes
 * it from there on its next cycle, so a part goes from her hands to the belt
 * to the door without ever appearing from nowhere.
 *
 * Floor positions in the cell's CAD frame. Her route keeps east of the belt
 * (frame to x 0.921) and the table (to x 1.056) and inside the east guarding
 * (x 1.7), so the arm -- which works on the door, the feeder and the pick
 * point, all to the west -- never comes near her.
 */
const TABLE_TOP = 0.855;
const TOTE = { x: 0.88, y: 2.45, w: 0.3, d: 0.4, h: 0.147, wall: 0.012 };
const PLATE = FITTING.t + GRIP_PAD.t; // one fitting lying flat, pad up
const STACK = 3;
const TOP_PLATE = [TOTE.x, TOTE.y, TABLE_TOP + TOTE.wall + (STACK - 1) * PLATE + FITTING.t / 2];
const BELT_PLATE = [PICK[0], PICK[1], BELT_TOP + FITTING.t / 2];
const SPOTS = { watch: [1.4, 1.05], tote: [1.34, 2.45], belt: [1.18, 0.25] };
const WATCHING = [MOUNT[0], MOUNT[1]];
// Each hand just outside the fitting's long edges, fingers round them.
const GRIP_W = FITTING.w / 2 + 0.025;
const HANDS_DOWN_W = 0.21;
// Her hands, in her own frame (facing +z): hanging, and carrying a part.
const HANDS_REST = [0, 0.83, 0.05];
const HANDS_CARRY = [0, 0.98, 0.34];
const WALK_SPEED = 0.65; // m/s
const TURN_RATE = 3.5; // rad/s
const pathLength = (points) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
// One round, in seconds from the start of the fastening run.
const ROUND = (() => {
  const steps = [
    { kind: 'watch', duration: 6 },
    { kind: 'walk', path: [SPOTS.watch, SPOTS.tote] },
    { kind: 'settle', duration: 0.5, at: 'tote' },
    { kind: 'reach', duration: 0.9, at: 'tote' },
    { kind: 'grasp', duration: 0.3, at: 'tote' },
    { kind: 'lift', duration: 0.8, at: 'tote' },
    { kind: 'walk', path: [SPOTS.tote, SPOTS.watch, SPOTS.belt], carrying: true },
    { kind: 'settle', duration: 0.5, at: 'belt', carrying: true },
    { kind: 'lower', duration: 1.2, at: 'belt' },
    { kind: 'release', duration: 0.3, at: 'belt' },
    { kind: 'withdraw', duration: 0.8, at: 'belt' },
    { kind: 'walk', path: [SPOTS.belt, SPOTS.watch] },
  ];
  let start = 0;
  return steps.map((step) => {
    const length = step.path ? pathLength(step.path) : 0;
    const duration = step.path ? length / WALK_SPEED : step.duration;
    const placed = { ...step, start, duration, length };
    start += duration;
    return placed;
  });
})();
const roundStep = (kind) => ROUND.find((step) => step.kind === kind);
const TAKEN_AT = roundStep('grasp').start;
const LAID_AT = roundStep('release').start;
const ease = (u) => u * u * (3 - 2 * u);
const clamp01 = (u) => Math.min(1, Math.max(0, u));
// Facing from one CAD floor point to another, as the worker's yaw (world).
const yawTowards = (from, to) => Math.atan2(to[0] - from[0], -(to[1] - from[1]));
const turnTowards = (yaw, target, step) => {
  const diff = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw));
  return yaw + Math.max(-step, Math.min(step, diff));
};

function FittingBody() {
  return (
    <>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[FITTING.t, FITTING.h, FITTING.w]} />
        <meshStandardMaterial color="#adb8bf" metalness={0.68} roughness={0.33} transparent />
      </mesh>
      <mesh position={[FITTING.t / 2 + GRIP_PAD.t / 2, 0, 0]} castShadow>
        <boxGeometry args={[GRIP_PAD.t, GRIP_PAD.h, GRIP_PAD.w]} />
        <meshStandardMaterial color="#344650" metalness={0.48} roughness={0.38} transparent />
      </mesh>
      {[-0.1, 0.1].flatMap((height) => [-0.12, 0.12].map((side) => (
        <group key={`${height}:${side}`}>
          <mesh position={[0.038, height, side]} rotation={HEAD_OUT}>
            <cylinderGeometry args={[0.023, 0.023, 0.006, 16]} />
            <meshStandardMaterial color="#435762" metalness={0.64} roughness={0.34} transparent />
          </mesh>
          <mesh position={[0.042, height, side]} rotation={HEAD_OUT}>
            <cylinderGeometry args={[0.009, 0.009, 0.001, 12]} />
            <meshStandardMaterial color="#1d2d35" metalness={0.15} roughness={0.7} transparent />
          </mesh>
        </group>
      )))}
    </>
  );
}

// A flat fitting, pad up, as it lies on the belt and in the tote.
const LYING = [0, 0, Math.PI / 2];

// The parts tote on the work table, with the fittings stacked in it.
function Tote({ topRef }) {
  const { w, d, h, wall } = TOTE;
  const sides = [
    [0, (d - wall) / 2, w, wall], [0, -(d - wall) / 2, w, wall],
    [(w - wall) / 2, 0, wall, d], [-(w - wall) / 2, 0, wall, d],
  ];
  return (
    <group position={[TOTE.x, TABLE_TOP, -TOTE.y]}>
      <mesh position={[0, wall / 2, 0]} receiveShadow>
        <boxGeometry args={[w, wall, d]} />
        <meshStandardMaterial color="#2f5f8f" metalness={0} roughness={0.62} />
      </mesh>
      {sides.map(([x, z, sw, sd]) => (
        <mesh key={`${x}:${z}`} position={[x, h / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[sw, h, sd]} />
          <meshStandardMaterial color="#2f5f8f" metalness={0} roughness={0.62} />
        </mesh>
      ))}
      {Array.from({ length: STACK }, (_, k) => (
        <group
          key={k}
          ref={k === STACK - 1 ? topRef : undefined}
          position={[0, wall + k * PLATE + FITTING.t / 2, 0]}
          rotation={LYING}
        >
          <FittingBody />
        </group>
      ))}
    </group>
  );
}

// The door-fastening cell: the operator lays a fitting on the conveyor, the
// UR10e takes it, mounts it on the car door and drives four screws into it.
// The Kawasaki checks the opposite face once the fitting is seated.
export default function DoorFasteningTasks({ active, ur, kawasaki, spinRef, screwLoadedRef, productHeldRef, assistantActiveRef, operatorRef }) {
  const root = useRef(null);
  const beam = useRef(null);
  const carried = useRef(null);
  const mounted = useRef(null);
  const inHands = useRef(null);
  const toteTop = useRef(null);
  const presented = useRef(null);
  const screwRefs = useRef([]);
  const spinRefs = useRef([]);
  const run = useRef({ last: null, urElapsed: 0, kawasakiElapsed: 0, kawasakiInspecting: false, wasActive: false, yaw: null });
  const scratch = useMemo(makeScratch, []);
  const operator = useMemo(() => ({
    pose: { x: 0, z: 0, yaw: 0, walking: false, traveled: 0, remaining: 0, speed: WALK_SPEED, hands: null, grip: HANDS_DOWN_W, lean: 0, crouch: 0 },
    hands: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), feet: new THREE.Vector3(),
  }), []);

  const world = (out, x, y, height) => root.current.localToWorld(out.set(x, height, -y));
  const seatScrews = (show) => screwRefs.current.forEach((screw, i) => {
    if (!screw) return;
    screw.visible = show;
    screw.position.x = screwLocal(SCREWS[i])[0];
  });
  const idleTool = () => {
    spinRef.current = false;
    screwLoadedRef.current = false;
    productHeldRef.current = false;
    if (assistantActiveRef) assistantActiveRef.current = false;
  };
  const layOnBelt = (object) => {
    object?.position.set(BELT_PLATE[0], BELT_PLATE[2], -BELT_PLATE[1]);
    object?.rotation.set(...LYING);
  };

  /*
   * Where the operator is and what she does at `f` seconds into the fastening
   * run (her round), or standing watch outside it. Writes her pose for
   * Worker.js and returns where the fitting she handles is: 'tote', 'hands'
   * or 'belt'.
   */
  const poseOperator = (f, h) => {
    const { pose, hands, a, b, feet } = operator;
    const state = run.current;
    const step = f == null ? null : ROUND.find((s) => f >= s.start && f < s.start + s.duration);
    const u = step ? clamp01((f - step.start) / step.duration) : 0;
    // Her hands in the world, from a point in her own frame.
    const local = (out, [lx, ly, lz]) => out.set(lx, ly, lz).applyAxisAngle(scratch.up, pose.yaw).add(feet);

    // Position and the way she wants to face.
    let spot = SPOTS.watch;
    let facing = yawTowards(SPOTS.watch, WATCHING);
    pose.walking = false;
    if (step?.kind === 'walk') {
      const along = step.length * ease(u);
      let left = along;
      let i = 1;
      while (i < step.path.length - 1 && left > Math.hypot(step.path[i][0] - step.path[i - 1][0], step.path[i][1] - step.path[i - 1][1])) {
        left -= Math.hypot(step.path[i][0] - step.path[i - 1][0], step.path[i][1] - step.path[i - 1][1]);
        i += 1;
      }
      const from = step.path[i - 1];
      const to = step.path[i];
      const leg = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
      spot = [from[0] + ((to[0] - from[0]) * left) / leg, from[1] + ((to[1] - from[1]) * left) / leg];
      facing = yawTowards(from, to);
      pose.walking = true;
      pose.traveled = along;
      pose.remaining = step.length - along;
      pose.speed = step.length / step.duration;
    } else if (step?.at === 'tote') {
      spot = SPOTS.tote;
      facing = yawTowards(SPOTS.tote, [TOP_PLATE[0], TOP_PLATE[1]]);
    } else if (step?.at === 'belt') {
      spot = SPOTS.belt;
      facing = yawTowards(SPOTS.belt, [BELT_PLATE[0], BELT_PLATE[1]]);
    }
    state.yaw = state.yaw == null ? facing : turnTowards(state.yaw, facing, TURN_RATE * h);
    world(feet, spot[0], spot[1], 0);
    pose.x = feet.x;
    pose.z = feet.z;
    pose.yaw = state.yaw;

    // Hands, and bending to reach.
    pose.hands = null;
    pose.grip = HANDS_DOWN_W;
    pose.lean = 0;
    pose.crouch = 0;
    const carrying = step && (step.carrying || ['grasp', 'lift', 'lower'].includes(step.kind));
    const toward = (from, to, v) => hands.lerpVectors(from, to, ease(v));
    if (step?.kind === 'reach') {
      local(a, HANDS_REST);
      world(b, ...TOP_PLATE);
      pose.hands = toward(a, b, u);
      pose.grip = lerp(HANDS_DOWN_W, GRIP_W, ease(u));
      pose.lean = 0.28 * ease(u);
      pose.crouch = 0.03 * ease(u);
    } else if (step?.kind === 'grasp') {
      pose.hands = world(hands, ...TOP_PLATE);
      pose.grip = GRIP_W;
      pose.lean = 0.28;
      pose.crouch = 0.03;
    } else if (step?.kind === 'lift') {
      world(a, ...TOP_PLATE);
      local(b, HANDS_CARRY);
      pose.hands = toward(a, b, u);
      pose.grip = GRIP_W;
      pose.lean = 0.28 * (1 - ease(u));
      pose.crouch = 0.03 * (1 - ease(u));
    } else if (step?.carrying) {
      pose.hands = local(hands, HANDS_CARRY);
      pose.grip = GRIP_W;
    } else if (step?.kind === 'lower') {
      local(a, HANDS_CARRY);
      world(b, ...BELT_PLATE);
      pose.hands = toward(a, b, u);
      pose.grip = GRIP_W;
      pose.lean = 0.36 * ease(u);
      pose.crouch = 0.07 * ease(u);
    } else if (step?.kind === 'release') {
      pose.hands = world(hands, ...BELT_PLATE);
      pose.grip = lerp(GRIP_W, GRIP_W + 0.04, ease(u));
      pose.lean = 0.36;
      pose.crouch = 0.07;
    } else if (step?.kind === 'withdraw') {
      world(a, ...BELT_PLATE);
      local(b, HANDS_REST);
      pose.hands = toward(a, b, u);
      pose.grip = lerp(GRIP_W + 0.04, HANDS_DOWN_W, ease(u));
      pose.lean = 0.36 * (1 - ease(u));
      pose.crouch = 0.07 * (1 - ease(u));
    }
    if (operatorRef) operatorRef.current = pose;

    // The fitting she handles: in her hands, turned with her so its long
    // edges stay across her body; on the belt once laid; otherwise in the tote.
    if (inHands.current) {
      if (carrying && pose.hands) {
        inHands.current.position.copy(root.current.worldToLocal(a.copy(pose.hands)));
        inHands.current.rotation.set(0, pose.yaw + Math.PI / 2, Math.PI / 2);
        setOpacity(inHands.current, 1);
      } else setOpacity(inHands.current, 0);
    }
    if (f == null) return 'tote';
    return f >= LAID_AT ? 'belt' : f >= TAKEN_AT ? 'hands' : 'tote';
  };

  // One step of the program, `h` seconds on (see subSteps).
  const advance = (h) => {
    const state = run.current;
    state.urElapsed += h;
    const wholeCycle = TRANSFER_TIME + FASTENING_CYCLE;
    const cycleTime = state.urElapsed % wholeCycle;
    if (cycleTime < TRANSFER_TIME) {
      poseOperator(null, h);
      if (toteTop.current) toteTop.current.visible = true;
      const step = sample(TRANSFER, cycleTime);
      if (ur.groupRef.current) ur.groupRef.current.position.z = -stepRail(step);
      ur.groupRef.current?.updateMatrixWorld(true);
      world(scratch.target, ...stepPoint(step));
      stepAim(scratch.aim, step);
      driveArm(ur, UR_JOINTS, scratch.target, scratch.aim, UR_AXIS);
      idleTool();
      const i = step.index;
      productHeldRef.current = i >= GRIP && i <= RELEASE;
      if (i < GRIP) {
        // Where the operator laid it, waiting for the gripper.
        layOnBelt(carried.current);
        setOpacity(carried.current, 1);
      } else if (i <= RELEASE && ur.toolRef.current) {
        // The raised pad remains against the bit and within its clamp fingers.
        // It turns with the tool from horizontal on the belt to vertical on
        // the door; its centre stays the same distance behind the pad.
        ur.toolRef.current.getWorldPosition(scratch.from);
        scratch.from.addScaledVector(scratch.aim, GRIP_DEPTH);
        carried.current?.position.copy(root.current.worldToLocal(scratch.from));
        if (carried.current) carried.current.rotation.set(0, 0, Math.atan2(-scratch.aim.y, -scratch.aim.x));
        setOpacity(carried.current, 1);
      } else setOpacity(carried.current, 0);
      if (i <= RELEASE) {
        // The last cycle's finished fitting, fading from the door.
        const hasPreviousFitting = state.urElapsed >= wholeCycle;
        setOpacity(mounted.current, hasPreviousFitting ? 1 - Math.min(cycleTime / FADE_OUT, 1) : 0);
        seatScrews(hasPreviousFitting);
      } else {
        setOpacity(mounted.current, 1);
        seatScrews(false);
      }
      presentScrew(presented.current, null, SCREW_TIMES);
    } else {
      // Each screw from the feeder, driven into the fitting on the door; the
      // operator meanwhile brings the next fitting.
      const screwTime = cycleTime - TRANSFER_TIME;
      const where = poseOperator(screwTime, h);
      if (toteTop.current) toteTop.current.visible = where === 'tote';
      if (where === 'belt') {
        layOnBelt(carried.current);
        setOpacity(carried.current, 1);
      } else setOpacity(carried.current, 0);
      const current = Math.floor(screwTime / SCREW_TIMES.cycle);
      const phase = screwTime % SCREW_TIMES.cycle;
      const step = sample(SCREW_PLANS[current].keys, phase);
      const point = stepPoint(step);
      if (ur.groupRef.current) ur.groupRef.current.position.z = -stepRail(step);
      ur.groupRef.current?.updateMatrixWorld(true);
      world(scratch.target, ...point);
      stepAim(scratch.aim, step);
      driveArm(ur, UR_JOINTS, scratch.target, scratch.aim, UR_AXIS);
      spinRef.current = phase >= SCREW_TIMES.contact && phase < SCREW_TIMES.seated;
      screwLoadedRef.current = phase >= SCREW_TIMES.picked && phase < SCREW_TIMES.contact;
      productHeldRef.current = false;
      setOpacity(mounted.current, 1);
      screwRefs.current.forEach((screw, i) => {
        if (!screw) return;
        const hole = screwInHole(i, current, phase, SCREW_TIMES);
        screw.visible = Boolean(hole);
        if (!hole) return;
        screw.position.x = screwLocal(SCREWS[i])[0] + hole.proud;
        if (spinRefs.current[i]) spinRefs.current[i].rotation.y = -hole.turn;
      });
      presentScrew(presented.current, phase, SCREW_TIMES);
    }

    // The Kawasaki works from the other side of the door. Starting its scan
    // only after the fitting is seated makes the hand-off legible and avoids
    // projecting its inspection beam while the part is still being placed.
    const inspect = cycleTime >= MOUNTED_AT;
    if (inspect) {
      if (!state.kawasakiInspecting) state.kawasakiElapsed = 0;
      sweepDoorFaces({ elapsed: state.kawasakiElapsed, kawasaki, world, root, beam, scratch });
      state.kawasakiElapsed += h;
    } else if (beam.current) beam.current.visible = false;
    state.kawasakiInspecting = inspect;
  };

  useFrame(({ clock }) => {
    if (!root.current) return;
    const state = run.current;
    const now = clock.elapsedTime;
    const dt = state.last == null ? 0 : Math.max(0, now - state.last);
    state.last = now;
    if (!active) {
      if (state.wasActive) {
        ur.driveRef.current = null;
        kawasaki.driveRef.current = null;
        state.wasActive = false;
      }
      idleTool();
      // With the cell stopped she simply stands at her place (Workers.js).
      if (operatorRef) operatorRef.current = null;
      state.yaw = null;
      setOpacity(inHands.current, 0);
      if (beam.current) beam.current.visible = false;
      state.kawasakiInspecting = false;
      return;
    }
    const fresh = !state.wasActive;
    if (fresh) {
      state.wasActive = true;
    }
    subSteps(fresh ? 0 : dt, advance);
  }, -1);

  return (
    <group ref={root}>
      {/* The fitting on the belt and on its way to the door, the one on the
          door with its screws, and the one in the operator's hands. */}
      <group ref={carried} visible={false}>
        <FittingBody />
      </group>
      <group ref={mounted} position={[MOUNT[0], MOUNT[2], -MOUNT[1]]} visible={false}>
        <FittingBody />
        {SCREWS.map((at, i) => (
          <ScrewHead
            key={i}
            objectRef={(node) => { screwRefs.current[i] = node; }}
            spinRef={(node) => { spinRefs.current[i] = node; }}
            position={screwLocal(at)}
            rotation={HEAD_OUT}
            transparent
          />
        ))}
      </group>
      <group ref={inHands} visible={false}>
        <FittingBody />
      </group>
      <Tote topRef={toteTop} />
      <ScrewFeeder presentedRef={presented} />
      <InspectionBeam beamRef={beam} />
    </group>
  );
}
