import React, { Suspense, useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const BUS_URL = process.env.PUBLIC_URL + '/assets/bus/bus.glb';
const BUS_SCALE = 0.01;

const BUS_MIN = new THREE.Vector3(-430.5, 202.5005340576172, -120);
const BUS_MAX = new THREE.Vector3(456.20489501953125, 505.3580017089844, 120);

const CHASSIS_COLOR = new THREE.Color('#07132b');
const BODY_COLOR = new THREE.Color('#5c616b'); 
const ROOF_COLOR = new THREE.Color('#d8d9db');

function colorizeAndCenter(geometry) {
  if (geometry.userData.__busPrepared) return geometry;

  const centerX = -(BUS_MIN.x + BUS_MAX.x) / 2;
  const centerZ = -(BUS_MIN.z + BUS_MAX.z) / 2;
  geometry.translate(centerX, -BUS_MIN.y, centerZ);

  const position = geometry.attributes.position;
  const span = BUS_MAX.y - BUS_MIN.y;
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();
  
  for (let i = 0; i < position.count; i++) {
    const t = THREE.MathUtils.clamp(position.getY(i) / span, 0, 1);
    if (t < 0.5) {
      c.copy(CHASSIS_COLOR).lerp(BODY_COLOR, THREE.MathUtils.smoothstep(t, 0, 0.5));
    } else {
      c.copy(BODY_COLOR).lerp(ROOF_COLOR, THREE.MathUtils.smoothstep(t, 0.5, 1));
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const index = geometry.index;
  if (index) {
    geometry.clearGroups();
    const metalIndices = [];
    const glassIndices = [];

    // Y eksenindeki yüksekliğe göre yüzeyleri metal ve cam (pencere) olarak ayırma
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);

      const yA = position.getY(a) / span;
      const yB = position.getY(b) / span;
      const yC = position.getY(c) / span;
      const avgY = (yA + yB + yC) / 3;

      if (avgY > 0.45 && avgY < 0.75) {
        glassIndices.push(a, b, c);
      } else {
        metalIndices.push(a, b, c);
      }
    }

    const combinedIndices = [...metalIndices, ...glassIndices];
    geometry.setIndex(combinedIndices);

    geometry.addGroup(0, metalIndices.length, 0); // Material 0: Metal Gövde
    if (glassIndices.length > 0) {
      geometry.addGroup(metalIndices.length, glassIndices.length, 1); // Material 1: Şeffaf Cam
    }
  }

  geometry.computeVertexNormals();
  geometry.userData.__busPrepared = true;
  return geometry;
}

function BusModel() {
  const { scene } = useGLTF(BUS_URL);
  const mesh = useMemo(() => {
    let found = null;
    scene.traverse((obj) => {
      if (!found && obj.isMesh) found = obj;
    });
    return found;
  }, [scene]);

  useEffect(() => {
    if (mesh) colorizeAndCenter(mesh.geometry);
  }, [mesh]);

  if (!mesh) return null;

  return (
    <mesh
      geometry={mesh.geometry}
      scale={[BUS_SCALE, BUS_SCALE, BUS_SCALE]}
      castShadow={false}
      receiveShadow
    >
      {/* Material 0: Metalik Gövde (Boya ve Clearcoat efekti) */}
      <meshPhysicalMaterial
        attach="material-0"
        vertexColors
        roughness={0.25}
        metalness={0.85}
        clearcoat={1.0}
        clearcoatRoughness={0.1}
      />
      {/* Material 1: Şeffaf Cam */}
      <meshPhysicalMaterial
        attach="material-1"
        color="#000000"
        transmission={0.95}
        opacity={1}
        transparent={true}
        roughness={0.05}
        metalness={0.2}
        ior={1.5}
        thickness={2.0}
      />
    </mesh>
  );
}

/*
 * Loading ramp -- exported as its own <Ramp> component (below) so it can be
 * positioned independently rather than auto-seated against a specific bus.
 *
 * Source: public/assets/bus/bus_ramp.stl, 401k triangles / 20MB -- reduced
 * the same way as the bus body (gltf-transform weld + simplify --ratio 0.15)
 * to bus_ramp.glb, ~80k triangles / 720KB.
 *
 * Unlike bus.glb, this STL is Z-up in its raw data: of the three candidate
 * "up" axes, only Z produces a physically sane ramp (rise/run slope ~15 deg);
 * reading Y as up instead gives a near-vertical 75 deg wall, and X as up gives
 * ~59 deg -- neither walkable. So this bakes the same Z-up -> Y-up fix used
 * for the STL facility props elsewhere in this app (EnvironmentElements.js's
 * MM_TO_M group), just as a one-off geometry.rotateX here since this is the
 * only STL in the bus/ family that needs it (bus.glb's own source was
 * already Y-up). geometry.rotateX/translate below bake that fix plus
 * centering/floor-drop directly into the vertex data; the scale/position/
 * rotation props on <Ramp> handle placement from there.
 */
const RAMP_URL = process.env.PUBLIC_URL + '/assets/bus/bus_ramp.glb';
const RAMP_SCALE = 0.05;

function prepareRamp(geometry) {
  if (geometry.userData.__rampPrepared) return geometry;

  geometry.rotateX(-Math.PI / 2); // raw Z-up -> Y-up düzeltmesi
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  
  // Yalnızca merkezleme ve yere (Y=0, Z=0) oturtma işlemini geometriye işle
  geometry.translate(-(min.x + max.x) / 2, -min.y, -min.z);

  geometry.computeVertexNormals();
  geometry.userData.__rampPrepared = true;
  return geometry;
}

function RampModel({ 
  scale = RAMP_SCALE, 
  position = [7, 10, 1], // RAMP_ATTACH_X bağımlılığı kaldırıldı, merkeze çekildi
  rotation = [1, 2, 1] 
}) {
  const { scene } = useGLTF(RAMP_URL);
  const mesh = useMemo(() => {
    let found = null;
    scene.traverse((obj) => {
      if (!found && obj.isMesh) found = obj;
    });
    return found;
  }, [scene]);

  useEffect(() => {
    if (mesh) prepareRamp(mesh.geometry);
  }, [mesh]);

  if (!mesh) return null;

  return (
    <mesh 
      geometry={mesh.geometry} 
      castShadow={false} 
      receiveShadow
      scale={[scale, scale, scale]}
      position={position}
      rotation={rotation}
    >
      <meshStandardMaterial color="#9a9ea3" roughness={0.55} metalness={0.7} />
    </mesh>
  );
}

// Ramp bileşenini bağımsız olarak dışa aktar
export function Ramp({ show = true, position = [1, 0, 0], rotation = [0, 0, 0], scale = RAMP_SCALE }) {
  if (!show) return null;
  return (
    <Suspense fallback={null}>
      <RampModel scale={scale} position={position} rotation={rotation} />
    </Suspense>
  );
}


useGLTF.preload(BUS_URL);
useGLTF.preload(RAMP_URL);

// Bus bileşeninden Ramp'i çıkar
export default function Bus({ show = true, position = [7, 0, 1], rotation = [0, Math.PI / 2, 0] }) {
  if (!show) return null;
  return (
    <Suspense fallback={null}>
      <group position={position} rotation={rotation}>
        <BusModel />
      </group>
    </Suspense>
  );
}
