import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { solveIK } from './robotIK';
import { ifarlab } from './inspectionState';

/*
 * THE IFARLAB WORKCELL AT WORK.
 *
 *   UR10e     pick and place: a box rides the conveyor in, the arm hovers over
 *             it and its camera detects it, grips it, carries it down the rail
 *             and sets it on the aluminium table, filling four places before
 *             the table is cleared.
 *   Kawasaki  chassis inspection: the AGV takes it bay by bay along the
 *             chassis; at each it scans the outside, reaches in through a gap
 *             between two shelves, scans inside, marks what it finds, and
 *             backs out.
 *
 * Positions are in the workcell's own frame as the Gazebo world has it -- Z up,
 * metres -- measured off the environment STLs (EnvironmentElements.js):
 *
 *   conveyor   x 0.563..0.921, y -0.398..0.591, belt z 0.843 (rails 0.926)
 *   table      x 0.336..1.056, y 1.965..2.965, top z 0.855
 *   chassis    x -1.496..-0.730, y 0.445..2.025; shelves at z ~0.42, 0.88,
 *              1.17, 1.50 and 1.85, so the open gaps are 0.44..0.86 and
 *              1.19..1.48 (the Kawasaki goes in through the upper one)
 *   UR10e      base on its rail at x -0.147, y = rail position (0..2.4)
 *   Kawasaki   base at x -2.04 on the AGV, shoulder at z 0.73, y = AGV position
 *
 * The arms are driven by numerical IK on their own chains (robotIK.js) towards
 * targets that follow these paths, so the motion is continuous and the tools
 * go where the paths say. The paths keep every approach vertical over the
 * belt and table and horizontal into the chassis, clear of the furniture.
 */
const DEG = 180 / Math.PI;
const smooth = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;

// ---------------------------------------------------------------- UR10e
const CARRY_Z = 1.3;
const PICK = [0.742, 0.25];
const BOX = { w: 0.1, d: 0.1, h: 0.12 };
const BELT_TOP = 0.845; // the belt itself; its side rails stand to 0.926
const TABLE_TOP = 0.855;
const TABLE_SPOTS = [[0.55, 2.2], [0.85, 2.2], [0.55, 2.62], [0.85, 2.62]];
const RAIL_PICK = 0.25;
const RAIL_PLACE = 2.35;
const BOX_START_Y = -0.3;
const BOX_ARRIVES = 2.6; // s into the cycle

/*
 * One UR cycle as keyframes: duration to reach it, rail, tool point, grip
 * (1 open .. 0.15 closed), and what happens on arrival. The table spot is
 * filled in per cycle.
 */
function urKeys([tx, ty]) {
  const graspZ = BELT_TOP + BOX.h / 2;
  const placeZ = TABLE_TOP + BOX.h / 2 + 0.005;
  return [
    { t: 0, rail: RAIL_PICK, p: [0.35, RAIL_PICK, CARRY_Z], grip: 1, state: 'WAITING' },
    { t: 1.8, rail: RAIL_PICK, p: [PICK[0], PICK[1], 1.25], grip: 1, state: 'APPROACH' },
    { t: 1.6, rail: RAIL_PICK, p: [PICK[0], PICK[1], 1.25], grip: 1, state: 'DETECTING', detect: true },
    { t: 1.2, rail: RAIL_PICK, p: [PICK[0], PICK[1], graspZ], grip: 1, state: 'PICKING' },
    { t: 0.6, rail: RAIL_PICK, p: [PICK[0], PICK[1], graspZ], grip: 0.15, state: 'GRIPPING', attach: true },
    { t: 1.0, rail: RAIL_PICK, p: [PICK[0], PICK[1], CARRY_Z], grip: 0.15, state: 'LIFTING' },
    { t: 1.4, rail: RAIL_PICK, p: [0.35, RAIL_PICK, CARRY_Z], grip: 0.15, state: 'CARRYING' },
    { t: 3.0, rail: RAIL_PLACE, p: [0.35, RAIL_PLACE, CARRY_Z], grip: 0.15, state: 'CARRYING' },
    { t: 1.6, rail: RAIL_PLACE, p: [tx, ty, 1.15], grip: 0.15, state: 'PLACING' },
    { t: 1.0, rail: RAIL_PLACE, p: [tx, ty, placeZ], grip: 0.15, state: 'PLACING' },
    { t: 0.6, rail: RAIL_PLACE, p: [tx, ty, placeZ], grip: 1, state: 'RELEASING', release: true },
    { t: 0.8, rail: RAIL_PLACE, p: [tx, ty, 1.2], grip: 1, state: 'RETURNING' },
    { t: 1.4, rail: RAIL_PLACE, p: [0.35, RAIL_PLACE, CARRY_Z], grip: 1, state: 'RETURNING' },
    { t: 3.0, rail: RAIL_PICK, p: [0.35, RAIL_PICK, CARRY_Z], grip: 1, state: 'RETURNING' },
  ];
}
const UR_CYCLE = urKeys([0, 0]).reduce((sum, k) => sum + k.t, 0);

