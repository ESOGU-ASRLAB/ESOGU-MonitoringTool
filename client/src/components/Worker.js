import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils';
import * as THREE from 'three';
import { limb, solveTwoBone } from './limbIK';
import TeachPendant from './TeachPendant';
import { useRealism } from './realismContext';

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

export function useWorkerShadows(figure) {
  const desktop = useRealism();
  useEffect(() => {
    figure.traverse((part) => {
      // Omit the soft cutout hair cards from the worker's shadow silhouette.
      if (part.isSkinnedMesh && !SOFT_ALPHA_MATERIALS.has(part.material.name)) {
        part.castShadow = desktop;
      }
    });
  }, [desktop, figure]);
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

// The leg and arm bone chains of one cloned figure, for holdPose.
export function workerChains(clone) {
  return ['Left', 'Right'].map((side) => ({
    side,
    leg: limb(clone, side, 'leg'),
    arm: limb(clone, side, 'arm'),
  }));
}

// `crouch` is how far the figure has been lowered: the feet are lifted back
// by as much, so they stay on the floor and the knees bend.
export function holdPose(group, chains, mode, crouch = 0) {
  const pose = POSES[mode];
  group.updateMatrixWorld(true);
  for (const { side, leg, arm } of chains) {
    for (const [bones, target, pole] of [
      [leg, FEET[side], KNEES[side]],
      [arm, pose.hands[side], pose.elbows[side]],
    ]) {
      if (bones.some((bone) => !bone)) continue;
      group.localToWorld(stanceTarget.set(target[0], target[1] + (bones === leg ? crouch : 0), target[2]));
      group.localToWorld(stancePole.set(...pole));
      solveTwoBone(...bones, stanceTarget, stancePole);
    }
  }
}

// Place each foot from distance travelled, so the stance foot moves backwards
// at the same rate as the body moves forwards. This also works when a route
// eases into and out of a station instead of moving at the clip's fixed speed.
export function walkPose(group, chains, distance, remaining = Infinity) {
  const fade = Math.min(1, distance / 0.18, remaining / 0.18);
  group.updateMatrixWorld(true);
  for (const { side, leg } of chains) {
    if (leg.some((bone) => !bone)) continue;
    const step = (distance + (side === 'Left' ? 0 : 0.32)) % 0.64;
    const swing = step >= 0.32;
    const swingT = swing ? (step - 0.32) / 0.32 : 0;
    const forward = swing ? -0.16 + 0.32 * swingT : 0.16 - step;
    const foot = FEET[side];
    group.localToWorld(stanceTarget.set(
      foot[0],
      foot[1] + (swing ? 0.1 * Math.sin(Math.PI * swingT) * fade : 0),
      foot[2] + forward * fade,
    ));
    group.localToWorld(stancePole.set(...KNEES[side]));
    solveTwoBone(...leg, stanceTarget, stancePole);
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

/*
 * A CHOREOGRAPHED OPERATOR. `scriptRef.current`, when set, is written every
 * frame by her cell's program (DoorFasteningTasks.js) so that what she does
 * stays in step with the robot she works beside:
 *
 *   x, z, yaw          where she stands and faces (world)
 *   walking            on the move: the walk clip runs and the feet are
 *                      placed from `traveled` / `remaining` along the route,
 *                      `speed` her pace
 *   hands, grip        both hands on something: `hands` the point between
 *                      them (world), `grip` how far each is to the side
 *   lean, crouch       bending to reach: forward from the waist (radians) and
 *                      down at the knees (metres)
 *
 * Null hands leave the arms down, as when she stands watching.
 */
function WorkerModel({ stations, seed = 1, modes, assistTargetRef, assistActiveRef, scriptRef }) {
  const { scene, animations } = useGLTF(WORKER_URL);
  // SkeletonUtils rebinds bones per walker while geometry and textures remain shared.
  const clone = useMemo(() => {
    settleMaterials(scene);
    return cloneSkeleton(scene);
  }, [scene]);
  useWorkerShadows(clone);
  const groupRef = useRef(null);
  const { actions } = useAnimations(animations, groupRef);
  const actionRef = useRef(null);
  const pendantRef = useRef(null);
  const chains = useMemo(() => workerChains(clone), [clone]);
  const random = useMemo(() => seededRandom(seed), [seed]);
  const plan = useRef(null);
  const assist = useMemo(() => ({ target: new THREE.Vector3(), hand: new THREE.Vector3(), rest: new THREE.Vector3(), pole: new THREE.Vector3(), blend: 0 }), []);
  const spine = useMemo(() => clone.getObjectByName('mixamorigSpine1'), [clone]);
  const carry = useMemo(() => ({
    hand: new THREE.Vector3(), lateral: new THREE.Vector3(), pole: new THREE.Vector3(),
    axis: new THREE.Vector3(), world: new THREE.Quaternion(), bend: new THREE.Quaternion(),
    before: new THREE.Quaternion(), after: new THREE.Quaternion(), bent: false,
  }), []);

  useEffect(() => {
    const action = actions['Armature|mixamo.com|Layer0'] || Object.values(actions)[0];
    actionRef.current = action;
    action?.reset().play();
    return () => {
      action?.stop();
      actionRef.current = null;
    };
  }, [actions]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group || !stations.length) return;
    const now = clock.getElapsedTime();

    const script = scriptRef?.current;
    if (script) {
      const crouch = script.crouch || 0;
      group.position.set(script.x, -crouch, script.z);
      group.rotation.y = script.yaw;
      if (pendantRef.current) pendantRef.current.visible = false;
      if (actionRef.current) {
        actionRef.current.paused = !script.walking;
        if (script.walking) actionRef.current.timeScale = Math.max(0.5, (script.speed || 0.8) / 0.8);
      }
      if (spine) {
        // Undo last frame's bend first. The clip does animate the spine, but
        // a mixer writes a bone only when the clip's value for it changes, and
        // with the clip paused it does not -- so a bend applied on top every
        // frame piled up into a continuous forward roll.
        if (carry.bent && spine.quaternion.equals(carry.after)) spine.quaternion.copy(carry.before);
        carry.bent = false;
      }
      group.updateMatrixWorld(true);
      if (spine && script.lean) {
        // Forward from the waist, about her own left-right axis.
        carry.before.copy(spine.quaternion);
        carry.axis.set(1, 0, 0).applyQuaternion(group.quaternion);
        spine.getWorldQuaternion(carry.world);
        carry.axis.applyQuaternion(carry.world.invert());
        spine.quaternion.multiply(carry.bend.setFromAxisAngle(carry.axis, script.lean));
        carry.after.copy(spine.quaternion);
        carry.bent = true;
      }
      if (script.walking) walkPose(group, chains, script.traveled, script.remaining);
      else holdPose(group, chains, 'observe', crouch);
      if (script.hands) {
        // Her left is +x in her own frame.
        carry.lateral.set(1, 0, 0).applyQuaternion(group.quaternion);
        for (const { side, arm } of chains) {
          if (arm.some((bone) => !bone)) continue;
          const sign = side === 'Left' ? 1 : -1;
          carry.hand.copy(script.hands).addScaledVector(carry.lateral, sign * script.grip);
          group.localToWorld(carry.pole.set(sign * 0.5, 0.8, -0.2));
          solveTwoBone(...arm, carry.hand, carry.pole);
        }
      }
      return;
    }

    const assisting = Boolean(assistActiveRef?.current && assistTargetRef?.current);
    if (assisting || (assist.blend > 0 && assistTargetRef?.current)) {
      assistTargetRef.current.getWorldPosition(assist.target);
      assist.blend = THREE.MathUtils.clamp(assist.blend + (assisting ? 1 : -1) * delta * 4, 0, 1);
      // Keep the feet and torso oriented toward the work. Turning the entire
      // figure toward each moving screw point pivots the shoes across the
      // floor; the arms can follow the handle from this planted stance.
      group.position.set(stations[0].at[0], 0, stations[0].at[1]);
      group.rotation.y = faceTowards(stations[0].at, stations[0].look);
      if (actionRef.current) actionRef.current.paused = true;
      if (pendantRef.current) pendantRef.current.visible = false;
      holdPose(group, chains, 'observe');
      for (const { side, arm } of chains) {
        if (arm.some((bone) => !bone)) continue;
        const sign = side === 'Left' ? 1 : -1;
        arm[2].getWorldPosition(assist.rest);
        assist.hand.copy(assist.target);
        assist.hand.z += sign * 0.07;
        assist.hand.lerpVectors(assist.rest, assist.hand, assist.blend);
        group.localToWorld(assist.pole.set(sign * 0.45, 1.05, -0.25));
        solveTwoBone(...arm, assist.hand, assist.pole);
      }
      return;
    }

    // Start at a random station, part-way through a spell there.
    if (!plan.current) {
      const at = Math.floor(random() * stations.length);
      const dwell = between(random, DWELL);
      plan.current = { phase: 'dwell', at, start: now - random() * dwell, dwell, mode: pickMode(random, modes) };
    }
    let p = plan.current;

    if (p.phase === 'dwell' && now - p.start >= p.dwell && stations.length > 1) {
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
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const u = (1 - Math.cos(Math.PI * Math.min((now - p.start) / p.time, 1))) / 2;
      group.position.set(from[0] + (to[0] - from[0]) * u, 0, from[1] + (to[1] - from[1]) * u);
      group.rotation.y = faceTowards(from, to);
      if (actionRef.current) actionRef.current.paused = false;
      if (pendantRef.current) pendantRef.current.visible = false;
      walkPose(group, chains, length * u, length * (1 - u));
      return;
    }

    const station = stations[p.at];
    group.position.set(station.at[0], 0, station.at[1]);
    let yaw = faceTowards(station.at, station.look);
    // Patrol workers turn to watch the machine; fixed assistants stay planted.
    if (p.mode === 'observe' && stations.length > 1) yaw += 0.45 * Math.sin((now - p.start) * 0.5);
    group.rotation.y = yaw;
    if (actionRef.current) actionRef.current.paused = true;
    if (pendantRef.current) pendantRef.current.visible = p.mode === 'pendant';
    holdPose(group, chains, p.mode);
  });

  return (
    <group name={`worker-${seed}`} ref={groupRef}>
      <primitive object={clone} />
      {/* Turn the screen outwards and slightly up so visitors can read it. */}
      <group ref={pendantRef} position={[0, 1.03, 0.32]} rotation={[-0.4, Math.PI, 0]} visible={false}>
        <TeachPendant />
      </group>
    </group>
  );
}

useGLTF.preload(WORKER_URL);

export default function Worker(props) {
  return <Suspense fallback={null}><WorkerModel {...props} /></Suspense>;
}
