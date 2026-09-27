import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils';
import * as THREE from 'three';
import Prop, { PROP_BASE, fitted } from './Prop';
import { MARKING } from './scenePalette';
import { WORKER_URL, settleMaterials } from './Worker';
import { limb, solveTwoBone } from './limbIK';
import VehicleLamps from './VehicleLamps';

/*
 * A forklift shuttling a loaded pallet up and down the west aisle.
 *
 * The aisle runs along x = -13.3, the centre line of the warehouse's own pallet
 * stacks at z = -22.2..-19.9 and z = 2..4.3. Each half of the loop: drive into
 * the pallet, raise the forks, pivot with the load, drive forks-first to the
 * other end, lower it, back clear of it, wait -- then the same from that end.
 * Every run is forwards; the only reverse is the short back-out that pulls the
 * forks from under a set-down pallet, which no forklift can avoid.
 *
 * Clearances, the truck 3.5 m long over its forks and 1.3 m wide: pivoting
 * with the load sweeps ~1.95 m, so x = -15.25..-11.35 -- clear of the west
 * wall's steel (x = -16.08), the Otokar cell (x >= -7.48) and the workers
 * (x >= -8.6) -- and at the ends z = -19.0 against the south stack's face at
 * -19.9, and 0.9 against the north stack at 2.0.
 */
const LANE_X = -13.3;
const PALLET_S = -18.3; // pallet centre, south drop
const PALLET_N = 0.2; // pallet centre, north drop
const FORK_CENTRE = 1.25; // pallet centre ahead of the truck centre, on the forks
const BACK_OUT = 1.45; // m reversed to clear a set-down pallet
const LIFT = 0.35; // m the forks rise with a load
const SPEED = 1.4; // m/s loaded run
const CREEP = 0.6; // m/s driving in and backing out
const TURN_TIME = 3.4; // s for a 180-degree pivot
const LIFT_TIME = 1.6;
const WAIT = 2.5;
const PALLET_START = [LANE_X, 0, PALLET_S];

const HEIGHT = 2.15; // overall, to the top of the mast
// The model's forks point along its own +z; turned by pi they face -z.
const MODEL_YAW = Math.PI;
/*
 * The fork carriage and forks, in the truck's frame: everything ahead of the
 * mast's front face (z = -0.80) and below the carriage top. Those vertices are
 * lifted in the vertex shader, so the forks really rise.
 */
const FORK_Z = -0.83;
const FORK_TOP_Y = 1.3;

/*
 * The cab, in the truck's frame (forks towards -z), measured off the model:
 * seat cushion about y = 1.25 at x = -0.14, its back at z = 1.0; floor plate
 * about y = 1.05; steering wheel about y = 1.3 at z = 0.05. The driver faces
 * -z, so her LEFT is -x -- [left, right] below.
 */
const SEAT_X = -0.14;
const CAB = {
  hips: [SEAT_X, 1.22, 0.8],
  feet: [[-0.25, 1.08, 0.06], [-0.03, 1.08, 0.06]],
  hands: [[-0.3, 1.42, 0.14], [0.02, 1.42, 0.14]],
  lean: 0.18, // forward lean of the torso over the wheel, rad
};

/*
 * Lamps in the truck's frame (forks -z): work lamps on the overhead guard's
 * front posts, tail and reversing lamps on the counterweight.
 */
const FORKLIFT_LAMPS = [
  ...[-0.36, 0.36].map((x) => ({ kind: 'head', position: [x, 1.86, -0.68], size: [0.12, 0.1, 0.05], facing: [0, 0, -1] })),
  ...[-0.46, 0.46].map((x) => ({ kind: 'tail', position: [x, 0.95, 1.74], size: [0.1, 0.12, 0.03], facing: [0, 0, 1] })),
  ...[-0.3, 0.3].map((x) => ({ kind: 'reverse', position: [x, 0.95, 1.74], size: [0.08, 0.08, 0.03], facing: [0, 0, 1] })),
];

const LINE_OFFSET = 1.75;
const LINE_WIDTH = 0.08;
const LINE_FROM_Z = -19.6;
const LINE_TO_Z = 0.4;

const ease = (u) => (1 - Math.cos(Math.PI * u)) / 2;

const target = new THREE.Vector3();
const pole = new THREE.Vector3();
const hipsWorld = new THREE.Vector3();
const palletAt = new THREE.Vector3();

/*
 * The loop as timed segments. Each gives the truck centre z, its yaw (0 heads
 * -z), the fork lift, whether the pallet rides on the forks, and whether the
 * truck is moving (for the beacon).
 */
