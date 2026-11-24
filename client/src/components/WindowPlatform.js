import React, { Suspense } from 'react';
import { useLoader } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';
import { useRealism } from './realismContext';

const ROOT = process.env.PUBLIC_URL + '/new_usecase';

function Part({ file, color, metalness = 0.55, roughness = 0.42, door = false }) {
  const geometry = useLoader(STLLoader, `${ROOT}/${file}`);
  const realistic = useRealism();
  return (
    // A door leaf is tagged so the inspection cameras (DualDoorInspectionTasks)
    // can find its real surface.
    <mesh geometry={geometry} castShadow receiveShadow userData={door ? { doorSurface: true } : undefined}>
      {door && realistic
        // Realistic: a painted body panel -- white basecoat under a clear
        // lacquer, so the hall's lamps run along the door's curves as they do
        // on a car on the line.
        ? <meshPhysicalMaterial color="#e6e9ec" metalness={0} roughness={0.34} clearcoat={1} clearcoatRoughness={0.04} side={THREE.DoubleSide} />
        : <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} side={THREE.DoubleSide} />}
    </mesh>
  );
}

// The three CAD parts share one metre-scale, Z-up frame. The two door leaves
// meet at local y=1.31; their -x side faces the Kawasaki's inspection rail.
export default function WindowPlatform({ name }) {
  return (
    <group name={name} rotation={[-Math.PI / 2, 0, 0]}>
      <Suspense fallback={null}>
        <Part file="platform.stl" color="#aeb8bf" />
        <Part file="windowlessdoor.optimized.stl" color="#d9e0e4" metalness={0.32} door />
        <Part file="windowdoor.optimized.stl" color="#b9d1da" metalness={0.28} roughness={0.28} door />
      </Suspense>
    </group>
  );
}
