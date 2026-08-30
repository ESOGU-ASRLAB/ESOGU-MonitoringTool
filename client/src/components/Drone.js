import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';

const DRONE_URL = process.env.PUBLIC_URL + '/assets/drone/drone.glb';
const DRONE_ROOT_NAME = 'Cube';
const PROPELLER_CLIPS = ['Cube.003Action', 'Cube.004Action', 'Cube.005Action.001'];
const DRONE_SCALE = 0.1;

function applyRealisticMaterials(group) {
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;

      // Pervaneler (isimleri 003, 004, 005 içerir) ve ana gövdeyi ayırmak için
      const isPropeller = child.name.includes('003') || child.name.includes('004') || child.name.includes('005');

      if (isPropeller) {
        // Pervaneler: Daha koyu, parlak ve yansıtıcı plastik/metal
        child.material = new THREE.MeshPhysicalMaterial({
          color: '#050505',
          metalness: 0.8,
          roughness: 0.2,
          clearcoat: 1.0,
          clearcoatRoughness: 0.1,
        });
      } else {
        // Ana Gövde: Karbon fiber veya mat metalik hissiyatı (hafif pürüzlü)
        child.material = new THREE.MeshPhysicalMaterial({
          color: '#2a2b2e',
          metalness: 0.6,
          roughness: 0.4,
          clearcoat: 0.5,
          clearcoatRoughness: 0.3,
        });
      }
    }
  });
}

function DroneModel({ radius, height, center, speed, phase, tilt }) {
  const { scene, animations } = useGLTF(DRONE_URL);

  const droneRoot = useMemo(() => {
    const found = scene.getObjectByName(DRONE_ROOT_NAME);
    if (!found) return null;
    
    const clone = found.clone(true);
    applyRealisticMaterials(clone);
    return clone;
  }, [scene]);

  const groupRef = useRef(null);
  const { actions } = useAnimations(animations, groupRef);

  useEffect(() => {
    if (!actions) return;
    for (const name of PROPELLER_CLIPS) {
      actions[name]?.reset().play();
      if (actions[name]) actions[name].timeScale = 8;
    }
  }, [actions]);

  useFrame(({ clock }) => {
    const group = groupRef.current;
    if (!group) return;
    const t = clock.getElapsedTime() * speed + phase;
    const x = center[0] + Math.cos(t) * radius;
    const z = center[2] + Math.sin(t) * radius;
    const y = height + Math.sin(t * 2.3) * 0.15;
    group.position.set(x, y, z);
    group.rotation.y = -t - Math.PI / 2;
    group.rotation.z = Math.sin(t * 2.3) * 0.05;
    group.rotation.x = tilt;
  });

  if (!droneRoot) return null;

  return (
    <group ref={groupRef}>
      <primitive object={droneRoot} scale={[DRONE_SCALE, DRONE_SCALE, DRONE_SCALE]} />
    </group>
  );
}

useGLTF.preload(DRONE_URL);

export default function Drone(props) {
  return (
    <Suspense fallback={null}>
      <DroneModel {...props} />
    </Suspense>
  );
}