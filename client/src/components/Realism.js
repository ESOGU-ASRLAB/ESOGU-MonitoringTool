import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { ARCHITECTURE, LIGHTING } from './scenePalette';
import { applyHallFloorFinish, createHallFloorFinish, HALL_FLOOR } from './hallFloorFinish';

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

const FLOOR_MAPS = [`${BASE}/hall-concrete-albedo.webp`, `${BASE}/hall-concrete-surface.webp`];

export function HallFloor() {
  const [albedo, surface] = useLoader(THREE.TextureLoader, FLOOR_MAPS);
  const finish = useMemo(createHallFloorFinish, []);
  useEffect(() => () => finish.dispose(), [finish]);

  useLayoutEffect(() => {
    albedo.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [albedo, surface]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(HALL_FLOOR.baysX, HALL_FLOOR.baysZ);
      texture.anisotropy = 8;
      texture.needsUpdate = true;
    }
  }, [albedo, surface]);

  return (
    <mesh name="hall-floor" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
      <planeGeometry args={[HALL_FLOOR.width, HALL_FLOOR.length]} />
      {/* The surface map stores height in red and roughness in green. */}
      <meshStandardMaterial name="hall-concrete" {...ARCHITECTURE.floor} map={albedo}
        roughnessMap={surface} bumpMap={surface} bumpScale={0.006} aoMap={finish}
        onBeforeCompile={applyHallFloorFinish} />
    </mesh>
  );
}

// Alpha-to-coverage requires MSAA. The SMAA-only profile uses plain alpha cutouts.
function useCutoutsWithoutCoverage(multisampling) {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    if (multisampling > 0) return;
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
  }, [scene, multisampling]);
}

export function PostEffects() {
  const composerRef = useRef(null);
  const gl = useThree((state) => state.gl);
  const pixels = useThree(({ size, viewport }) => size.width * size.height * viewport.dpr ** 2);
  const supportedSamples = useMemo(() => {
    const context = gl.getContext();
    if (!gl.extensions.has('EXT_color_buffer_float')) return [];
    const samplesFor = (format) => context.getInternalformatParameter(context.RENDERBUFFER, format, context.SAMPLES);
    const color = samplesFor(context.RGBA16F);
    const depth = samplesFor(context.DEPTH_COMPONENT24);
    return [2, 4].filter((samples) => color?.includes(samples) && depth?.includes(samples));
  }, [gl]);
  // The two HDR buffers share a fixed multisample budget as the viewport grows.
  const multisampling = supportedSamples.find((samples) => samples * pixels <= 6_000_000) ?? 0;
  useLayoutEffect(() => {
    const composer = composerRef.current;
    composer.multisampling = multisampling;
    return () => { composer.multisampling = 0; };
  }, [multisampling]);

  useCutoutsWithoutCoverage(multisampling);
  return (
    <EffectComposer ref={composerRef} multisampling={0}>
      <N8AO aoRadius={0.48} distanceFalloff={0.65} intensity={1.15} quality="medium" halfRes />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <SMAA />
    </EffectComposer>
  );
}
