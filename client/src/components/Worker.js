import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils';

const WORKER_URL = process.env.PUBLIC_URL + '/assets/worker/walking_female.glb';

function WorkerModel({ from, to, lookAt, speed = 0.9, phase = 0, pause = 2.2 }) {
  const { scene, animations } = useGLTF(WORKER_URL);
  // SkeletonUtils rebinds bones per walker while geometry and textures remain shared.
  const clone = useMemo(() => cloneSkeleton(scene), [scene]);
  const groupRef = useRef(null);
  const { actions } = useAnimations(animations, groupRef);
  const actionRef = useRef(null);

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
    if (!group) return;
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const walkTime = distance / speed;
    const legTime = walkTime + pause;
    const cycle = (clock.getElapsedTime() + phase) % (legTime * 2);
    const returning = cycle >= legTime;
    const progress = (returning ? cycle - legTime : cycle) / walkTime;
    const standing = progress >= 1;
    const eased = (1 - Math.cos(Math.PI * Math.min(progress, 1))) / 2;
    const u = returning ? 1 - eased : eased;
    group.position.set(
      from[0] + (to[0] - from[0]) * u,
      0,
      from[1] + (to[1] - from[1]) * u,
    );
    const dx = standing ? lookAt[0] - group.position.x : (to[0] - from[0]) * (returning ? -1 : 1);
    const dz = standing ? lookAt[1] - group.position.z : (to[1] - from[1]) * (returning ? -1 : 1);
    group.rotation.y = Math.atan2(dx, dz);
    if (actionRef.current) actionRef.current.paused = standing;
  });

  return <group ref={groupRef}><primitive object={clone} /></group>;
}

useGLTF.preload(WORKER_URL);

export default function Worker(props) {
  return <Suspense fallback={null}><WorkerModel {...props} /></Suspense>;
}
