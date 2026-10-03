import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { solveIK } from './robotIK';
import { SCREW_POINTS, SCREW_FEEDER, SCREW_SUPPLY } from './windowUsecaseLayout';
import { screwTraining } from './training/screwTraining';

const DEG = 180 / Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const UR_JOINTS = [
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
// The source table is x .336..1.056, y 1.965..2.965, top 0.855 m.
const SCREWS = SCREW_POINTS;
const FEEDER = SCREW_FEEDER;
const UR_CYCLE = 7.5;
const INSPECTION = [[0.48, 1.18], [0.95, 0.9], [1.65, 1.22], [2.12, 0.92]];
const UR_AXIS = new THREE.Vector3(1, 0, 0);
const KAW_AXIS = new THREE.Vector3(0, 0, 1);
const DOWN = new THREE.Vector3(0, -1, 0);
const INTO_DOOR = new THREE.Vector3(1, 0, 0);

function sample(keys, elapsed) {
  let start = 0;
  for (let i = 1; i < keys.length; i += 1) {
    const end = start + keys[i].duration;
    if (elapsed < end) return { from: keys[i - 1], to: keys[i], u: ease((elapsed - start) / keys[i].duration), index: i };
    start = end;
  }
  return { from: keys[keys.length - 1], to: keys[keys.length - 1], u: 1, index: keys.length - 1 };
}

function Screw({ at, meshRef }) {
  return (
    <group position={[at[0], 0.896, -at[1]]}>
      <mesh position={[0, -0.003, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.002, 16]} />
        <meshStandardMaterial color="#26323b" metalness={0.55} roughness={0.5} />
      </mesh>
      <group ref={meshRef} visible={false}>
        <mesh castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.012, 12]} />
          <meshStandardMaterial color="#b9c4cb" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.007, 0]}>
          <boxGeometry args={[0.013, 0.002, 0.002]} />
          <meshStandardMaterial color="#313e47" metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

