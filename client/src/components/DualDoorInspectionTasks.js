import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { solveIK } from './robotIK';
import { subSteps } from './fasteningShared';

const DEG = 180 / Math.PI;
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
const UR_AXIS = new THREE.Vector3(1, 0, 0);
const KAW_AXIS = new THREE.Vector3(0, 0, 1);
// The tool axis each camera keeps upright (its natural side up, measured), so
// the wrists hold their roll instead of drifting round and flipping. The UR's
// camera hangs off the side of its flange, so with this the flange faces the
// floor and the camera looks across at the door: the arm's most natural pose.
const UR_UP = new THREE.Vector3(0, -1, 0);
const KAW_UP = new THREE.Vector3(1, 0, 0);
const ease = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, u) => a + (b - a) * u;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/*
 * THE INSPECTION: both faces of the installed door, captured station by
 * station on a raster, the way an automated optical inspection cell works --
 * four rows from the top of the door (CAD heights 0.20..1.71) to the bottom
 * and back, five stations along each row (the door runs y 0.09..2.48), the
 * middle one on the seam where the two leaves meet, which is where gap and
 * flush are checked. At each station the camera settles, then captures.
 * Both cameras work the same station at once from opposite faces.
 *
 * Each arm keeps its camera inside a band of heights it reaches comfortably
 * and tilts it to see rows above or below that band, as a real cell does,
 * rather than folding down or stretching up to look square-on. And neither
 * arm is asked to point straight away from its own base at a point just in
 * front of it -- the one place a six-axis arm cannot follow a path, which is
 * what made the Kawasaki fold and flail (measured: 93 mm off its path, its
 * wrist whipping round at 1,100 deg/s): its carriage stands `dock` along the
 * door from the station, and the arm reaches across to it.
 */
const ROWS = [1.5, 1.15, 0.8, 0.45];
const STATIONS = [0.62, 0.93, 1.24, 1.55, 1.86];
const TIMING = { move: 1.2, rowChange: 2.0, back: 2.8, settle: 0.3, capture: 0.55 };
// Per arm: camera plane (CAD x), the face it looks at, its height band, and
// where its carriage stands relative to the station.
const ARMS = {
  kawasaki: { cameraX: -1.85, faceX: -1.4956, band: [0.75, 1.3], dock: -0.3, rail: [-0.2, 2.8] },
  ur: { cameraX: -0.38, faceX: -0.7304, band: [0.9, 1.45], dock: -0.45, rail: [0.06, 2.2] },
};

// One cycle as keys: the time to reach each key, where (station y, spot height h)
// and what the cameras are doing on the way to it.
function buildRaster() {
  const keys = [{ y: STATIONS[0], h: ROWS[0], duration: 0, phase: 'settle' }];
  ROWS.forEach((h, r) => {
    const order = r % 2 ? [...STATIONS].reverse() : STATIONS;
    order.forEach((y, i) => {
      if (r || i) keys.push({ y, h, duration: i === 0 ? TIMING.rowChange : TIMING.move, phase: 'move' });
      keys.push({ y, h, duration: TIMING.settle, phase: 'settle' });
      keys.push({ y, h, duration: TIMING.capture, phase: 'capture' });
    });
  });
  // Up to the start again: the last row ends back at the first station.
  keys.push({ y: STATIONS[0], h: ROWS[0], duration: TIMING.back, phase: 'move' });
  return keys;
}
const RASTER = buildRaster();
const CYCLE = RASTER.reduce((sum, key) => sum + key.duration, 0);

function sampleRaster(elapsed) {
  let t = elapsed % CYCLE;
  for (let i = 1; i < RASTER.length; i += 1) {
    const key = RASTER[i];
    if (t < key.duration) {
      const from = RASTER[i - 1];
      const u = ease(t / key.duration);
      return { y: lerp(from.y, key.y, u), h: lerp(from.h, key.h, u), phase: key.phase, u: t / key.duration, station: `${key.y}:${key.h}` };
    }
    t -= key.duration;
  }
  const last = RASTER[RASTER.length - 1];
  return { y: last.y, h: last.h, phase: 'move', u: 1, station: `${last.y}:${last.h}` };
}

const KIT = {
  ur: { joints: UR_JOINTS, axis: UR_AXIS, upAxis: UR_UP },
  kawasaki: { joints: KAW_JOINTS, axis: KAW_AXIS, upAxis: KAW_UP },
};

// Where an arm's carriage stands, where its camera is and the point on the
// door it looks at, for a spot on the raster (CAD frame).
function armPlan(side, spot) {
  const plan = ARMS[side];
  return {
    rail: clamp(spot.y + plan.dock, plan.rail[0], plan.rail[1]),
    camera: [plan.cameraX, spot.y, clamp(spot.h, plan.band[0], plan.band[1])],
    face: [plan.faceX, spot.y, spot.h],
  };
}

