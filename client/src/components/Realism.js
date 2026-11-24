import React, { useEffect, useLayoutEffect } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { ARCHITECTURE, LIGHTING } from './scenePalette';

const BASE = process.env.PUBLIC_URL + '/assets/realism';

// The same photographed industrial interior supplies indirect light to desktop and XR.
export function HallEnvironment({ intensity = LIGHTING.environment }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const hdr = useLoader(RGBELoader, `${BASE}/machine_shop_02_1k.hdr`);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envMap = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = envMap;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      scene.environmentIntensity = 1;
      envMap.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, hdr, intensity]);

  return null;
}

const FLOOR = { width: 32.54, length: 49.16, baysX: 6, baysZ: 8 };

const FLOOR_MAPS = [`${BASE}/hall-concrete-albedo.webp`, `${BASE}/hall-concrete-surface.webp`];

export function HallFloor() {
  const [albedo, surface] = useLoader(THREE.TextureLoader, FLOOR_MAPS);
  useLayoutEffect(() => {
    albedo.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [albedo, surface]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(FLOOR.baysX, FLOOR.baysZ);
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    }
  }, [albedo, surface]);

  return (
    <mesh name="hall-floor" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
      <planeGeometry args={[FLOOR.width, FLOOR.length]} />
      {/* The surface map stores height in red and roughness in green. */}
      <meshStandardMaterial name="hall-concrete" {...ARCHITECTURE.floor} map={albedo}
        roughnessMap={surface} bumpMap={surface} bumpScale={0.009} />
    </mesh>
  );
}

// Alpha-to-coverage requires MSAA. Smooth plain alpha cutouts with SMAA
// while the non-multisampled desktop composer is active.
function useCutoutsWithoutCoverage() {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const changed = new Set();
    const sweep = () => scene.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of [].concat(object.material)) {
        if (!material?.alphaToCoverage || changed.has(material)) continue;
        material.alphaToCoverage = false;
        material.needsUpdate = true;
        changed.add(material);
      }
    });
    sweep();
    const timer = setInterval(sweep, 2000);
    return () => {
      clearInterval(timer);
      changed.forEach((material) => {
        material.alphaToCoverage = true;
        material.needsUpdate = true;
      });
    };
  }, [scene]);
}

export function PostEffects() {
  useCutoutsWithoutCoverage();
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={0.48} distanceFalloff={0.65} intensity={0.85} quality="medium" halfRes />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <SMAA />
    </EffectComposer>
  );
}
