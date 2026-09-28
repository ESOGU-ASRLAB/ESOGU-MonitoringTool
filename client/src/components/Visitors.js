import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils';
import * as THREE from 'three';
import { WORKER_URL, holdPose, settleMaterials, workerChains } from './Worker';
import { getPeer, publishPose, usePeers } from './presence';

/*
 * THE OTHER PEOPLE LOOKING AT THE HALL, AS WORKERS STANDING IN IT.
 *
 * Every other open page (presence.js) is drawn as a worker where its viewer
 * is: a headset wearer where they stand, a desktop walker where they walk, and
 * a desktop orbit view on the floor under its camera -- clamped inside the
 * building, since that camera can sit up by the roof. A blue ring and a name
 * tag tell visitors from the hall's own staff (Workers.js).
 */

const WALL_MARGIN = 0.6;
// Poses come at up to 5 Hz; easing towards them at this rate hides the steps.
const FOLLOW_RATE = 6;
// A jump this big is a teleport (or a reconnect), not a walk: cut, don't glide.
const SNAP_DISTANCE_M = 8;
// Below this ground speed the figure stands; the walk clip was authored at 0.8 m/s.
const WALK_SPEED_M_S = 0.3;
const CLIP_SPEED_M_S = 0.8;

const scratch = {
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  euler: new THREE.Euler(0, 0, 0, 'YXZ'),
};
const round2 = (v) => Math.round(v * 100) / 100;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Reports where this page's viewer is. The camera is the headset's during a
 * session and the page's otherwise; either way its heading comes from the YXZ
 * decomposition, which holds when looking straight down. A camera faces -z and
 * a worker +z, hence the half turn.
 */
export function PresenceBroadcaster({ bounds }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  useFrame(() => {
    // In a session the XR camera holds the head pose (see RobotInfoPanel3D).
    const head = gl.xr.isPresenting ? gl.xr.getCamera() : camera;
    head.getWorldPosition(scratch.pos);
    head.getWorldQuaternion(scratch.quat);
    scratch.euler.setFromQuaternion(scratch.quat, 'YXZ');
    const x = THREE.MathUtils.clamp(scratch.pos.x, bounds.minX + WALL_MARGIN, bounds.maxX - WALL_MARGIN);
    const z = THREE.MathUtils.clamp(scratch.pos.z, bounds.minZ + WALL_MARGIN, bounds.maxZ - WALL_MARGIN);
    publishPose(round2(x), round2(z), round2(wrapAngle(scratch.euler.y + Math.PI)), performance.now());
  });
  return null;
}

function makeNameTag(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '600 50px "Segoe UI", Arial, sans-serif';
  const width = Math.min(500, ctx.measureText(text).width + 64);
  ctx.fillStyle = 'rgba(32, 96, 205, 0.92)';
  ctx.beginPath();
  ctx.roundRect((512 - width) / 2, 22, width, 84, 42);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function VisitorModel({ id, label, kind }) {
  const { scene, animations } = useGLTF(WORKER_URL);
  const clone = useMemo(() => {
    settleMaterials(scene);
    return cloneSkeleton(scene);
  }, [scene]);
  const chains = useMemo(() => workerChains(clone), [clone]);
  const groupRef = useRef(null);
  const { actions } = useAnimations(animations, groupRef);
  const actionRef = useRef(null);
  const motion = useRef({ placed: false, speed: 0 });

  const tagText = kind === 'vr' ? `${label} · VR` : label;
  const tag = useMemo(() => makeNameTag(tagText), [tagText]);
  useEffect(() => () => tag.dispose(), [tag]);

  useEffect(() => {
    const action = actions['Armature|mixamo.com|Layer0'] || Object.values(actions)[0];
    actionRef.current = action;
    action?.reset().play();
    return () => {
      action?.stop();
      actionRef.current = null;
    };
  }, [actions]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const pose = getPeer(id)?.pose;
    if (!group || !pose) return;
    const m = motion.current;
    const dx = pose.x - group.position.x;
    const dz = pose.z - group.position.z;
    const distance = Math.hypot(dx, dz);

    if (!m.placed || distance > SNAP_DISTANCE_M) {
      group.position.set(pose.x, 0, pose.z);
      group.rotation.y = pose.yaw;
      m.placed = true;
      m.speed = 0;
    } else {
      const k = 1 - Math.exp(-delta * FOLLOW_RATE);
      group.position.x += dx * k;
      group.position.z += dz * k;
      const step = distance * k;
      m.speed += ((delta > 0 ? step / delta : 0) - m.speed) * Math.min(1, delta * 5);
      // Walking, she faces where she is going; standing, where the viewer looks.
      const facing = m.speed > WALK_SPEED_M_S && distance > 0.05 ? Math.atan2(dx, dz) : pose.yaw;
      group.rotation.y += wrapAngle(facing - group.rotation.y) * Math.min(1, delta * 8);
    }

    const action = actionRef.current;
    if (m.speed > WALK_SPEED_M_S) {
      if (action) {
        action.paused = false;
        action.timeScale = THREE.MathUtils.clamp(m.speed / CLIP_SPEED_M_S, 0.6, 2.5);
      }
    } else {
      if (action) action.paused = true;
      holdPose(group, chains, 'observe');
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={clone} />
      <sprite position={[0, 2.12, 0]} scale={[1.2, 0.3, 1]}>
        <spriteMaterial map={tag} transparent depthWrite={false} />
      </sprite>
      <mesh rotation-x={-Math.PI / 2} position-y={0.015}>
        <ringGeometry args={[0.38, 0.46, 40]} />
        <meshBasicMaterial color="#2060cd" transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Every other visitor with a known pose, as a worker. */
export default function Visitors() {
  const peers = usePeers();
  return peers
    .filter((peer) => peer.pose)
    .map((peer) => (
      <Suspense key={peer.id} fallback={null}>
        <VisitorModel id={peer.id} label={peer.label} kind={peer.kind} />
      </Suspense>
    ));
}
