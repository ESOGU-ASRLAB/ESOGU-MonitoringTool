import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils';
import * as THREE from 'three';
import { limb, solveTwoBone } from './limbIK';
import TeachPendant from './TeachPendant';

export const WORKER_URL = process.env.PUBLIC_URL + '/assets/worker/walking_female.glb';

/*
 * WHY THE HARD HAT CAME AND WENT.
 *
 * All ten materials in this asset -- body, hair, hat, clothes, shoes -- were
 * exported alphaMode BLEND. GLTFLoader turns that into transparent: true with
 * depthWrite: false, so no part of the figure hid any other part: whichever
 * mesh three.js happened to draw last painted over the rest, and the order
 * changed with the camera. The hair landing after the hat is what made the hat
 * vanish, and inner faces of the double-sided clothing showing through is what
 * made the figure look half loaded.
 *
 * None of it needs blending. Measured on the textures themselves: body,
 * bottoms and shoes are fully opaque, and the hat, top, gloves and eyewear use
 * alpha only as a hard 0/255 cut-out around their UV islands. Only the hair
 * cards carry soft alpha. So everything becomes opaque with an alpha cut-out,
 * which writes depth and sorts correctly from any angle, and the hair keeps
 * soft edges through alpha-to-coverage on the antialiased canvas instead of
 * through blending.
 *
 * Materials are shared by every SkeletonUtils clone, so this runs once on the
 * source scene; the transparent check makes it a no-op after that.
 */
const SOFT_ALPHA_MATERIALS = new Set(['Hairmat']);

export function settleMaterials(scene) {
  scene.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of [].concat(object.material)) {
      if (!material.transparent) continue;
      material.transparent = false;
      material.depthWrite = true;
      material.alphaTest = 0.5;
      material.alphaToCoverage = SOFT_ALPHA_MATERIALS.has(material.name);
      material.needsUpdate = true;
    }
  });
}

/*
 * AT THE MACHINE, AND NOT THE SAME LOOP EVERY TIME.
 *
 * A worker has a few STATIONS around the machine she tends. She walks from one
 * to another -- picked at random, never the one she is at -- and at each spends
 * a random while doing one of two things, facing the machine:
 *
 *   pendant   working a teach pendant held in both hands
 *   observe   hands down, watching, her gaze drifting slowly along the machine
 *
 * Every worker has her own seed, so no two share a rhythm and a watcher never
 * sees the same loop come round. While standing the walk animation is paused
 * and the pose is solved onto the legs and arms with IK (limbIK.js); targets
 * are in her own frame, facing +z (so her left is +x).
 */
const FEET = { Left: [0.1, 0.08, 0.03], Right: [-0.1, 0.08, 0.03] };
const KNEES = { Left: [0.1, 0.5, 1.0], Right: [-0.1, 0.5, 1.0] };
const HANDS_DOWN = { Left: [0.21, 0.83, 0.03], Right: [-0.21, 0.83, 0.03] };
const ELBOWS_DOWN = { Left: [0.35, 1.0, -0.6], Right: [-0.35, 1.0, -0.6] };
const POSES = {
  pendant: {
    hands: { Left: [0.13, 1.05, 0.3], Right: [-0.13, 1.05, 0.3] },
    elbows: { Left: [0.5, 0.8, -0.3], Right: [-0.5, 0.8, -0.3] },
  },
  observe: { hands: HANDS_DOWN, elbows: ELBOWS_DOWN },
};
const MODES = [['pendant', 0.55], ['observe', 0.45]];
const DWELL = [5, 14]; // s at a station
const SPEED = [0.68, 0.9]; // m/s walking

const stanceTarget = new THREE.Vector3();
const stancePole = new THREE.Vector3();

function holdPose(group, chains, mode) {
  const pose = POSES[mode];
  group.updateMatrixWorld(true);
  for (const { side, leg, arm } of chains) {
    for (const [bones, target, pole] of [
      [leg, FEET[side], KNEES[side]],
      [arm, pose.hands[side], pose.elbows[side]],
    ]) {
      if (bones.some((bone) => !bone)) continue;
      group.localToWorld(stanceTarget.set(...target));
      group.localToWorld(stancePole.set(...pole));
      solveTwoBone(...bones, stanceTarget, stancePole);
    }
  }
}