// ------------------------------------------------------------- Kawasaki
const KAW_HOME = [-1.86, 1.05];
const KAW_OUTSIDE_X = -1.64;
const KAW_INSIDE_X = -1.32;
/*
 * Bays along the chassis, all through the upper gap (1.19..1.48): the lower
 * one is below the arm's reach from the AGV -- reaching it level would need
 * the shoulder past its limit.
 */
const KAW_BAYS = [[0.75, 1.33], [1.25, 1.3], [1.75, 1.36], [1.25, 1.33]];

// The first key is where the arm starts (home, at the previous bay); its own
// duration is not used -- each later key's `t` is the time to reach it.
function kawKeys([y, z], fromY) {
  return [
    { t: 0, p: [KAW_HOME[0], fromY, KAW_HOME[1]], state: 'MOVING' },
    { t: 2.5, p: [KAW_HOME[0], y, KAW_HOME[1]], state: 'MOVING' },
    { t: 1.5, p: [KAW_OUTSIDE_X, y, z], state: 'APPROACH' },
    { t: 1.6, p: [KAW_OUTSIDE_X, y, z], state: 'SCANNING', scan: 'outside' },
    { t: 1.6, p: [KAW_INSIDE_X, y, z], state: 'ENTERING', scan: 'inside' },
    { t: 2.8, p: [KAW_INSIDE_X, y, z], state: 'INSPECTING', scan: 'inside', sweep: true },
    { t: 1.4, p: [KAW_OUTSIDE_X - 0.02, y, z], state: 'EXITING' },
    { t: 1.0, p: [KAW_HOME[0], y, KAW_HOME[1]], state: 'CLEAR' },
  ];
}
const KAW_BAY_TIME = kawKeys([0, 0], 0).reduce((sum, k) => sum + k.t, 0);

// Where along a keyframe list we are at time t: the segment and its eased progress.
function sampleKeys(keys, t) {
  let start = 0;
  for (let i = 1; i < keys.length; i += 1) {
    const end = start + keys[i].t;
    if (t < end) return { from: keys[i - 1], to: keys[i], u: smooth((t - start) / keys[i].t), index: i };
    start = end;
  }
  return { from: keys[keys.length - 1], to: keys[keys.length - 1], u: 1, index: keys.length - 1 };
}

// ------------------------------------------------------------ the joints
const UR_JOINTS = [
  { axis: 'z', min: -2 * Math.PI, max: 2 * Math.PI, toDeg: (r) => r * DEG },
  { axis: 'y', min: -Math.PI, max: 0.3, toDeg: (r) => r * DEG },
  { axis: 'y', min: -2.9, max: 2.9, toDeg: (r) => r * DEG },
  { axis: 'y', min: -2 * Math.PI, max: 2 * Math.PI, toDeg: (r) => r * DEG },
  { axis: 'z', min: -2 * Math.PI, max: 2 * Math.PI, toDeg: (r) => -r * DEG },
  { axis: 'y', min: -2 * Math.PI, max: 2 * Math.PI, toDeg: (r) => r * DEG },
];
const UR_START = [0, -95, 100, -95, -90, 0];
const KAW_SIGNS = [-1, 1, -1, 1, -1, 1];
const KAW_JOINTS = KAW_SIGNS.map((sign, i) => ({
  axis: 'z',
  min: [-2.9, -1.8, -2.7, -3.1, -2.5, -3.1][i],
  max: [2.9, 2.4, 2.7, 3.1, 2.5, 3.1][i],
  toDeg: (r) => sign * r * DEG,
}));
const KAW_START = [0, 20, -30, 0, 45, 0];

