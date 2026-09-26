import React, { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { MARKING } from './scenePalette';

// Same centres and liveries feed both the parked buses and their floor bays.
export const PARKED_BUSES = Object.freeze([
  { position: [-12.3, 0, -7.0], rotation: Math.PI / 2, livery: 'pearl' },
  { position: [10.5, 0, -5.0], rotation: Math.PI / 2, livery: 'graphite' },
  { position: [2.5, 0, -16.0], rotation: Math.PI / 2, livery: 'forest' },
]);

const BAY_HALF_WIDTH = 1.65;
const BAY_HALF_LENGTH = 5.2;
const LINE_WIDTH = 0.055;

export default function FactoryMarkings() {
  const ref = useRef(null);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const dummy = new THREE.Object3D();
    let index = 0;
    for (const bus of PARKED_BUSES) {
      const [x, , z] = bus.position;
      for (const side of [-1, 1]) {
        dummy.position.set(x + side * BAY_HALF_WIDTH, 0.015, z);
        dummy.scale.set(LINE_WIDTH, 0.012, BAY_HALF_LENGTH * 2);
        dummy.updateMatrix();
        ref.current.setMatrixAt(index++, dummy.matrix);
      }
      for (const end of [-1, 1]) {
        dummy.position.set(x, 0.015, z + end * BAY_HALF_LENGTH);
        dummy.scale.set(BAY_HALF_WIDTH * 2, 0.012, LINE_WIDTH);
        dummy.updateMatrix();
        ref.current.setMatrixAt(index++, dummy.matrix);
      }
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={ref} args={[null, null, PARKED_BUSES.length * 4]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      {/* Paint on concrete, lit like the concrete it is painted on.
          This was a MeshBasicMaterial with toneMapped={false}, which opts out
          of the scene's lighting AND its tone mapping, so the bay lines drew
          at full intensity whatever the hall was doing -- a glowing yellow
          stripe on a grey floor, and the single most game-like thing in the
          frame. A standard material at 1.31:1 against the floor is still
          plainly legible without emitting light. */}
      <meshStandardMaterial
        color={MARKING.bay.color}
        metalness={MARKING.bay.metalness}
        roughness={MARKING.bay.roughness}
      />
    </instancedMesh>
  );
}
