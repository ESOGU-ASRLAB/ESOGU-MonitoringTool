import React, { Suspense, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export const PROP_BASE = process.env.PUBLIC_URL + '/assets/props/';

/*
 * A ready-made model placed by its REAL size.
 *
 * The props in assets/props come from different authors (see CREDITS.md in
 * that folder) and arrive at every scale going: one is authored in hundreds of
 * thousands of units, several are a few centimetres across under a node scale
 * of 20 or 200. Rather than carry a magic factor per file, each is measured
 * once as loaded and scaled so its bounding box is `height` metres tall.
 *
 * `anchor` says which point of that box lands on `position`:
 *   floor   centred in x/z, standing on y = 0
 *   wall    centred in x, standing on y = 0, its BACK face (-z) at z = 0 --
 *           so after `rotation` turns the prop away from a wall, it sits flat
 *           against it
 * `yaw` turns the model inside that frame, for files whose front does not
 * already face +z.
 */
export function fitted(scene, height, anchor, yaw) {
  const clone = scene.clone(true);
  clone.rotation.y = yaw;
  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const scale = height / Math.max(size.y, 1e-9);
  const centre = box.getCenter(new THREE.Vector3());
  const z = anchor === 'wall' ? box.min.z : centre.z;

  const holder = new THREE.Group();
  clone.position.set(-centre.x, -box.min.y, -z);
  holder.add(clone);
  holder.scale.setScalar(scale);
  holder.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return holder;
}

function PropModel({ url, height, anchor = 'floor', yaw = 0, ...props }) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => fitted(scene, height, anchor, yaw), [scene, height, anchor, yaw]);
  return (
    <group {...props}>
      <primitive object={object} />
    </group>
  );
}

export default function Prop(props) {
  return <Suspense fallback={null}><PropModel {...props} /></Suspense>;
}