/*
 * The pose each arm starts the raster from (its joints' rotations, radians),
 * and how long it takes to get there. A numerical solver only ever follows the
 * pose it is in, so where it starts decides which of an arm's several ways of
 * reaching the door it uses -- left to itself it settled into ones that ran
 * the shoulders into their limits. These were picked by solving the first
 * station from a grid of starting poses and keeping the one that then follows
 * the whole raster exactly and most calmly. On switching on, both arms move
 * there in joint space, as a robot moves to its program start.
 */
// An arm this far off its path for this long has been knocked onto another
// configuration (a frame long enough to jump the target past the solver);
// both go back to their start poses and begin the raster again.
const OFF_PATH = { metres: 0.02, seconds: 0.6 };
const START = {
  ur: [-0.4535, -1.2091, -1.4461, 1.2157, 1.6347, -2.0202],
  kawasaki: [-1.9345, -0.0465, -1.1068, 1.3227, 1.097, -0.2836],
};
export const CHASSIS_INSPECTION_HOME = Object.fromEntries(Object.entries(START).map(([side, angles]) => [
  side,
  { angles: angles.map((angle, index) => KIT[side].joints[index].toDeg(angle)), rail: armPlan(side, sampleRaster(0)).rail },
]));
const APPROACH = 2.5;

/*
 * What a camera with a ring light shows on the panel it looks at: the square
 * of light where its field of view lands, outlined, and the faint pyramid of
 * that view between lens and panel. The capture strobe flashes all three.
 */
const FIELD = 0.2; // m, side of the square the camera sees on the door
const pyramidGeometry = new THREE.ConeGeometry(1, 1, 4, 1, true).rotateY(Math.PI / 4);
const outlineGeometry = new THREE.RingGeometry((FIELD / 2 - 0.012) * Math.SQRT2, (FIELD / 2) * Math.SQRT2, 4, 1).rotateZ(Math.PI / 4);
const patchGeometry = new THREE.PlaneGeometry(FIELD, FIELD);
const glow = (color, opacity) => (
  <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
);

function ScanBeam({ beamRef, frameRef, color }) {
  return (
    <>
      <mesh ref={beamRef} geometry={pyramidGeometry} visible={false}>{glow(color, 0.1)}</mesh>
      <group ref={frameRef} visible={false}>
        <mesh geometry={patchGeometry}>{glow(color, 0.16)}</mesh>
        <mesh geometry={outlineGeometry} position={[0, 0, 0.001]}>{glow(color, 0.85)}</mesh>
      </group>
    </>
  );
}

