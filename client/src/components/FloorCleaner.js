import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils';
import { POLYMER } from './scenePalette';
import * as THREE from 'three';
import { WORKER_URL, settleMaterials } from './Worker';
import { limb, solveTwoBone } from './limbIK';

/*
 * A cleaner pushing a walk-behind floor scrubber up and down the east floor,
 * between the IFARLAB cell's line and the east racking.
 *
 * There is no ride-on scrubber among the free models, and the only person
 * model in the scene is a walking figure -- which is exactly what a
 * walk-behind machine needs, so the operator is the same worker as the rest
 * of the hall (with the same hard-hat fix) and the machine is modelled here.
 *
 * The run is z = 2..18 along x = 13.3: clear of the east racking (x >= 14.97)
 * and of the buses, whose nearest approach is the shuffle's tail at x = 11.7
 * (busRoute.js). At each end the operator swings the machine round and comes
 * back down the same line.
 */
const RUN_X = 13.3;
const RUN_FROM_Z = 2.0;
const RUN_TO_Z = 18.0;
const SPEED = 0.7; // m/s, a slow scrubbing walk
const TURN_TIME = 2.6; // s to swing the machine through 180 degrees

/*
 * Where the hands go, in the operator's frame (she faces +z): the ends of the
 * grip bar. The walk animation swings the arms freely, which read as a figure
 * walking beside the machine with her arms out rather than pushing it, so the
 * arms are solved onto the grip each frame (limbIK.js) while the legs keep the
 * walk. Elbows bend down and out, as they do on a push handle.
 */
const GRIP = [
  { side: 'Left', hand: [0.19, 0.96, 0.4], elbow: [0.8, 0.4, -0.3] },
  { side: 'Right', hand: [-0.19, 0.96, 0.4], elbow: [-0.8, 0.4, -0.3] },
];
const target = new THREE.Vector3();
const pole = new THREE.Vector3();

const BODY = '#30363b';
const TANK = '#1d6fd1';
const METAL = '#9aa1a6';

/*
 * The machine, in the operator's frame: she faces +z, and it runs ahead of
 * her from the handle at z = 0.38 to the nose at z = 1.45.
 */
function Scrubber() {
  return (
    <group>
      {/* Handle: grip bar, control box and the two uprights down to the body. */}
      <mesh position={[0, 0.95, 0.4]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.52, 10]} />
        <meshStandardMaterial color="#1b1e21" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.93, 0.47]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.24, 0.05, 0.13]} />
        <meshStandardMaterial color="#20252a" roughness={0.5} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.75, 0.52]} rotation={[0.62, 0, 0]}>
          <cylinderGeometry args={[0.016, 0.016, 0.5, 8]} />
          <meshStandardMaterial color={METAL} metalness={0.8} roughness={0.35} />
        </mesh>
      ))}

      {/* Body with the solution tank on top. */}
      <mesh position={[0, 0.45, 1.02]} castShadow receiveShadow>
        <boxGeometry args={[0.58, 0.5, 0.86]} />
        <meshStandardMaterial color={BODY} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.78, 1.04]} castShadow>
        <boxGeometry args={[0.54, 0.16, 0.78]} />
        <meshStandardMaterial color={TANK} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.87, 0.86]}>
        <cylinderGeometry args={[0.07, 0.07, 0.03, 20]} />
        <meshStandardMaterial color="#e8b21a" roughness={0.5} />
      </mesh>

      {/* Brush deck under the nose, and the drive wheels at the back. */}
      <mesh position={[0, 0.09, 1.2]}>
        <cylinderGeometry args={[0.31, 0.31, 0.12, 28]} />
        <meshStandardMaterial color="#23272b" roughness={0.6} />
      </mesh>
      {[-0.31, 0.31].map((x) => (
        <mesh key={x} position={[x, 0.13, 0.72]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 0.07, 20]} />
          <meshStandardMaterial {...POLYMER.rubber} />
        </mesh>
      ))}

      {/* Squeegee trailing behind the body, where the operator walks over it. */}
      <mesh position={[0, 0.05, 0.56]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.78, 0.07, 0.05]} />
        <meshStandardMaterial {...POLYMER.rubber} />
      </mesh>
    </group>
  );
}

function CleanerModel() {
  const { scene, animations } = useGLTF(WORKER_URL);
  const operator = useMemo(() => {
    settleMaterials(scene);
    return cloneSkeleton(scene);
  }, [scene]);
  const groupRef = useRef(null);
  const { actions } = useAnimations(animations, groupRef);
  const arms = useMemo(
    () => GRIP.map((grip) => ({ ...grip, bones: limb(operator, grip.side, 'arm') })),
    [operator],
  );

  useEffect(() => {
    const action = actions['Armature|mixamo.com|Layer0'] || Object.values(actions)[0];
    action?.reset().play();
    return () => action?.stop();
  }, [actions]);

  const run = RUN_TO_Z - RUN_FROM_Z;
  const leg = run / SPEED;
  const cycle = (leg + TURN_TIME) * 2;

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.getElapsedTime() % cycle;
    // The figure faces +z at yaw 0, so heading -z is yaw pi.
    let z;
    let yaw;
    if (t < leg) {
      z = RUN_FROM_Z + run * (t / leg);
      yaw = 0;
    } else if (t < leg + TURN_TIME) {
      z = RUN_TO_Z;
      yaw = Math.PI * ((t - leg) / TURN_TIME);
    } else if (t < leg * 2 + TURN_TIME) {
      z = RUN_TO_Z - run * ((t - leg - TURN_TIME) / leg);
      yaw = Math.PI;
    } else {
      z = RUN_FROM_Z;
      yaw = Math.PI + Math.PI * ((t - leg * 2 - TURN_TIME) / TURN_TIME);
    }
    group.position.set(RUN_X, 0, z);
    group.rotation.y = yaw;

    // After the mixer has posed this frame: hands onto the grip.
    group.updateMatrixWorld(true);
    for (const arm of arms) {
      if (arm.bones.some((bone) => !bone)) continue;
      group.localToWorld(target.set(...arm.hand));
      group.localToWorld(pole.set(...arm.elbow));
      solveTwoBone(...arm.bones, target, pole);
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={operator} />
      <Scrubber />
    </group>
  );
}

export default function FloorCleaner() {
  return <Suspense fallback={null}><CleanerModel /></Suspense>;
}
