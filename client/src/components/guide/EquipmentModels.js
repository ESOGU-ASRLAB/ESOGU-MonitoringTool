import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';

const MESH_BASE = `${process.env.PUBLIC_URL}/meshes/ur10e`;
const FILES = {
  gripper: ['gripper_body_1.stl', 'gripper_lower_1.stl', 'gripper_upper_1.stl'],
  visionary: ['sick_camera_mo.stl'],
};

// Reuse the geometry already supplied with the robot. Clone before rotating
// and centring: the cached originals must remain in their robot CAD frame.
export function ProjectEquipmentModel({ kind, active }) {
  const source = useLoader(STLLoader, FILES[kind].map((file) => `${MESH_BASE}/${file}`));
  const fingers = useRef([]);
  const geometries = useMemo(() => {
    const rotation = kind === 'gripper'
      ? new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))
      : new THREE.Matrix4().makeRotationY(-Math.PI / 2);
    const copies = source.map((geometry) => geometry.clone().applyMatrix4(rotation));
    const bounds = new THREE.Box3();
    copies.forEach((geometry) => { geometry.computeBoundingBox(); bounds.union(geometry.boundingBox); });
    const center = bounds.getCenter(new THREE.Vector3());
    copies.forEach((geometry) => geometry.translate(-center.x, -bounds.min.y, -center.z));
    return copies;
  }, [source, kind]);
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);
  useFrame(({ clock }) => {
    if (kind !== 'gripper') return;
    const opening = active ? 8 + 8 * Math.sin(clock.elapsedTime * 1.1) : 10;
    if (fingers.current[0]) fingers.current[0].position.x = -opening;
    if (fingers.current[1]) fingers.current[1].position.x = opening;
  });
  return <group scale={.001} dispose={null}>
    {geometries.map((geometry, index) => <group key={index} ref={index > 0 ? (node) => { fingers.current[index - 1] = node; } : undefined}>
      {/* Opening is expressed in the millimetre CAD basis. */}
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={kind === 'visionary' ? '#2589a9' : index ? '#b9c8d0' : '#697d8c'} metalness={.55} roughness={.32} />
      </mesh>
    </group>)}
  </group>;
}

export function VacuumDisplayModel() {
  return <group>
    <mesh castShadow><boxGeometry args={[.2, .17, .12]} /><meshStandardMaterial color="#d4a12a" metalness={.3} roughness={.4} /></mesh>
    <mesh position={[0, .105, 0]}><cylinderGeometry args={[.045, .045, .04, 24]} /><meshStandardMaterial color="#394b56" metalness={.6} roughness={.3} /></mesh>
    <mesh position={[0, -.09, 0]}><boxGeometry args={[.34, .025, .045]} /><meshStandardMaterial color="#8ca5b3" metalness={.7} roughness={.3} /></mesh>
    {[-.12, .12].map((x) => <group key={x} position={[x, -.14, 0]}>
      <mesh><cylinderGeometry args={[.016, .016, .08, 20]} /><meshStandardMaterial color="#bacbd0" metalness={.7} roughness={.3} /></mesh>
      <mesh position={[0, -.055, 0]}><cylinderGeometry args={[.027, .048, .04, 28, 1, true]} /><meshStandardMaterial color="#207da5" roughness={.7} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, -.078, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.047, .006, 8, 28]} /><meshStandardMaterial color="#205466" roughness={.8} /></mesh>
    </group>)}
  </group>;
}

export function QuickChangerDisplayModel() {
  return <group>
    <mesh castShadow><boxGeometry args={[.3, .05, .13]} /><meshStandardMaterial color="#8eabb9" metalness={.65} roughness={.3} /></mesh>
    <mesh position={[0, .05, 0]}><cylinderGeometry args={[.055, .055, .055, 32]} /><meshStandardMaterial color="#d4a12a" metalness={.4} roughness={.35} /></mesh>
    {[-.095, .095].map((x) => <group key={x} position={[x, -.055, 0]}>
      <mesh><cylinderGeometry args={[.052, .052, .06, 28]} /><meshStandardMaterial color="#344e5e" metalness={.6} roughness={.3} /></mesh>
      <mesh position={[0, -.034, 0]}><cylinderGeometry args={[.041, .041, .012, 28]} /><meshStandardMaterial color="#53c7be" metalness={.3} roughness={.3} /></mesh>
    </group>)}
  </group>;
}

// No SEC100 CAD is present in the project. This housing, lens, mount and
// Ethernet connector are a labelled presentation model, not a dimensional CAD.
export function SensingCamDisplayModel() {
  return <group>
    <mesh position={[0, .105, 0]} castShadow><boxGeometry args={[.16, .13, .22]} /><meshStandardMaterial color="#374e5e" metalness={.4} roughness={.36} /></mesh>
    <mesh position={[0, .105, .145]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.052, .058, .07, 32]} /><meshStandardMaterial color="#adc0ca" metalness={.7} roughness={.3} /></mesh>
    <mesh position={[0, .105, .183]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.043, .043, .008, 32]} /><meshStandardMaterial color="#102c42" metalness={.35} roughness={.12} emissive="#076a89" emissiveIntensity={.2} /></mesh>
    <mesh position={[0, .04, 0]}><boxGeometry args={[.11, .025, .13]} /><meshStandardMaterial color="#9bb0bb" metalness={.65} roughness={.3} /></mesh>
    <mesh position={[0, .013, 0]}><cylinderGeometry args={[.026, .03, .04, 24]} /><meshStandardMaterial color="#5d7a8c" metalness={.6} roughness={.3} /></mesh>
    <mesh position={[.045, .105, -.12]}><boxGeometry args={[.035, .03, .022]} /><meshStandardMaterial color="#bdc7c9" metalness={.6} roughness={.4} /></mesh>
    <mesh position={[-.061, .142, .115]}><sphereGeometry args={[.006, 10, 8]} /><meshStandardMaterial color="#65dcb7" emissive="#30ae86" emissiveIntensity={.4} /></mesh>
  </group>;
}