// Deterministic per worker, so a reload replays the same (varied) day.
function seededRandom(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (random, [lo, hi]) => lo + (hi - lo) * random();

function pickMode(random, only) {
  if (only) return only[Math.floor(random() * only.length)];
  let roll = random();
  for (const [mode, weight] of MODES) {
    roll -= weight;
    if (roll <= 0) return mode;
  }
  return MODES[0][0];
}

const faceTowards = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);

function WorkerModel({ stations, seed = 1, modes }) {
  const { scene, animations } = useGLTF(WORKER_URL);
  // SkeletonUtils rebinds bones per walker while geometry and textures remain shared.
  const clone = useMemo(() => {
    settleMaterials(scene);
    return cloneSkeleton(scene);
  }, [scene]);
  const groupRef = useRef(null);
  const { actions } = useAnimations(animations, groupRef);
  const actionRef = useRef(null);
  const pendantRef = useRef(null);
  const chains = useMemo(() => ['Left', 'Right'].map((side) => ({
    side,
    leg: limb(clone, side, 'leg'),
    arm: limb(clone, side, 'arm'),
  })), [clone]);
  const random = useMemo(() => seededRandom(seed), [seed]);
  const plan = useRef(null);

  useEffect(() => {
    const action = actions['Armature|mixamo.com|Layer0'] || Object.values(actions)[0];
    actionRef.current = action;
    action?.reset().play();
    return () => {
      action?.stop();
      actionRef.current = null;
    };
  }, [actions]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group || !stations.length) return;
    const now = clock.getElapsedTime();

    // Start at a random station, part-way through a spell there.
    if (!plan.current) {
      const at = Math.floor(random() * stations.length);
      const dwell = between(random, DWELL);
      plan.current = { phase: 'dwell', at, start: now - random() * dwell, dwell, mode: pickMode(random, modes) };
    }
    let p = plan.current;

    if (p.phase === 'dwell' && now - p.start >= p.dwell) {
      let next = Math.floor(random() * (stations.length - 1));
      if (next >= p.at) next += 1;
      const from = stations[p.at].at;
      const to = stations[next].at;
      const speed = between(random, SPEED);
      p = { phase: 'walk', at: p.at, next, start: now, time: Math.hypot(to[0] - from[0], to[1] - from[1]) / speed };
      // Stride keeps pace with the walking speed.
      if (actionRef.current) actionRef.current.timeScale = speed / 0.8;
    } else if (p.phase === 'walk' && now - p.start >= p.time) {
      p = { phase: 'dwell', at: p.next, start: now, dwell: between(random, DWELL), mode: pickMode(random, modes) };
    }
    plan.current = p;

    if (p.phase === 'walk') {
      const from = stations[p.at].at;
      const to = stations[p.next].at;
      const u = (1 - Math.cos(Math.PI * Math.min((now - p.start) / p.time, 1))) / 2;
      group.position.set(from[0] + (to[0] - from[0]) * u, 0, from[1] + (to[1] - from[1]) * u);
      group.rotation.y = faceTowards(from, to);
      if (actionRef.current) actionRef.current.paused = false;
      if (pendantRef.current) pendantRef.current.visible = false;
      return;
    }

    const station = stations[p.at];
    group.position.set(station.at[0], 0, station.at[1]);
    let yaw = faceTowards(station.at, station.look);
    // Watching: the gaze drifts slowly along the machine and back.
    if (p.mode === 'observe') yaw += 0.45 * Math.sin((now - p.start) * 0.5);
    group.rotation.y = yaw;
    if (actionRef.current) actionRef.current.paused = true;
    if (pendantRef.current) pendantRef.current.visible = p.mode === 'pendant';
    holdPose(group, chains, p.mode);
  });

  return (
    <group ref={groupRef}>
      <primitive object={clone} />
      {/* The UR teach pendant, held in both hands with its screen towards her. */}
      <group ref={pendantRef} position={[0, 1.03, 0.32]} rotation={[-0.7, 0, 0]} visible={false}>
        <TeachPendant />
      </group>
    </group>
  );
}

useGLTF.preload(WORKER_URL);

export default function Worker(props) {
  return <Suspense fallback={null}><WorkerModel {...props} /></Suspense>;
}