// An independent program for the north cell. The original pick/place and
// chassis inspection continue to use their own task engine and telemetry.
export default function WindowUsecaseTasks({ active, ur, kawasaki, spinRef, screwLoadedRef, assistantActiveRef }) {
  const root = useRef(null);
  const beam = useRef(null);
  const screwRefs = useRef([]);
  const feederRefs = useRef([]);
  const run = useRef({ last: null, elapsed: 0, urElapsed: 0, wasActive: false });
  const scratch = useMemo(() => ({
    target: new THREE.Vector3(), aim: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(),
    mid: new THREE.Vector3(), direction: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
  }), []);

  const world = (out, x, y, height) => root.current.localToWorld(out.set(x, height, -y));
  const drive = (arm, joints, target, aim, axis) => {
    const objects = arm.jointsRef.current;
    if (!objects || objects.length < 6 || objects.some((o) => !o) || !arm.toolRef.current) return;
    solveIK({ joints: joints.map((j, i) => ({ ...j, object: objects[i] })), tool: arm.toolRef.current, localAxis: axis, target, aim });
    arm.driveRef.current = joints.map((j, i) => j.toDeg(objects[i].rotation[j.axis]));
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
      spinRef.current = false;
      screwLoadedRef.current = false;
      assistantActiveRef.current = false;
      if (beam.current) beam.current.visible = false;
      if (screwTraining.active) {
        if (ur.groupRef.current) ur.groupRef.current.position.z = -0.25;
        screwRefs.current.forEach((mesh) => { if (mesh) mesh.visible = false; });
        feederRefs.current.forEach((mesh) => { if (mesh) mesh.visible = false; });
      }
      return;
    }
    if (!state.wasActive) {
      state.elapsed = 0;
      state.wasActive = true;
    } else state.elapsed += dt;

    if (screwTraining.active) {
      state.urElapsed = 0;
      ur.driveRef.current = null;
      if (ur.groupRef.current) ur.groupRef.current.position.z = -0.25;
      spinRef.current = false;
      screwLoadedRef.current = false;
      assistantActiveRef.current = false;
      screwRefs.current.forEach((mesh) => { if (mesh) mesh.visible = false; });
      feederRefs.current.forEach((mesh) => { if (mesh) mesh.visible = false; });
    } else {
    state.urElapsed += dt;
    // Collect each screw from the small feeder tray, then fasten a plate held
    // on the black work table. The rail follows the handoff and hole positions.
    const screwIndex = Math.floor(state.urElapsed / UR_CYCLE) % SCREWS.length;
    const screwTime = state.urElapsed % UR_CYCLE;
    const [sx, sy] = SCREWS[screwIndex];
    const urKeys = [
      { duration: 0, point: [FEEDER[0], FEEDER[1], 1.17] },
      { duration: 0.8, point: [FEEDER[0], FEEDER[1], 1.02] },
      { duration: 0.7, point: [FEEDER[0], FEEDER[1], 0.915] },
      { duration: 0.4, point: [FEEDER[0], FEEDER[1], 0.915] },
      { duration: 0.6, point: [FEEDER[0], FEEDER[1], 1.17] },
      { duration: 1.1, point: [sx, sy, 1.17] },
      { duration: 0.8, point: [sx, sy, 0.91] },
      { duration: 1.2, point: [sx, sy, 0.91] },
      { duration: 0.8, point: [sx, sy, 1.17] },
      { duration: 1.1, point: [FEEDER[0], FEEDER[1], 1.17] },
    ];
    const urStep = sample(urKeys, screwTime);
    const urPoint = urStep.from.point.map((value, i) => lerp(value, urStep.to.point[i], urStep.u));
    if (ur.groupRef.current) ur.groupRef.current.position.z = -urPoint[1];
    ur.groupRef.current?.updateMatrixWorld(true);
    world(scratch.target, ...urPoint);
    drive(ur, UR_JOINTS, scratch.target, DOWN, UR_AXIS);
    spinRef.current = urStep.index === 7;
    screwLoadedRef.current = screwTime >= 1.9 && screwTime < 5.6;
    assistantActiveRef.current = Boolean(ur.toolRef.current);
    screwRefs.current.forEach((mesh, i) => {
      if (mesh) mesh.visible = i < screwIndex || (i === screwIndex && screwTime >= 5.6);
    });
    feederRefs.current.forEach((mesh, i) => {
      if (mesh) mesh.visible = i > screwIndex || (i === screwIndex && screwTime < 1.9);
    });
    }

    // The AGV stops at each door region and sweeps the camera toward the -x
    // face, which is the side nearest its rail. No tool passes through a door.
    const bay = Math.floor(state.elapsed / 7.4) % INSPECTION.length;
    const t = state.elapsed % 7.4;
    const [dy, dz] = INSPECTION[bay];
    const kawKeys = [
      { duration: 0, point: [-1.86, dy, 1.05] },
      { duration: 1.4, point: [-1.86, dy, 1.05] },
      { duration: 1.5, point: [-1.69, dy, dz - 0.16] },
      { duration: 2.6, point: [-1.69, dy, dz + 0.16] },
      { duration: 1.2, point: [-1.86, dy, 1.05] },
      { duration: 0.7, point: [-1.86, dy, 1.05] },
    ];
    const kawStep = sample(kawKeys, t);
    const point = kawStep.from.point.map((value, i) => lerp(value, kawStep.to.point[i], kawStep.u));
    if (kawasaki.groupRef.current) kawasaki.groupRef.current.position.z = -dy;
    kawasaki.groupRef.current?.updateMatrixWorld(true);
    world(scratch.target, ...point);
    drive(kawasaki, KAW_JOINTS, scratch.target, INTO_DOOR, KAW_AXIS);
    if (beam.current) {
      beam.current.visible = kawStep.index === 3 && Boolean(kawasaki.toolRef.current);
      if (beam.current.visible) {
        kawasaki.toolRef.current.getWorldPosition(scratch.from);
        world(scratch.to, -1.22, dy, point[2]);
        root.current.worldToLocal(scratch.from);
        root.current.worldToLocal(scratch.to);
        scratch.direction.subVectors(scratch.to, scratch.from);
        beam.current.position.copy(scratch.mid.addVectors(scratch.from, scratch.to).multiplyScalar(0.5));
        beam.current.scale.set(0.014, scratch.direction.length(), 0.014);
        beam.current.quaternion.setFromUnitVectors(scratch.up, scratch.direction.normalize());
      }
    }
  }, -1);

  return (
    <group ref={root}>
      {/* Clamped metal plate, fully inside the black work table's top. */}
      <mesh position={[0.695, 0.869, -2.45]} castShadow receiveShadow>
        <boxGeometry args={[0.44, 0.028, 0.58]} />
        <meshStandardMaterial color="#8daab8" metalness={0.64} roughness={0.35} />
      </mesh>
      {[0.41, 0.98].map((x) => (
        <mesh key={x} position={[x, 0.873, -2.45]} castShadow>
          <boxGeometry args={[0.07, 0.035, 0.11]} />
          <meshStandardMaterial color="#384a57" metalness={0.72} roughness={0.32} />
        </mesh>
      ))}
      {SCREWS.map((at, i) => <Screw key={i} at={at} meshRef={(node) => { screwRefs.current[i] = node; }} />)}
      {/* Screw feeder tray at the near edge of the same table. */}
      <mesh position={[0.44, 0.868, -2.055]} castShadow receiveShadow>
        <boxGeometry args={[0.18, 0.026, 0.16]} />
        <meshStandardMaterial color="#263943" metalness={0.55} roughness={0.42} />
      </mesh>
      {SCREW_SUPPLY.map(([x, y], i) => (
        <group key={i} ref={(node) => { feederRefs.current[i] = node; }} position={[x, 0.892, -y]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.011, 0.011, 0.015, 12]} />
            <meshStandardMaterial color="#bac5cb" metalness={0.82} roughness={0.23} />
          </mesh>
        </group>
      ))}
      <mesh ref={beam} visible={false}>
        <cylinderGeometry args={[1, 1, 1, 12, 1, true]} />
        <meshBasicMaterial color="#48d8ed" transparent opacity={0.3} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