const DOWN = new THREE.Vector3(0, -1, 0);
const UR_TOOL_AXIS = new THREE.Vector3(1, 0, 0);
const KAW_TOOL_AXIS = new THREE.Vector3(0, 0, 1);
const DETECT_COLOR = '#35d0ff';

const beamMaterial = () => new THREE.MeshBasicMaterial({
  color: DETECT_COLOR, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
  depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
});

/*
 * `ur` and `kawasaki` carry each arm's refs: joints, tool, drive (and grip for
 * the UR), and the group the rail or AGV moves. `active` is the engine switch:
 * off, the arms go back to the manual sliders.
 */
export default function IfarlabTasks({ active, ur, kawasaki }) {
  const root = useRef(null);
  const urBeam = useRef(null);
  const kawBeam = useRef(null);
  const kawSpot = useRef(null);
  const boxRefs = useRef([]);
  const findsGroup = useRef(null);
  const scratch = useMemo(() => ({
    target: new THREE.Vector3(), aim: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(),
    // aimBeam's own working vectors, kept apart from a/b so callers can pass those in.
    beamFrom: new THREE.Vector3(), beamTo: new THREE.Vector3(),
    mid: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
  }), []);
  const run = useRef({ urCycle: -1, kawRound: -1, kawBay: -1, started: false, boxes: [], finds: 0 });
  const materials = useMemo(() => ({
    box: new THREE.MeshStandardMaterial({ color: '#c49a62', roughness: 0.8 }),
    boxDetected: new THREE.MeshStandardMaterial({ color: '#c49a62', emissive: '#38d98a', emissiveIntensity: 0.9, roughness: 0.8 }),
    tape: new THREE.MeshStandardMaterial({ color: '#2060cd', roughness: 0.6 }),
    beamUr: beamMaterial(),
    beamKaw: beamMaterial(),
    spot: new THREE.MeshBasicMaterial({
      color: DETECT_COLOR, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }),
  }), []);

  // Workcell (Z-up) -> world.
  const toWorld = (out, x, y, z) => root.current.localToWorld(out.set(x, z, -y));

  function drive(arm, joints, target, aim, localAxis) {
    const objects = arm.jointsRef.current;
    if (!objects || objects.length < 6 || objects.some((o) => !o) || !arm.toolRef.current) return;
    solveIK({
      joints: joints.map((j, i) => ({ ...j, object: objects[i] })),
      tool: arm.toolRef.current,
      localAxis,
      target,
      aim,
    });
    arm.driveRef.current = joints.map((j, i) => j.toDeg(objects[i].rotation[j.axis]));
  }

  function place(mesh, worldPos) {
    mesh.position.copy(root.current.worldToLocal(worldPos.clone()));
  }

  function aimBeam(mesh, fromWorld, toWorldPos, radius) {
    const { beamFrom: a, beamTo: b, mid, dir } = scratch;
    a.copy(root.current.worldToLocal(fromWorld.clone()));
    b.copy(root.current.worldToLocal(toWorldPos.clone()));
    dir.subVectors(b, a);
    const length = dir.length();
    mid.addVectors(a, b).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.scale.set(radius, length, radius);
    mesh.quaternion.setFromUnitVectors(scratch.up, dir.normalize().negate());
    mesh.visible = true;
  }

  useFrame(({ clock }) => {
    const state = run.current;
    if (!root.current) return;
    if (!active) {
      // Hand the arms back to the sliders.
      if (state.started) {
        ur.driveRef.current = null;
        kawasaki.driveRef.current = null;
        ur.gripRef.current = null;
        state.started = false;
      }
      if (urBeam.current) urBeam.current.visible = false;
      if (kawBeam.current) kawBeam.current.visible = false;
      if (kawSpot.current) kawSpot.current.visible = false;
      return;
    }

    const now = clock.getElapsedTime();
    const { target, aim } = scratch;

    if (!state.started) {
      // Start each arm from a comfortable pose, not whatever the sliders left.
      const urObjects = ur.jointsRef.current || [];
      UR_JOINTS.forEach((j, i) => { if (urObjects[i]) urObjects[i].rotation[j.axis] = (UR_START[i] / DEG) * (j.axis === 'z' && i === 4 ? -1 : 1); });
      const kawObjects = kawasaki.jointsRef.current || [];
      KAW_JOINTS.forEach((j, i) => { if (kawObjects[i]) kawObjects[i].rotation.z = KAW_SIGNS[i] * (KAW_START[i] / DEG); });
      state.started = true;
      state.t0 = now;
    }
    const elapsed = now - state.t0;

    // ---------------------------------------------------------- UR10e
    const cycle = Math.floor(elapsed / UR_CYCLE);
    const ct = elapsed - cycle * UR_CYCLE;
    const spot = TABLE_SPOTS[cycle % TABLE_SPOTS.length];
    const keys = urKeys(spot);
    if (cycle !== state.urCycle) {
      state.urCycle = cycle;
      // A fresh box on the belt; the table is cleared once it is full.
      if (cycle % TABLE_SPOTS.length === 0) state.boxes = [];
      state.boxes = state.boxes.filter((b) => b.onTable);
      state.boxes.push({ onTable: false, held: false, detected: false });
    }
    const { from, to, u, index } = sampleKeys(keys, ct);
    const railY = lerp(from.rail, to.rail, u);
    if (ur.groupRef.current) ur.groupRef.current.position.z = -railY;
    ur.groupRef.current?.updateMatrixWorld(true);
    ur.gripRef.current = lerp(from.grip, to.grip, u);
    toWorld(target, lerp(from.p[0], to.p[0], u), lerp(from.p[1], to.p[1], u), lerp(from.p[2], to.p[2], u));
    drive(ur, UR_JOINTS, target, aim.copy(DOWN), UR_TOOL_AXIS);
    ifarlab.ur = to.state;

    const box = state.boxes[state.boxes.length - 1];
    const attachAt = keys.slice(1).findIndex((k) => k.attach) + 1;
    const releaseAt = keys.slice(1).findIndex((k) => k.release) + 1;
    box.held = index > attachAt && index <= releaseAt;
    if (index > releaseAt && !box.onTable) {
      box.onTable = true;
      box.spot = spot;
      ifarlab.picks += 1;
    }
    box.detected = keys[index].detect || (index > 2 && index <= attachAt);

    // Boxes: riding the belt, in the gripper, or sitting on the table.
    boxRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const b = state.boxes[i];
      mesh.visible = Boolean(b);
      if (!b) return;
      if (b.onTable) {
        place(mesh, toWorld(scratch.a, b.spot[0], b.spot[1], TABLE_TOP + BOX.h / 2));
      } else if (b.held && ur.toolRef.current) {
        ur.toolRef.current.getWorldPosition(scratch.b);
        place(mesh, scratch.b);
      } else {
        const y = lerp(BOX_START_Y, PICK[1], Math.min(ct / BOX_ARRIVES, 1));
        place(mesh, toWorld(scratch.a, PICK[0], y, BELT_TOP + BOX.h / 2));
      }
      mesh.children[0].material = b.detected && !b.onTable ? materials.boxDetected : materials.box;
    });

    // Detection beam, camera to box, while it looks.
    if (urBeam.current) {
      urBeam.current.visible = false;
      if (keys[index].detect && ur.toolRef.current) {
        ur.toolRef.current.getWorldPosition(scratch.b);
        aimBeam(urBeam.current, scratch.b, toWorld(scratch.a, PICK[0], PICK[1], BELT_TOP + BOX.h), 0.12);
      }
    }

    // -------------------------------------------------------- Kawasaki
    const bayIndex = Math.floor(elapsed / KAW_BAY_TIME);
    const bt = elapsed - bayIndex * KAW_BAY_TIME;
    const bay = KAW_BAYS[bayIndex % KAW_BAYS.length];
    const previousBay = KAW_BAYS[(bayIndex + KAW_BAYS.length - 1) % KAW_BAYS.length];
    // The move to a new bay starts from the last one's home point.
    const kKeys = kawKeys(bay, bayIndex === 0 ? bay[0] : previousBay[0]);
    const k = sampleKeys(kKeys, bt);
    // The AGV carries the arm along the chassis; the arm's own sideways sweep
    // inside a bay is the arm's, not the AGV's.
    const agvY = lerp(k.from.p[1], k.to.p[1], k.u);
    if (kawasaki.groupRef.current) kawasaki.groupRef.current.position.z = -agvY;
    kawasaki.groupRef.current?.updateMatrixWorld(true);

    let ky = lerp(k.from.p[1], k.to.p[1], k.u);
    let tilt = 0;
    if (k.to.sweep) {
      ky += Math.sin(bt * 2.2) * 0.1;
      tilt = Math.sin(bt * 1.7) * 0.25;
    } else if (k.to.scan === 'outside') {
      tilt = Math.sin(bt * 3) * 0.2;
    }
    toWorld(target, lerp(k.from.p[0], k.to.p[0], k.u), ky, lerp(k.from.p[2], k.to.p[2], k.u));
    aim.set(1, tilt, 0).normalize(); // workcell +x is world +x
    drive(kawasaki, KAW_JOINTS, target, aim, KAW_TOOL_AXIS);
    ifarlab.kawasaki = k.to.state;

    if (bayIndex !== state.kawBay) {
      state.kawBay = bayIndex;
      if (bayIndex > 0) ifarlab.scans += 1;
      state.foundThisBay = false;
      if (bayIndex % KAW_BAYS.length === 0) findsGroup.current?.clear();
    }

    // Inspection beam from the tool, and what it lands on.
    const scanning = Boolean(k.to.scan) && kawasaki.toolRef.current;
    if (kawBeam.current) kawBeam.current.visible = false;
    if (kawSpot.current) kawSpot.current.visible = false;
    if (scanning) {
      kawasaki.toolRef.current.getWorldPosition(scratch.b);
      // Long enough to read as a scan across the bay, not a stub at the tool.
      const reach = k.to.scan === 'inside' ? 0.65 : 0.55;
      const end = scratch.a.copy(scratch.b).addScaledVector(aim, reach);
      aimBeam(kawBeam.current, scratch.b, end, 0.14);
      place(kawSpot.current, end);
      kawSpot.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aim);
      kawSpot.current.visible = true;
      // One find in some bays, marked where the beam falls mid-sweep.
      if (k.to.sweep && !state.foundThisBay && k.u > 0.5 && (bayIndex * 7) % 3 === 1 && findsGroup.current) {
        state.foundThisBay = true;
        ifarlab.findings += 1;
      }
    }
  }, -1);

  return (
    <group ref={root}>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} ref={(el) => { boxRefs.current[i] = el; }} visible={false}>
          <mesh castShadow receiveShadow material={materials.box}>
            <boxGeometry args={[BOX.w, BOX.h, BOX.d]} />
          </mesh>
          <mesh position={[0, BOX.h / 2 + 0.001, 0]} material={materials.tape}>
            <boxGeometry args={[BOX.w * 0.3, 0.002, BOX.d + 0.002]} />
          </mesh>
        </group>
      ))}
      <mesh ref={urBeam} visible={false} material={materials.beamUr}>
        <coneGeometry args={[1, 1, 20, 1, true]} />
      </mesh>
      <mesh ref={kawBeam} visible={false} material={materials.beamKaw}>
        <coneGeometry args={[1, 1, 20, 1, true]} />
      </mesh>
      <mesh ref={kawSpot} visible={false} material={materials.spot}>
        <circleGeometry args={[0.06, 24]} />
      </mesh>
      <group ref={findsGroup} />
    </group>
  );
}