function buildTimeline() {
  const sPick = PALLET_S + FORK_CENTRE; // truck centre with the pallet on its forks, heading -z
  const nPick = PALLET_N - FORK_CENTRE; // same at the north end, heading +z
  const sClear = sPick + BACK_OUT;
  const nClear = nPick - BACK_OUT;
  const run = nPick - sPick;
  const seg = (time, fn) => ({ time, fn });
  const lerp = (a, b, u) => a + (b - a) * ease(u);

  const half = (clear, pick, dropPick, yaw0, dir) => [
    seg(BACK_OUT / CREEP, (u) => ({ z: lerp(clear, pick, u), yaw: yaw0, lift: 0, carried: false, moving: true })),
    seg(LIFT_TIME, (u) => ({ z: pick, yaw: yaw0, lift: LIFT * ease(u), carried: true, moving: false })),
    seg(TURN_TIME, (u) => ({ z: pick, yaw: yaw0 + Math.PI * ease(u), lift: LIFT, carried: true, moving: true })),
    seg(run / SPEED, (u) => ({ z: lerp(pick, pick + dir * run, u), yaw: yaw0 + Math.PI, lift: LIFT, carried: true, moving: true })),
    seg(LIFT_TIME, (u) => ({ z: dropPick, yaw: yaw0 + Math.PI, lift: LIFT * (1 - ease(u)), carried: true, moving: false })),
    seg(BACK_OUT / CREEP, (u) => ({ z: lerp(dropPick, dropPick - dir * BACK_OUT, u), yaw: yaw0 + Math.PI, lift: 0, carried: false, moving: true, reversing: true })),
    seg(WAIT, () => ({ z: dropPick - dir * BACK_OUT, yaw: yaw0 + Math.PI, lift: 0, carried: false, moving: false })),
  ];

  // South to north (pallet ends at the north spot), then north to south.
  const segments = [
    ...half(sClear, sPick, nPick, 0, 1),
    ...half(nClear, nPick, sPick, Math.PI, -1),
  ];
  return { segments, total: segments.reduce((sum, s) => sum + s.time, 0) };
}

/*
 * The truck body with liftable forks: each mesh gets a per-vertex flag for
 * "part of the fork carriage", and its vertex shader adds `uLift` metres of
 * rise, expressed in that mesh's own units, to the flagged vertices.
 */
function useLiftingTruck(liftUniform) {
  const { scene } = useGLTF(PROP_BASE + 'forklift.glb');
  const truck = useMemo(() => {
    const holder = fitted(scene, HEIGHT, 'floor', MODEL_YAW);
    holder.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const origin = new THREE.Vector3();
    holder.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.geometry = mesh.geometry.clone();
      const position = mesh.geometry.getAttribute('position');
      const flags = new Float32Array(position.count);
      for (let i = 0; i < position.count; i += 1) {
        v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        flags[i] = v.z < FORK_Z && v.y < FORK_TOP_Y ? 1 : 0;
      }
      mesh.geometry.setAttribute('aFork', new THREE.BufferAttribute(flags, 1));

      inverse.copy(mesh.matrixWorld).invert();
      origin.set(0, 0, 0).applyMatrix4(inverse);
      const up = new THREE.Vector3(0, 1, 0).applyMatrix4(inverse).sub(origin);

      mesh.material = mesh.material.clone();
      mesh.material.onBeforeCompile = (shader) => {
        shader.uniforms.uLift = liftUniform;
        shader.uniforms.uLiftDir = { value: up };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aFork;\nuniform float uLift;\nuniform vec3 uLiftDir;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += aFork * uLift * uLiftDir;');
      };
      mesh.material.customProgramCacheKey = () => 'forklift-lift';
    });
    return holder;
  }, [scene, liftUniform]);

  useEffect(() => () => truck.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    mesh.material.dispose();
  }), [truck]);

  return truck;
}

// A Euro pallet (1.2 x 0.8 m) with a stretch-wrapped load on it.
function Pallet({ palletRef }) {
  const wood = '#b08a5a';
  return (
    <group ref={palletRef} position={PALLET_START}>
      {[-0.35, 0, 0.35].map((x) => (
        <mesh key={`b${x}`} position={[x, 0.05, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.1, 0.1, 1.2]} />
          <meshStandardMaterial color={wood} roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.04, 1.2]} />
        <meshStandardMaterial color={wood} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.76, 0.72, 1.12]} />
        <meshStandardMaterial color="#c8b089" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.77, 0.08, 1.13]} />
        <meshStandardMaterial color="#2060cd" roughness={0.5} />
      </mesh>
    </group>
  );
}

/*
 * The driver: the hall's worker figure, not animated, bent into a seated pose
 * by IK -- thighs and shins onto the floor plate, arms onto the wheel -- and
 * placed so her hips sit on the cushion. She faces the forks.
 */