export default function DualDoorInspectionTasks({ active, ur, kawasaki }) {
  const root = useRef(null);
  const beams = { ur: useRef(null), kawasaki: useRef(null) };
  const frames = { ur: useRef(null), kawasaki: useRef(null) };
  const run = useRef({ last: null, elapsed: 0, wasActive: false, from: null });
  const doorMeshes = useRef(null);
  const hits = useRef(new Map());
  const scratch = useMemo(() => ({
    target: new THREE.Vector3(), aim: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(),
    direction: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1), upright: new THREE.Vector3(),
    raycaster: new THREE.Raycaster(),
  }), []);
  const arms = { ur, kawasaki };

  const world = (out, x, y, height) => root.current.localToWorld(out.set(x, height, -y));

  // Where this camera's line of sight meets the door's real (curved) surface,
  // found once per station and side.
  const surfaceHit = (side, station, origin, direction) => {
    const key = `${side}:${station}`;
    if (hits.current.has(key)) return hits.current.get(key);
    if (!doorMeshes.current?.length) {
      const found = [];
      root.current.parent?.traverse((object) => { if (object.isMesh && object.userData.doorSurface) found.push(object); });
      if (!found.length) return null;
      doorMeshes.current = found;
    }
    scratch.raycaster.set(origin, direction);
    scratch.raycaster.far = 1.5;
    const [hit] = scratch.raycaster.intersectObjects(doorMeshes.current, false);
    const result = hit ? {
      point: hit.point.clone(),
      normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld),
    } : null;
    if (result && result.normal.dot(direction) > 0) result.normal.negate();
    hits.current.set(key, result);
    return result;
  };

  const ready = (arm) => {
    const objects = arm.jointsRef.current;
    return Boolean(objects && objects.length >= 6 && !objects.some((object) => !object) && arm.toolRef.current && arm.groupRef.current);
  };
  const setRail = (arm, rail) => {
    arm.groupRef.current.position.z = -rail;
    arm.groupRef.current.updateMatrixWorld(true);
  };
  const report = (side, arm) => {
    const { joints } = KIT[side];
    arm.driveRef.current = joints.map((joint, i) => joint.toDeg(arm.jointsRef.current[i].rotation[joint.axis]));
  };

  const moveArm = (side, spot) => {
    const arm = arms[side];
    if (!ready(arm)) return null;
    const { joints, axis, upAxis } = KIT[side];
    const plan = armPlan(side, spot);
    setRail(arm, plan.rail);
    world(scratch.target, ...plan.camera);
    world(scratch.to, ...plan.face);
    scratch.aim.subVectors(scratch.to, scratch.target).normalize();
    scratch.upright.copy(scratch.up).addScaledVector(scratch.aim, -scratch.aim.dot(scratch.up)).normalize();
    solveIK({
      joints: joints.map((joint, i) => ({ ...joint, object: arm.jointsRef.current[i] })), tool: arm.toolRef.current,
      localAxis: axis, target: scratch.target, aim: scratch.aim, upAxis, up: scratch.upright,
    });
    report(side, arm);
    return { origin: scratch.target.clone(), direction: scratch.aim.clone() };
  };

  // Joint-space move from wherever the arm stands to its start pose.
  const approach = (side, u) => {
    const arm = arms[side];
    const from = run.current.from?.[side];
    if (!ready(arm) || !from || !START[side]) return;
    const { joints } = KIT[side];
    setRail(arm, lerp(from.rail, armPlan(side, sampleRaster(0)).rail, u));
    joints.forEach((joint, i) => { arm.jointsRef.current[i].rotation[joint.axis] = lerp(from.angles[i], START[side][i], u); });
    report(side, arm);
  };

  const showCapture = (side, spot, sight) => {
    const arm = arms[side];
    const beam = beams[side].current;
    const frame = frames[side].current;
    if (!beam || !frame) return;
    const stationary = Boolean(spot) && spot.phase !== 'move';
    const hit = stationary && sight && arm.toolRef.current ? surfaceHit(side, spot.station, sight.origin, sight.direction) : null;
    beam.visible = Boolean(hit);
    frame.visible = Boolean(hit);
    if (!hit) return;
    // Settling: a steady beam. Capturing: a short flash, the frame with it.
    const flash = spot.phase === 'capture' ? Math.sin(Math.PI * Math.min(spot.u * 2, 1)) : 0;
    arm.toolRef.current.getWorldPosition(scratch.from);
    root.current.worldToLocal(scratch.from);
    scratch.to.copy(hit.point);
    root.current.worldToLocal(scratch.to);
    scratch.direction.subVectors(scratch.to, scratch.from);
    // The pyramid's apex is its +y end: at the lens, its base on the panel.
    const distance = scratch.direction.length();
    beam.position.copy(scratch.from).add(scratch.to).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(scratch.up, scratch.direction.normalize().negate());
    beam.scale.set(FIELD / 2 * Math.SQRT2, distance, FIELD / 2 * Math.SQRT2);
    beam.material.opacity = 0.07 + 0.2 * flash;
    frame.position.copy(scratch.to).addScaledVector(hit.normal, 0.004);
    frame.quaternion.setFromUnitVectors(scratch.z, hit.normal);
    const [patch, outline] = frame.children;
    patch.material.opacity = 0.14 + 0.5 * flash;
    outline.material.opacity = 0.7 + 0.3 * flash;
  };

  useFrame(({ clock }) => {
    if (!root.current) return;
    const state = run.current;
    const now = clock.elapsedTime;
    const delta = state.last == null ? 0 : Math.max(0, now - state.last);
    state.last = now;
    if (!active) {
      if (state.wasActive) {
        ur.driveRef.current = null;
        kawasaki.driveRef.current = null;
        state.wasActive = false;
      }
      Object.values(beams).forEach((beam) => { if (beam.current) beam.current.visible = false; });
      Object.values(frames).forEach((frame) => { if (frame.current) frame.current.visible = false; });
      return;
    }
    // Remember where each arm stands, to move from there to its start pose.
    const restart = () => {
      state.from = Object.fromEntries(Object.entries(arms).map(([side, arm]) => [side, {
        rail: -arm.groupRef.current.position.z,
        angles: KIT[side].joints.map((joint, i) => arm.jointsRef.current[i].rotation[joint.axis]),
      }]));
      state.elapsed = 0;
      state.offPath = 0;
    };
    const fresh = !state.wasActive;
    if (fresh) {
      if (!ready(ur) || !ready(kawasaki)) return;
      restart();
      state.wasActive = true;
    }

    let shown = null;
    subSteps(fresh ? 0 : delta, (h) => {
      state.elapsed += h;
      if (state.elapsed < APPROACH) {
        const u = ease(state.elapsed / APPROACH);
        approach('ur', u);
        approach('kawasaki', u);
        shown = null;
        return;
      }
      const spot = sampleRaster(state.elapsed - APPROACH);
      shown = { spot, ur: moveArm('ur', spot), kawasaki: moveArm('kawasaki', spot) };
    });
    showCapture('ur', shown?.spot, shown?.ur);
    showCapture('kawasaki', shown?.spot, shown?.kawasaki);

    if (!shown) return;
    const off = ['ur', 'kawasaki'].some((side) => {
      const sight = shown[side];
      return sight && arms[side].toolRef.current.getWorldPosition(scratch.from).distanceTo(sight.origin) > OFF_PATH.metres;
    });
    state.offPath = off ? (state.offPath || 0) + delta : 0;
    if (state.offPath > OFF_PATH.seconds) restart();
  }, -1);

  return (
    <group ref={root}>
      <ScanBeam beamRef={beams.ur} frameRef={frames.ur} color="#38bdf8" />
      <ScanBeam beamRef={beams.kawasaki} frameRef={frames.kawasaki} color="#86efac" />
    </group>
  );
}
