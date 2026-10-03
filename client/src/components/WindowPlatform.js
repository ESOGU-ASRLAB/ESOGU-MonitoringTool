import React, { Suspense } from 'react';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';

const ROOT = process.env.PUBLIC_URL + '/new_usecase';

function Part({ file, color, metalness = 0.55, roughness = 0.42 }) {
  const geometry = useLoader(STLLoader, `${ROOT}/${file}`);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} side={THREE.DoubleSide} />
    </mesh>
  );
}

// The three CAD parts share one metre-scale, Z-up frame. The two door leaves
// meet at local y=1.31; their -x side faces the Kawasaki's inspection rail.
export default function WindowPlatform() {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <Suspense fallback={null}>
        <Part file="platform.stl" color="#aeb8bf" />
        <Part file="windowlessdoor.optimized.stl" color="#d9e0e4" metalness={0.32} />
        <Part file="windowdoor.optimized.stl" color="#b9d1da" metalness={0.28} roughness={0.28} />
      </Suspense>
    </group>
  );
}
