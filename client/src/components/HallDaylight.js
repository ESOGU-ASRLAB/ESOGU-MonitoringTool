import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { doorOpenness } from './busRoute';
import { LIGHTING, ROOM } from './scenePalette';
import { lightShaftVertex, lightShaftFragment } from './lightShaftShader';

const UP = new THREE.Vector3(0, 1, 0);
const DOOR_LIGHT_X = [-5.95, 5.95];
const WARM_BOUNCE = '#e2d7c6';

function LightShaft({ from, to, width, height, density, meshRef }) {
  const transform = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = start.clone().sub(end);
    return {
      position: start.lerp(end, 0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()),
      length: direction.length(),
    };
  }, [from, to]);
  const uniforms = useMemo(() => ({
    lightColor: { value: new THREE.Color(ROOM.daylight) },
    density: { value: density },
  }), [density]);

  return (
    <mesh ref={meshRef} position={transform.position} quaternion={transform.quaternion} scale={[width, transform.length / 2, height]}
      raycast={() => null} visible={density > 0}>
      <sphereGeometry args={[1, 24, 14]} />
      <shaderMaterial vertexShader={lightShaftVertex} fragmentShader={lightShaftFragment} uniforms={uniforms}
        transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

// Both shutters share a single light rig. Their open phases never overlap in
// the bus route, so the scene's light and shadow counts stay constant.
function ShutterDaylight() {
  const rig = useRef(null);
  const key = useRef(null);
  const bounce = useRef(null);
  const shaft = useRef(null);
  const target = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    if (!rig.current || !key.current || !bounce.current || !shaft.current) return;
    const east = doorOpenness(DOOR_LIGHT_X[1], clock.elapsedTime);
    const west = doorOpenness(DOOR_LIGHT_X[0], clock.elapsedTime);
    const opening = Math.max(east, west);
    rig.current.position.x = east > west ? DOOR_LIGHT_X[1] : DOOR_LIGHT_X[0];
    key.current.intensity = LIGHTING.doorwayKey * opening;
    key.current.shadow.needsUpdate = opening > 0.015;
    bounce.current.intensity = LIGHTING.doorwayBounce * opening;
    shaft.current.visible = opening > 0.08;
    shaft.current.material.uniforms.density.value = LIGHTING.doorwayHaze * opening;
  });

  return (
    <group ref={rig} name="shutter-daylight">
      <primitive object={target} position={[2.7, 0.18, -9.5]} />
      <spotLight ref={key} color={ROOM.daylight} position={[0, 2.8, -24.15]} target={target}
        angle={0.31} penumbra={0.82} distance={27} decay={2} intensity={0} castShadow
        shadow-autoUpdate={false} shadow-mapSize-width={1024} shadow-mapSize-height={1024}
        shadow-camera-near={0.45} shadow-camera-far={27} shadow-radius={2}
        shadow-bias={-0.00022} shadow-normalBias={0.018} />
      <rectAreaLight ref={bounce} color={WARM_BOUNCE} position={[0, 0.3, -22.8]}
        rotation={[-1.16, Math.PI, 0]} width={4.8} height={2.3} intensity={0} />
      <LightShaft meshRef={shaft} from={[0, 2.6, -23.95]} to={[2.2, 0.45, -10.5]}
        width={1.85} height={0.82} density={0} />
    </group>
  );
}

export default function HallDaylight() {
  return (
    <>
      <ShutterDaylight />
      <LightShaft from={[-15.77, 5.85, -11]} to={[-5.8, 1.0, -8]} width={2.9} height={0.75} density={LIGHTING.clerestoryHaze} />
      <LightShaft from={[15.77, 5.85, -4.6]} to={[5.8, 0.95, -1.6]} width={2.9} height={0.75} density={LIGHTING.clerestoryHaze} />
    </>
  );
}
