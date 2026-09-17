import React, { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/*
 * Loader for the Otokar MATISSE cell's Draco-compressed GLB parts.
 *
 * These are converted from Otokar's STEP models by
 * scripts/otokar/build_otokar_meshes.sh -- see README, "Otokar MATISSE cell
 * asset sourcing". Two properties of that conversion matter here:
 *
 *  1. The GLBs are exported in METRES (the converter applies the mm->m factor),
 *     so unlike the STL meshes elsewhere in this project they need no
 *     scale={0.001}. They are also left in their original CAD world
 *     coordinates, which is what lets the separately-exported axis assemblies
 *     line up when mounted at identity.
 *  2. They carry POSITION and indices only, no NORMAL accessor. That is
 *     deliberate: these are machined parts, and smoothing normals across a
 *     milled edge makes them look melted. Rendering with flatShading gives the
 *     correct hard-edged look and keeps the files ~1/3 smaller.
 */

// Self-hosted rather than the gstatic CDN: this deployment is expected to run
// on the shop floor without reliable outbound internet (same reasoning as the
// RoomEnvironment choice in Scene.js).
const DRACO_PATH = process.env.PUBLIC_URL + '/draco/';

export const OTOKAR_MESH_BASE = process.env.PUBLIC_URL + '/meshes/otokar';

export function otokarMeshUrl(group, part, lod = 'hi') {
  return `${OTOKAR_MESH_BASE}/${group}/${lod}/${part}.glb`;
}

export function preloadOtokar(group, part, lod) {
  useGLTF.preload(otokarMeshUrl(group, part, lod), DRACO_PATH);
}

export default function OtokarMesh({
  group,
  part,
  lod = 'hi',
  material,
  position,
  rotation,
  visible = true,
}) {
  const url = otokarMeshUrl(group, part, lod);
  const { scene } = useGLTF(url, DRACO_PATH);

  // useGLTF caches one parsed scene per URL, so the same GLB mounted twice
  // (robot1 and robot2 share no files today, but the LOD pair and any future
  // mirrored part would) must not share a single Object3D -- re-parenting it
  // would yank it out of the first mount. clone() is cheap here because it
  // shares the underlying BufferGeometry.
  const object = useMemo(() => scene.clone(true), [scene]);

  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: material.color,
        metalness: material.metalness,
        roughness: material.roughness,
        flatShading: true,
      }),
    [material.color, material.metalness, material.roughness],
  );

  useMemo(() => {
    object.traverse((child) => {
      if (child.isMesh) {
        child.material = mat;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [object, mat]);

  return <primitive object={object} position={position} rotation={rotation} visible={visible} />;
}