function Driver() {
  const { scene } = useGLTF(WORKER_URL);
  const figure = useMemo(() => {
    settleMaterials(scene);
    return cloneSkeleton(scene);
  }, [scene]);
  const groupRef = useRef(null);
  const placed = useRef(false);
  const chains = useMemo(() => ({
    hips: figure.getObjectByName('mixamorigHips'),
    spine: figure.getObjectByName('mixamorigSpine'),
    legs: ['Left', 'Right'].map((side) => limb(figure, side, 'leg')),
    arms: ['Left', 'Right'].map((side) => limb(figure, side, 'arm')),
  }), [figure]);

  useFrame(() => {
    const group = groupRef.current;
    const { hips, spine, legs, arms } = chains;
    if (!group || !hips) return;
    const cab = group.parent;
    cab.updateMatrixWorld(true);

    // Once: drop the figure so the hip joint lands on the seat.
    if (!placed.current) {
      hips.getWorldPosition(hipsWorld);
      cab.worldToLocal(hipsWorld);
      // The figure's group is turned by pi, so its x and z run opposite the cab's.
      figure.position.x -= CAB.hips[0] - hipsWorld.x;
      figure.position.y += CAB.hips[1] - hipsWorld.y;
      figure.position.z -= CAB.hips[2] - hipsWorld.z;
      placed.current = true;
      if (spine) spine.rotation.x += CAB.lean;
      cab.updateMatrixWorld(true);
    }

    legs.forEach((bones, i) => {
      if (bones.some((bone) => !bone)) return;
      cab.localToWorld(target.set(...CAB.feet[i]));
      cab.localToWorld(pole.set(CAB.feet[i][0], 2.5, -1.5)); // knees up and forward
      solveTwoBone(...bones, target, pole);
    });
    arms.forEach((bones, i) => {
      if (bones.some((bone) => !bone)) return;
      const [hx] = CAB.hands[i];
      cab.localToWorld(target.set(...CAB.hands[i]));
      // Elbows down and out to their own side of the seat, so the arms never cross.
      cab.localToWorld(pole.set(SEAT_X + (hx - SEAT_X) * 6, 0.9, 0.9));
      solveTwoBone(...bones, target, pole);
    });
  });

  return (
    <group ref={groupRef} rotation={[0, Math.PI, 0]}>
      <primitive object={figure} />
    </group>
  );
}

function ForkliftModel() {
  const truckRef = useRef(null);
  const beaconRef = useRef(null);
  const palletRef = useRef(null);
  const lampRef = useRef('off');
  const liftUniform = useMemo(() => ({ value: 0 }), []);
  const body = useLiftingTruck(liftUniform);
  const { segments, total } = useMemo(buildTimeline, []);

  useFrame(({ clock }) => {
    let t = clock.getElapsedTime() % total;
    let state = null;
    for (const segment of segments) {
      if (t < segment.time) {
        state = segment.fn(t / segment.time);
        break;
      }
      t -= segment.time;
    }
    if (!state) state = segments[segments.length - 1].fn(1);

    const truck = truckRef.current;
    if (truck) {
      truck.position.z = state.z;
      truck.rotation.y = state.yaw;
    }
    liftUniform.value = state.lift;

    const pallet = palletRef.current;
    if (pallet && truck) {
      if (state.carried) {
        truck.updateMatrixWorld(true);
        truck.localToWorld(palletAt.set(0, state.lift, -FORK_CENTRE));
        pallet.position.copy(palletAt);
        pallet.rotation.y = state.yaw;
      } else {
        // Set down: it stays where it was lowered.
        pallet.position.y = 0;
      }
    }

    lampRef.current = state.reversing ? 'reverse' : state.moving ? 'forward' : 'off';

    // The amber beacon flashes while the truck is moving, and holds dim at rest.
    if (beaconRef.current) {
      const on = state.moving && Math.floor(clock.getElapsedTime() * 3) % 2 === 0;
      beaconRef.current.emissiveIntensity = on ? 4 : 0.3;
    }
  });

  return (
    <group>
      <group ref={truckRef} position={[LANE_X, 0, PALLET_S + FORK_CENTRE + BACK_OUT]}>
        <primitive object={body} />
        <Suspense fallback={null}>
          <Driver />
        </Suspense>
        <VehicleLamps lamps={FORKLIFT_LAMPS} modeRef={lampRef} />
        {/* Beacon on the overhead guard's rear bar, whose top is at ~2.02 m (the
            2.15 m overall height is the mast). */}
        <mesh position={[0, 2.08, 1.0]}>
          <cylinderGeometry args={[0.06, 0.07, 0.12, 16]} />
          <meshStandardMaterial ref={beaconRef} color="#ffb020" emissive="#ff9a00" emissiveIntensity={0.3} />
        </mesh>
      </group>
      <Pallet palletRef={palletRef} />
      {/* Cones at the aisle mouth. */}
      {[-LINE_OFFSET, LINE_OFFSET].map((dx) => (
        <Prop key={`cone${dx}`} url={PROP_BASE + 'cone.glb'} height={0.5} position={[LANE_X + dx, 0, LINE_TO_Z + 0.35]} />
      ))}
      {[-LINE_OFFSET, LINE_OFFSET].map((dx) => (
        <mesh key={dx} position={[LANE_X + dx, 0.012, (LINE_FROM_Z + LINE_TO_Z) / 2]} receiveShadow>
          <boxGeometry args={[LINE_WIDTH, 0.01, LINE_TO_Z - LINE_FROM_Z]} />
          <meshStandardMaterial {...MARKING.bay} />
        </mesh>
      ))}
    </group>
  );
}

export default function Forklift() {
  return <Suspense fallback={null}><ForkliftModel /></Suspense>;
}
