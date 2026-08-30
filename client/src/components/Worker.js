import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils';

/*
 * Source: public/assets/worker/walking_female.glb -- a single-root, single-
 * skin, single-clip ("Armature|mixamo.com|Layer0", ~1.2s walk cycle) rig
 * exported straight from Blender, scale/orientation already correct as
 * authored (unlike drone.glb, nothing here needs excluding or rescaling).
 *
 * Skinned meshes can't just be Object3D.clone()'d for multiple instances --
 * clone() copies the mesh nodes but each SkinnedMesh's `skeleton.bones` array
 * would still point at the ORIGINAL bone objects, so every clone would share
 * one skeleton and animate in lockstep. SkeletonUtils.clone() is three's own
 * fix: it clones the bone hierarchy too and rewires each SkinnedMesh to its
 * own copy, which is what makes 3 independently-animated instances possible
 * from one loaded GLTF.
 */
const WORKER_URL = process.env.PUBLIC_URL + '/assets/worker/walking_female.glb';
const WALK_CLIP = 'Armature|mixamo.com|Layer0';

function WorkerModel({ from, to, speed, phase }) {
  const { scene, animations } = useGLTF(WORKER_URL);
  const clone = useMemo(() => cloneSkeleton(scene), [scene]);

  const groupRef = useRef(null);
  const { actions } = useAnimations(animations, groupRef);

  useEffect(() => {
    actions[WALK_CLIP]?.reset().play();
  }, [actions]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.getElapsedTime() * speed + phase;
    // Smooth 0..1..0 ping-pong between the two waypoints (eases at each end
    // rather than snapping direction instantly like a raw triangle wave).
    const raw = Math.sin(t);
    const u = (raw + 1) / 2;
    const goingToEnd = Math.cos(t) >= 0;

    const x = from[0] + (to[0] - from[0]) * u;
    const z = from[1] + (to[1] - from[1]) * u;
    group.position.set(x, 0, z);

    // Face the direction of travel. Assumes the rig's rest pose faces +Z
    // (the standard Mixamo/Blender export convention) -- if a walker turns
    // out backwards, add Math.PI here.
    const dx = goingToEnd ? to[0] - from[0] : from[0] - to[0];
    const dz = goingToEnd ? to[1] - from[1] : from[1] - to[1];
    group.rotation.y = Math.atan2(dx, dz);
  });

  return (
    <group ref={groupRef}>
      <primitive object={clone} />
    </group>
  );
}

useGLTF.preload(WORKER_URL);

export default function Worker(props) {
  return (
    <Suspense fallback={null}>
      <WorkerModel {...props} />
    </Suspense>
  );
}
